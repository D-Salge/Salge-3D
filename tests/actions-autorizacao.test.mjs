import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))

// Load the real Server Actions. Only request/session, Next cache, and external
// integration adapters are replaced. SQL/domain logic runs unchanged.
function carregarActions(db, sessao) {
  const cache = new Map()
  let autenticacoes = 0
  const exigirSessao = async () => {
    autenticacoes++
    if (!sessao) throw new Error('UNAUTHORIZED')
    return sessao
  }
  const exigirPerfil = async perfis => {
    const atual = await exigirSessao()
    if (!perfis.includes(atual.perfil)) throw new Error('FORBIDDEN')
    return atual
  }
  function carregar(relativo) {
    if (cache.has(relativo)) return cache.get(relativo)
    const exports = {}
    cache.set(relativo, exports)
    const codigo = ts.transpileModule(readFileSync(root + relativo, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText
    const substitutos = {
      '@/lib/db': { __esModule: true, default: db },
      '@/lib/session': { exigirSessao, exigirPerfil },
      'next/cache': { revalidatePath() {} },
      'next/navigation': { redirect() { throw new Error('REDIRECT') } },
      '@/lib/backup': {},
      '@/lib/bambu-monitor': {},
      '@/lib/readiness': {},
    }
    vm.runInNewContext(codigo, {
      exports, Error, console: { ...console, error() {} }, Buffer, URL, File, FormData,
      process, crypto, setTimeout, clearTimeout,
      fetch() { throw new Error('Integração externa não deve ser chamada neste teste') },
      require: nome => {
        if (Object.hasOwn(substitutos, nome)) return substitutos[nome]
        if (nome.startsWith('@/')) {
          const arquivo = nome.slice(2)
          return arquivo.endsWith('.mjs') ? require(root + arquivo) : carregar(arquivo + '.ts')
        }
        return require(nome)
      },
    }, { filename: relativo })
    return exports
  }
  return { carregar, autenticacoes: () => autenticacoes }
}

const entradasPublicas = new Set(['configurarPrimeiroAcesso', 'entrar', 'sair', 'getOrcamentoPortal', 'responderOrcamentoPortal'])
const entradas = readdirSync(root + 'app/actions').flatMap(arquivo => {
  const source = ts.createSourceFile(arquivo, readFileSync(root + 'app/actions/' + arquivo, 'utf8'), ts.ScriptTarget.Latest, true)
  return source.statements.filter(ts.isFunctionDeclaration)
    .filter(f => f.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))
    .map(f => ({ arquivo, nome: f.name.text }))
    .filter(f => !entradasPublicas.has(f.nome))
})
const escritas = entradas.filter(f => !f.nome.startsWith('get'))

test('todas as consultas internas exigem sessão antes de acessar dados', async () => {
  let acessos = 0
  const db = new Proxy({}, { get() { acessos++; throw new Error('Leitura sem sessão') } })
  const loader = carregarActions(db, null)
  for (const { arquivo, nome } of entradas.filter(f => f.nome.startsWith('get'))) {
    const antes = loader.autenticacoes()
    try {
      const resultado = await loader.carregar('app/actions/' + arquivo)[nome](1)
      assert.equal(resultado, null, `${arquivo}:${nome} deve recusar a consulta`)
    } catch (error) {
      assert.match(error.message, /UNAUTHORIZED/, `${arquivo}:${nome}: ${error.message}`)
    }
    assert.ok(loader.autenticacoes() > antes, `${arquivo}:${nome} deve verificar sessão`)
    assert.equal(acessos, 0, `${arquivo}:${nome} não pode consultar dados sem sessão`)
  }
})

for (const sessao of [null, { tenantId: 1, usuarioId: 1, perfil: 'visualizador' }]) {
  test(`todas as ${escritas.length} ações de escrita recusam ${sessao ? 'visualizador' : 'sessão ausente'} antes de acessar banco ou rede`, async () => {
    let acessos = 0
    const db = new Proxy({}, { get() { acessos++; throw new Error('Banco acessado antes de autorizar') } })
    const loader = carregarActions(db, sessao)
    for (const { arquivo, nome } of escritas) {
      const acao = loader.carregar('app/actions/' + arquivo)[nome]
      const antes = loader.autenticacoes()
      const args = nome === 'atualizarStatusPedido' ? [1, 'Cancelado']
        : nome === 'atualizarLoteProducao' ? [{ loteId: 1, status: 'Planejado', quantidadeProduzida: 0, tempoRealHoras: null }]
          : [1, 1, 1, 1]
      try {
        const resultado = await acao(...args)
        assert.equal(resultado?.success, false, `${arquivo}:${nome} deve recusar a escrita`)
      } catch (error) {
        assert.match(error.message, /UNAUTHORIZED|FORBIDDEN/, `${arquivo}:${nome}: ${error.message}`)
      }
      assert.ok(loader.autenticacoes() > antes, `${arquivo}:${nome} deve verificar a sessão`)
      assert.equal(acessos, 0, `${arquivo}:${nome} não pode acessar o banco antes da permissão`)
    }
  })
}

function base(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(root + 'database/schema.sql', 'utf8').split('\n').filter(l => !l.trim().toUpperCase().startsWith('PRAGMA')).join('\n'))
  applyMigrations(db)
  db.prepare("INSERT INTO tenants (id,nome) VALUES (2,'Empresa B')").run()
  db.prepare(`INSERT INTO usuarios (id,tenant_id,nome,email,perfil,senha_hash) VALUES
    (10,2,'Administrador B','admin-b@teste.local','admin','fixture'),
    (11,2,'Operador B','operador-b@teste.local','operador','fixture')`).run()
  db.prepare(`INSERT INTO clientes (id,tenant_id,usuario_id,nome) VALUES
    (1,1,1,'Cliente A'), (2,2,10,'Cliente B')`).run()
  db.prepare(`INSERT INTO filamentos (id,tenant_id,usuario_id,material,cor,peso_rolo_gramas,preco_rolo,estoque_gramas) VALUES
    (1,1,1,'PLA','Material A',1000,100,1000), (2,2,10,'PLA','Material B',1000,100,500)`).run()
  db.prepare(`INSERT INTO insumos (id,tenant_id,usuario_id,nome,unidade,custo_unitario,estoque_atual) VALUES
    (1,1,1,'Insumo A','unid',1,20),(2,2,10,'Insumo B','unid',1,30)`).run()
  db.prepare(`INSERT INTO pedidos (id,tenant_id,usuario_id,cliente_id,nome_da_peca,tempo_impressao_horas,
    valor_total_cobrado,status,orcamento_status,quantidade,numero_orcamento) VALUES
    (1,1,1,1,'Pedido A',1,100,'Fila','Aprovado',1,'ORC-A'),
    (2,2,10,2,'Pedido B',1,100,'Fila','Aprovado',1,'ORC-B')`).run()
  const admin = carregarActions(db, { tenantId: 2, usuarioId: 10, perfil: 'admin' })
  const operador = carregarActions(db, { tenantId: 2, usuarioId: 11, perfil: 'operador' })
  return { db, admin, operador }
}

test('consultas de materiais, clientes, pedidos e resumo usam a empresa da sessão', async t => {
  const f = base(t)
  const consultas = [
    ['filamentos', 'getFilamentosLista', 'cor', 'Material B'],
    ['insumos', 'getInsumosLista', 'nome', 'Insumo B'],
    ['clientes', 'getClientesLista', 'nome', 'Cliente B'],
    ['pedidos', 'getPedidosRecentes', 'nome_da_peca', 'Pedido B'],
    ['pedidos', 'getPedidosKanban', 'nome_da_peca', 'Pedido B'],
  ]
  for (const [arquivo, nome, campo, esperado] of consultas) {
    const itens = await f.admin.carregar(`app/actions/${arquivo}.ts`)[nome]()
    assert.deepEqual(Array.from(itens, i => i[campo]), [esperado])
  }
  const stats = await f.admin.carregar('app/actions/pedidos.ts').getDashboardStats()
  assert.equal(stats.pedidosTotal, 1)
  assert.equal(stats.inadimplenciaTotal, 100)
})

test('cadastros e movimentos registram a empresa e o operador corretos', async t => {
  const f = base(t)
  const filamentos = f.operador.carregar('app/actions/filamentos.ts')
  assert.equal((await filamentos.salvarFilamento(null, {
    material: 'TPU', cor: 'Novo B', peso_rolo_gramas: 1000, preco_rolo: 90,
    estoque_gramas: 1000, estoque_minimo_gramas: 100, marca: null, fornecedor: null,
  })).success, true)
  const filamento = f.db.prepare("SELECT id,tenant_id,usuario_id FROM filamentos WHERE cor='Novo B'").get()
  assert.equal(filamento.tenant_id, 2)
  assert.equal(filamento.usuario_id, 11)
  assert.deepEqual(f.db.prepare('SELECT tenant_id,usuario_id FROM movimentos_estoque WHERE item_id=?').get(filamento.id), { tenant_id: 2, usuario_id: 11 })
  const clientes = f.operador.carregar('app/actions/clientes.ts')
  assert.equal((await clientes.salvarCliente({ id: null, nome: 'Novo cliente B', telefone: '', email: '', instagram: '', cidade: '', origem: 'Outro', tipoCliente: '', observacoes: '' })).success, true)
  assert.deepEqual(f.db.prepare("SELECT tenant_id,usuario_id FROM clientes WHERE nome='Novo cliente B'").get(), { tenant_id: 2, usuario_id: 11 })
  const agenda = f.operador.carregar('app/actions/agenda.ts')
  assert.equal((await agenda.criarLembreteAgenda({ tipo: 'Outro', titulo: 'Teste B', descricao: '', vencimento_em: '2026-12-01' })).success, true)
  assert.deepEqual(f.db.prepare("SELECT tenant_id,usuario_id FROM auditoria WHERE entidade='Agenda'").get(), { tenant_id: 2, usuario_id: 11 })
})

test('administrador B altera apenas a configuração B e operador não altera configuração', async t => {
  const f = base(t)
  const action = f.admin.carregar('app/actions/configuracoes.ts')
  const config = await action.getConfiguracoes()
  assert.equal(config.nome, 'Empresa B')
  assert.equal((await action.salvarConfiguracoes({ ...config, nome: 'B atualizado' })).success, true)
  assert.equal(f.db.prepare('SELECT nome FROM tenants WHERE id=1').get().nome, 'Salge 3D')
  assert.equal(f.db.prepare('SELECT nome FROM tenants WHERE id=2').get().nome, 'B atualizado')
  await assert.rejects(f.operador.carregar('app/actions/configuracoes.ts').salvarConfiguracoes(config), /FORBIDDEN/)
})

test('ações B recusam IDs da empresa A sem alterar ou arquivar seus registros', async t => {
  const f = base(t)
  const antes = f.db.prepare('SELECT * FROM filamentos WHERE id=1').get()
  const materiais = f.operador.carregar('app/actions/filamentos.ts')
  assert.equal((await materiais.salvarFilamento(1, { ...antes, cor: 'Tentativa cruzada' })).success, false)
  assert.equal((await materiais.deletarFilamento(1)).success, false)
  assert.deepEqual(f.db.prepare('SELECT * FROM filamentos WHERE id=1').get(), antes)
  const clientes = f.operador.carregar('app/actions/clientes.ts')
  assert.equal((await clientes.salvarCliente({ id: 1, nome: 'Tentativa cruzada', telefone: '', email: '', instagram: '', cidade: '', origem: '', tipoCliente: '', observacoes: '' })).success, false)
  assert.equal(f.db.prepare('SELECT nome FROM clientes WHERE id=1').get().nome, 'Cliente A')
})

test('expiração automática afeta somente orçamentos da sessão e registra quem acionou a consulta', async t => {
  const f = base(t)
  f.db.prepare("UPDATE pedidos SET orcamento_status='Enviado',validade_orcamento='2000-01-01'").run()
  await f.admin.carregar('app/actions/pedidos.ts').getPedidosRecentes()
  assert.equal(f.db.prepare('SELECT orcamento_status FROM pedidos WHERE id=1').get().orcamento_status, 'Enviado')
  assert.equal(f.db.prepare('SELECT orcamento_status FROM pedidos WHERE id=2').get().orcamento_status, 'Expirado')
  assert.deepEqual(f.db.prepare('SELECT tenant_id,usuario_id FROM historico_pedidos WHERE pedido_id=2').get(), { tenant_id: 2, usuario_id: 10 })
})
