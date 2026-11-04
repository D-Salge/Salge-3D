import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { X509Certificate } from 'node:crypto'
import Database from 'better-sqlite3'
import { migrations } from '../lib/migrations.mjs'
import { BAMBU_CA } from '../lib/bambu-ca.mjs'
import { validarConexaoBambu, lerRelatorioBambu, mesclarRelatorioBambu, mensagemErroBambu } from '../lib/bambu-telemetria.mjs'
import { criarMonitorBambu } from '../lib/bambu-conexao.mjs'
import { chaveBambu, cifrarCodigoBambu, decifrarCodigoBambu } from '../lib/bambu-segredos.mjs'
import { listarConfiguracoesBambu, salvarConfiguracaoBambu, opcoesLotesBambu, vincularLoteBambu, obterVinculoBambu } from '../lib/bambu-repositorio.mjs'

const config = { host: '192.168.1.120', serial: 'FAKEP2S000001', accessCode: 'TEST1234' }
const packet = value => Buffer.from(JSON.stringify(value))

test('configuração aceita somente IP local literal e recusa URL, loopback, metadados, DNS e tópicos injetados', () => {
  for (const host of ['192.168.0.50', '10.1.2.3', '172.16.2.3', '172.31.9.9']) assert.equal(validarConexaoBambu({ ...config, host }).host, host)
  for (const host of ['127.0.0.1', 'localhost', '169.254.169.254', '8.8.8.8', '172.32.0.2', '::1', '192.168.1.3:8883', 'https://192.168.1.3', '192.168.1.255']) assert.throws(() => validarConexaoBambu({ ...config, host }), /IP_LOCAL_INVALIDO/)
  assert.throws(() => validarConexaoBambu({ ...config, serial: 'abc/#' }), /SERIAL_INVALIDO/)
  assert.throws(() => validarConexaoBambu({ ...config, accessCode: 'short' }), /CODIGO_INVALIDO/)
})

test('normalização lida com deltas e temperaturas P2S empacotadas, preserva zero e ignora campos estranhos', () => {
  const first = lerRelatorioBambu(packet({print:{command:'push_status',gcode_state:'RUNNING',mc_percent:32,mc_remaining_time:85,subtask_name:'Potes',device:{bed:{info:{temp:(60<<16)|58}},ctc:{info:{temp:34}},extruder:{info:[{id:0,temp:(220<<16)|218}]}},unknown:'secret'}}))
  assert.equal(first.progresso,32); assert.equal(first.bicoAtual,218); assert.equal(first.bicoAlvo,220)
  assert.equal(first.mesaAtual,58); assert.equal(first.mesaAlvo,60); assert.equal(first.camaraAtual,34)
  assert.equal(first.unknown,undefined)
  const delta = lerRelatorioBambu(packet({print:{mc_percent:0,bed_temper:0,print_error:0}}))
  const merged = mesclarRelatorioBambu(first,delta).dados
  assert.equal(merged.progresso,0); assert.equal(merged.mesaAtual,0); assert.equal(merged.bicoAtual,218)
  assert.equal(merged.estado,'RUNNING')
  const legacy = lerRelatorioBambu(packet({print:{nozzle_temper:205.5,bed_target_temper:60}}))
  assert.deepEqual(legacy,{bicoAtual:205.5,mesaAlvo:60})
})

test('pacotes inválidos, excessivos e valores fora de faixa não contaminam sensores', () => {
  for (const data of [Buffer.from('{'),Buffer.alloc(262145),packet({print:null}),packet({print:{command:'gcode_line'}}),packet({print:{mc_percent:-1,mc_remaining_time:Infinity}}),packet({print:{mc_percent:101,nozzle_temper:999}})]) assert.equal(lerRelatorioBambu(data),null)
  assert.equal(lerRelatorioBambu(packet({print:{gcode_state:'NOVO_ESTADO'}})).estado,'NOVO_ESTADO')
})

test('nova impressão limpa métricas da anterior, inclusive ao repetir o mesmo arquivo', () => {
  const old = {estado:'FINISH',arquivo:'mesmo.3mf',progresso:100,camada:500,bicoAtual:40}
  const next = mesclarRelatorioBambu(old,{estado:'RUNNING'})
  assert.equal(next.novoTrabalho,true); assert.equal(next.dados.progresso,undefined)
  assert.equal(next.dados.arquivo,undefined); assert.equal(next.dados.bicoAtual,40)
  assert.equal(mesclarRelatorioBambu({estado:'RUNNING',inicioImpressao:'100',progresso:90},{inicioImpressao:'200'}).novoTrabalho,true)
  assert.equal(mesclarRelatorioBambu({estado:'RUNNING',taskId:'1'},{progresso:3}).novoTrabalho,false)
  assert.equal(mesclarRelatorioBambu({estado:'RUNNING',arquivo:'Potes'},{arquivo:'Tampas'}).novoTrabalho,true)
  assert.equal(mesclarRelatorioBambu({estado:'RUNNING',arquivo:'Potes',progresso:100},{estado:'RUNNING',arquivo:'Potes',progresso:0}).novoTrabalho,true)
})

function mqttFixture(t) {
  let clock=100000, sequence=0, options, ended=false
  const client = new EventEmitter(), subscriptions=[]
  client.subscribe=(topic,opts,cb)=>{subscriptions.push({topic,opts});cb(null,[{topic,qos:0}])}
  client.end=()=>{ended=true}
  client.publish=()=>{throw new Error('Monitor não pode publicar comandos')}
  const monitor=criarMonitorBambu(config,{conectar:opts=>{options=opts;return client},agora:()=>clock,uuid:()=>`session-${++sequence}`})
  t.after(()=>monitor.fechar())
  const send=(data,opts={})=>client.emit('message',`device/${config.serial}/report`,packet({print:data}),opts)
  return {client,monitor,subscriptions,send,options,advance:n=>{clock+=n},ended:()=>ended}
}

test('monitor autentica por TLS validado, assina somente o relatório e nunca publica comandos', t => {
  const f=mqttFixture(t)
  assert.equal(f.options.rejectUnauthorized,true); assert.equal(f.options.servername,config.serial)
  assert.equal(f.options.maxVersion,'TLSv1.2'); assert.equal(f.options.port,8883)
  assert.equal(f.options.password,config.accessCode); assert.ok(f.options.ca.length>=2)
  f.client.emit('connect')
  assert.deepEqual(f.subscriptions.map(s=>s.topic),[`device/${config.serial}/report`])
  assert.equal(f.monitor.snapshot().dadosAtuais,false)
  f.send({gcode_state:'RUNNING',mc_percent:10,mc_remaining_time:20})
  const before=f.monitor.snapshot()
  assert.equal(before.dadosAtuais,true); assert.equal(before.estadoTexto,'Imprimindo')
  f.client.emit('message','device/OTHER/report',packet({print:{mc_percent:99}}),{})
  assert.equal(f.monitor.snapshot().dados.progresso,10)
  f.send({gcode_state:'FINISH',mc_percent:100})
  assert.equal(f.monitor.snapshot().estadoTexto,'Impressão concluída')
  f.send({gcode_state:'RUNNING',mc_percent:0})
  assert.notEqual(f.monitor.snapshot().jobKey,before.jobKey)
  assert.equal(f.monitor.snapshot().dados.minutosRestantes,undefined)
})

test('retained, desconexão, expiração e reconexão não são apresentados como dados atuais', t => {
  const f=mqttFixture(t)
  f.client.emit('connect'); f.send({gcode_state:'FINISH',mc_percent:100},{retain:true})
  assert.equal(f.monitor.snapshot().dadosAtuais,false); assert.equal(f.monitor.snapshot().atualizadoEm,null)
  f.send({gcode_state:'RUNNING',mc_percent:40}); const key=f.monitor.snapshot().jobKey
  f.advance(90001); assert.equal(f.monitor.snapshot().dadosAtuais,false)
  f.client.emit('close'); f.client.emit('connect')
  assert.equal(f.monitor.snapshot().dadosAtuais,false); assert.equal(f.monitor.snapshot().dados.progresso,undefined)
  f.send({gcode_state:'RUNNING',mc_percent:50}); assert.notEqual(f.monitor.snapshot().jobKey,key)
  f.monitor.fechar(); f.send({mc_percent:99}); assert.equal(f.ended(),true); assert.equal(f.monitor.snapshot().dadosAtuais,false)
})

test('falhas usam mensagem sanitizada e nunca serializam o erro bruto com credenciais', t => {
  const f=mqttFixture(t)
  f.client.emit('error',Object.assign(new Error(`password=${config.accessCode}`),{code:'ECONNREFUSED'}))
  assert.match(f.monitor.snapshot().mensagem,/IP e a rede/)
  assert.ok(!JSON.stringify(f.monitor.snapshot()).includes(config.accessCode))
  assert.match(mensagemErroBambu('ERR_TLS_CERT_ALTNAME_INVALID'),/Certificado/)
  assert.match(mensagemErroBambu(5),/recusou o acesso/)
})

test('certificados distribuídos são públicos e podem ser lidos como X509', () => {
  for (const bundle of BAMBU_CA) {
    assert.ok(!bundle.includes('PRIVATE KEY'))
    const certs=bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
    assert.ok(certs?.length)
    for(const pem of certs) assert.ok(new X509Certificate(pem).subject)
  }
})

test('código é cifrado com contexto da empresa e impressora; chave local persiste fora do SQLite', t => {
  const dir=mkdtempSync(join(tmpdir(),'bambu-key-'));t.after(()=>rmSync(dir,{recursive:true,force:true}))
  const dbPath=join(dir,'salge.sqlite')
  assert.throws(()=>chaveBambu(dbPath),/CHAVE_LOCAL_AUSENTE/)
  const key=chaveBambu(dbPath,{criar:true}), cipher=cifrarCodigoBambu(config.accessCode,key,'1:1')
  assert.ok(!cipher.includes(config.accessCode)); assert.equal(decifrarCodigoBambu(cipher,key,'1:1'),config.accessCode)
  assert.deepEqual(chaveBambu(dbPath),key)
  assert.throws(()=>decifrarCodigoBambu(cipher,key,'2:1'),/CODIGO_LOCAL_ILEGIVEL/)
  assert.throws(()=>decifrarCodigoBambu(cipher,key,'1:2'),/CODIGO_LOCAL_ILEGIVEL/)
})

function database(t) {
  const db=new Database(':memory:');t.after(()=>db.close())
  db.pragma('foreign_keys=ON')
  db.exec(`CREATE TABLE tenants(id INTEGER PRIMARY KEY);
    CREATE TABLE impressoras(id INTEGER PRIMARY KEY, tenant_id INTEGER, nome TEXT, ativo INTEGER);
    CREATE TABLE pedidos(id INTEGER PRIMARY KEY, tenant_id INTEGER, nome_da_peca TEXT, numero_orcamento TEXT, orcamento_status TEXT, status TEXT, valor_total_cobrado REAL);
    CREATE TABLE lotes_producao(id INTEGER PRIMARY KEY, tenant_id INTEGER, impressora_id INTEGER, pedido_id INTEGER, codigo TEXT, placa_referencia TEXT, status TEXT, quantidade_produzida REAL);
    CREATE TABLE filamentos(id INTEGER PRIMARY KEY, estoque_gramas REAL);
    INSERT INTO tenants VALUES(1),(2);
    INSERT INTO impressoras VALUES(1,1,'P2S',1),(2,1,'A1 mini',1),(3,2,'P2S outra empresa',1);
    INSERT INTO pedidos VALUES(1,1,'Kit','ORC-001','Aprovado','Imprimindo',100),(2,2,'Kit B','ORC-002','Aprovado','Imprimindo',200);
    INSERT INTO lotes_producao VALUES(1,1,1,1,'L01','Potes','Imprimindo',0),(2,1,2,1,'L02','Tampas','Imprimindo',0),(3,2,3,2,'L03','Outro','Planejado',0),(4,1,NULL,1,'L04','Sem máquina','Cancelado',0);
    INSERT INTO filamentos VALUES(1,1000);`)
  db.exec(migrations.find(m=>m.version===34).sql)
  return db
}

test('configuração e vínculo isolam empresas e máquinas sem alterar pedido, custos ou estoque', t => {
  const db=database(t), input={impressoraId:1,host:config.host,serial:config.serial,codigoCifrado:'cipher'}
  salvarConfiguracaoBambu(db,1,input)
  assert.equal(listarConfiguracoesBambu(db,1).length,1);assert.equal(listarConfiguracoesBambu(db,2).length,0)
  assert.throws(()=>salvarConfiguracaoBambu(db,2,input),/IMPRESSORA_NAO_ENCONTRADA/)
  assert.deepEqual(opcoesLotesBambu(db,1,1).map(l=>l.id),[1])
  for(const loteId of [2,3,4]) assert.throws(()=>vincularLoteBambu(db,1,{impressoraId:1,loteId,referencia:'Plate 1',jobKey:'job-1'}),/LOTE_INVALIDO/)
  vincularLoteBambu(db,1,{impressoraId:1,loteId:1,referencia:'Potes · execução 1',jobKey:'job-1'})
  assert.equal(obterVinculoBambu(db,1,1).pedidoId,1);assert.equal(obterVinculoBambu(db,2,1),null)
  assert.equal(db.prepare('SELECT status FROM pedidos WHERE id=1').get().status,'Imprimindo')
  assert.equal(db.prepare('SELECT quantidade_produzida FROM lotes_producao WHERE id=1').get().quantidade_produzida,0)
  assert.equal(db.prepare('SELECT estoque_gramas FROM filamentos WHERE id=1').get().estoque_gramas,1000)
  assert.equal(db.prepare('SELECT valor_total_cobrado FROM pedidos WHERE id=1').get().valor_total_cobrado,100)
  db.prepare('UPDATE lotes_producao SET impressora_id = 2 WHERE id = 1').run()
  assert.equal(obterVinculoBambu(db,1,1),null)
  salvarConfiguracaoBambu(db,1,{...input,host:'192.168.1.121'})
  assert.equal(obterVinculoBambu(db,1,1),null)
})

test('impede dois cadastros do mesmo serial na empresa, mantém vínculo original em falha de configuração', t => {
  const db=database(t),input={impressoraId:1,host:config.host,serial:config.serial,codigoCifrado:'cipher'}
  salvarConfiguracaoBambu(db,1,input)
  vincularLoteBambu(db,1,{impressoraId:1,loteId:1,referencia:'Plate 1',jobKey:'job-1'})
  assert.throws(()=>salvarConfiguracaoBambu(db,1,{...input,impressoraId:2}),/SERIAL_JA_VINCULADO/)
  assert.equal(obterVinculoBambu(db,1,1).jobKey,'job-1')
})

