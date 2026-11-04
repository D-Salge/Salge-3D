import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { obterResumoVisualDashboard } from '../lib/dashboard-resumo.mjs'

function banco(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.exec(`
    CREATE TABLE recebimentos (tenant_id INTEGER, data_recebimento TEXT, valor REAL, estornado_em TEXT);
    CREATE TABLE filamentos (tenant_id INTEGER, ativo INTEGER, estoque_gramas REAL, peso_rolo_gramas REAL);
    CREATE TABLE impressoras (id INTEGER, tenant_id INTEGER, nome TEXT, modelo TEXT, status TEXT, ativo INTEGER);
    CREATE TABLE pedidos (id INTEGER, tenant_id INTEGER, impressora_id INTEGER, nome_da_peca TEXT, numero_orcamento TEXT,
      orcamento_status TEXT, status TEXT, quantidade REAL, quantidade_produzida REAL, data_pedido TEXT);
    CREATE TABLE lotes_producao (id INTEGER, tenant_id INTEGER, pedido_id INTEGER, impressora_id INTEGER,
      codigo TEXT, status TEXT, quantidade_planejada REAL, quantidade_produzida REAL);
  `)
  return db
}

test('gráfico usa 30 dias completos, preenche zeros e exclui estornos, datas externas e outras empresas', t => {
  const db = banco(t)
  db.exec(`INSERT INTO recebimentos VALUES
    (1,'2026-10-06',100,NULL), (1,'2026-11-04T09:00:00',20,NULL), (1,'2026-11-04',30,NULL),
    (1,'2026-11-04',999,'2026-11-04'), (2,'2026-11-04',500,NULL),
    (1,'2026-10-05',1000,NULL), (1,'2026-11-05',1000,NULL)`)
  db.pragma('query_only = ON')
  const resultado = obterResumoVisualDashboard(db,1,'2026-11-04')
  assert.equal(resultado.dias.length,30)
  assert.deepEqual(resultado.dias[0],{dia:'2026-10-06',valor:100})
  assert.deepEqual(resultado.dias.at(-1),{dia:'2026-11-04',valor:50})
  assert.equal(resultado.dias.reduce((soma,dia)=>soma+dia.valor,0),150)
  assert.equal(resultado.dias[1].valor,0)
})

test('estoque soma apenas material ativo da empresa, respeita estoque zerado e não exibe massa negativa', t => {
  const db = banco(t)
  db.exec(`INSERT INTO filamentos VALUES
    (1,1,300,1000),(1,1,NULL,100),(1,1,0,1000),(1,1,-50,1000),(1,0,5000,5000),(2,1,9000,9000)`)
  assert.equal(obterResumoVisualDashboard(db,1,'2026-11-04').filamentoGramas,400)
})

test('bancada atribui lotes do mesmo pedido a impressoras diferentes e usa progresso registrado', t => {
  const db = banco(t)
  db.exec(`INSERT INTO impressoras VALUES
    (1,1,'P2S',NULL,'Em uso',1),(2,1,'A1 mini',NULL,'Disponivel',1),(3,2,'Outra empresa',NULL,'Disponivel',1),(4,1,'Arquivada',NULL,'Disponivel',0);
    INSERT INTO pedidos VALUES (1,1,1,'Kit','ORC-1','Aprovado','Imprimindo',23,0,'2026-11-01');
    INSERT INTO lotes_producao VALUES
    (1,1,1,1,'Potes','Imprimindo',23,10),(2,1,1,2,'Tampas','Planejado',23,0)`)
  const {impressoras} = obterResumoVisualDashboard(db,1,'2026-11-04')
  assert.equal(impressoras.length,2)
  assert.equal(impressoras.find(i=>i.id===1).trabalho.referencia,'Potes')
  assert.equal(impressoras.find(i=>i.id===2).trabalho.referencia,'Tampas')
  assert.equal(impressoras.find(i=>i.id===1).trabalho.produzido,10)
})

test('pedido com lote em outra máquina não aparece duplicado na impressora do pedido; cancelados não entram', t => {
  const db = banco(t)
  db.exec(`INSERT INTO impressoras VALUES (1,1,'A',NULL,'Disponivel',1),(2,1,'B',NULL,'Em uso',1);
    INSERT INTO pedidos VALUES
    (1,1,1,'Kit','ORC-1','Aprovado','Imprimindo',10,0,'2026-11-01'),
    (2,1,1,'Cancelado','ORC-2','Aprovado','Cancelado',1,0,'2026-11-01');
    INSERT INTO lotes_producao VALUES (1,1,1,2,'Tampas','Imprimindo',10,0),(2,1,2,1,'Cancelado','Imprimindo',1,0)`)
  const {impressoras} = obterResumoVisualDashboard(db,1,'2026-11-04')
  assert.equal(impressoras[0].trabalho,null)
  assert.equal(impressoras[1].trabalho.projeto,'Kit')
})

test('empresa sem dados devolve estado vazio e mantém a série contínua na virada de ano', t => {
  const db = banco(t)
  const resultado=obterResumoVisualDashboard(db,1,'2027-01-01')
  assert.equal(resultado.filamentoGramas,0)
  assert.deepEqual(resultado.impressoras,[])
  assert.equal(resultado.dias[0].dia,'2026-12-03')
  assert.equal(resultado.dias.reduce((s,d)=>s+d.valor,0),0)
})
