import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import * as mercadoPago from '../lib/mercado-pago.mjs'

const require = createRequire(import.meta.url)
function carregarTs(caminho, dependencias = {}) {
  const codigo = ts.transpileModule(readFileSync(new URL(caminho, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const contexto = vm.createContext({ exports: {}, Error, console, require: nome => {
    if (Object.hasOwn(dependencias, nome)) return dependencias[nome]
    if (nome.startsWith('@/')) return require(fileURLToPath(new URL(`../${nome.slice(2)}`, import.meta.url)))
    return require(nome)
  } })
  new vm.Script(codigo).runInContext(contexto)
  return contexto.exports
}
const auditoria = carregarTs('../lib/auditoria.ts')

function ambiente(t, { local = true, teste = false, token = 'token-ficticio', sessao = { tenantId: 1, usuarioId: 1, perfil: 'admin' } } = {}) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter(linha => !linha.trim().toUpperCase().startsWith('PRAGMA')).join('\n'))
  applyMigrations(db)
  const clienteId = Number(db.prepare("INSERT INTO clientes (tenant_id, usuario_id, nome) VALUES (1, 1, 'Cliente local')").run().lastInsertRowid)
  const pedidoId = Number(db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas, valor_total_cobrado, status, orcamento_status)
    VALUES (1, 1, ?, 'Peça local', 1, 100, 'Fila', 'Aprovado')`).run(clienteId).lastInsertRowid)
  db.prepare(`INSERT INTO parcelas_receber (tenant_id, pedido_id, numero, valor, vencimento_em)
    VALUES (1, ?, 1, 100, '2026-12-01')`).run(pedidoId)
  const chamadas = []
  const consultas = []
  const pagamentos = []
  const env = {
    MERCADO_PAGO_ACCESS_TOKEN: token,
    MERCADO_PAGO_LOCAL_MODE: String(local), MERCADO_PAGO_TEST_MODE: String(teste),
    APP_URL: local ? 'http://localhost:3002' : 'https://erp.example.com',
    ...(!local ? { MERCADO_PAGO_WEBHOOK_SECRET: 'segredo-ficticio' } : {}),
  }
  const moduloMP = {
    ...mercadoPago,
    configuracaoMercadoPago: () => mercadoPago.configuracaoMercadoPago(env),
    criarPreferenciaMercadoPago: async (payload, accessToken, chave) => {
      chamadas.push({ payload, accessToken, chave })
      return { id: `pref-${chamadas.length}`, init_point: 'https://www.mercadopago.com.br/checkout/prod', sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/teste' }
    },
    buscarPagamentosMercadoPago: async (referencia, accessToken) => {
      consultas.push({ referencia, accessToken })
      return { results: pagamentos }
    },
  }
  const processador = carregarTs('../lib/mercado-pago-processamento.ts', { '@/lib/db': { default: db } })
  const actions = carregarTs('../app/actions/mercado-pago.ts', {
    '@/lib/db': { default: db },
    '@/lib/session': { exigirPerfil: async perfis => {
      if (!sessao) throw new Error('UNAUTHORIZED')
      if (!perfis.includes(sessao.perfil)) throw new Error('FORBIDDEN')
      return sessao
    } },
    '@/lib/auditoria': auditoria,
    '@/lib/mercado-pago.mjs': moduloMP,
    '@/lib/mercado-pago-processamento': processador,
    'next/cache': { revalidatePath() {} },
  })
  const contar = tabela => db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n
  return { db, pedidoId, actions, chamadas, consultas, pagamentos, contar, moduloMP }
}

for (const teste of [false, true]) {
  test(`gera link em uso local ${teste ? 'de teste' : 'real'} sem publicar URL ou criar portal`, async t => {
    const f = ambiente(t, { teste })
    const resultado = await f.actions.gerarCobrancaMercadoPago(f.pedidoId, 40)
    assert.equal(resultado.success, true)
    assert.match(resultado.url, teste ? /sandbox/ : /\/prod$/)
    assert.equal(f.chamadas.length, 1)
    const { payload } = f.chamadas[0]
    for (const campo of ['notification_url', 'back_urls', 'auto_return']) assert.equal(campo in payload, false)
    assert.equal(payload.items[0].unit_price, 40)
    assert.match(payload.external_reference, new RegExp(`^salge-1-${f.pedidoId}-`))
    assert.equal(f.contar('portal_links'), 0)
    assert.equal(f.contar('mercado_pago_cobrancas'), 1)
    assert.equal(f.contar('recebimentos'), 0)
  })
}

test('sincronização local consulta referência e registra pagamento/taxa apenas uma vez', async t => {
  const f = ambiente(t)
  await f.actions.gerarCobrancaMercadoPago(f.pedidoId, 40)
  const referencia = f.chamadas[0].payload.external_reference
  f.pagamentos.push({ id: 987654321, status: 'approved', status_detail: 'accredited',
    external_reference: referencia, transaction_amount: 40, payment_method_id: 'pix',
    date_approved: '2026-10-31T10:00:00Z', transaction_details: { net_received_amount: 38 } })
  assert.equal((await f.actions.sincronizarCobrancaMercadoPago(f.pedidoId)).success, true)
  assert.equal(f.consultas[0].referencia, referencia)
  assert.equal(f.contar('recebimentos'), 1)
  assert.equal(f.contar('receitas_fiscais'), 1)
  assert.equal(f.contar('despesas'), 1)
  assert.deepEqual(f.db.prepare('SELECT status, valor_liquido, taxa_valor FROM mercado_pago_cobrancas').get(),
    { status: 'Aprovado', valor_liquido: 38, taxa_valor: 2 })
  assert.equal((await f.actions.sincronizarCobrancaMercadoPago(f.pedidoId)).success, true)
  assert.equal(f.consultas.length, 1)
  assert.equal(f.contar('recebimentos'), 1)
  assert.equal(f.contar('despesas'), 1)
})

test('sem pagamento confirmado na API a sincronização não baixa recebimento', async t => {
  const f = ambiente(t)
  await f.actions.gerarCobrancaMercadoPago(f.pedidoId, 40)
  assert.equal((await f.actions.sincronizarCobrancaMercadoPago(f.pedidoId)).success, false)
  assert.equal(f.contar('recebimentos'), 0)
  assert.equal(f.db.prepare('SELECT status FROM mercado_pago_cobrancas').get().status, 'Pendente')
})

test('uso público mantém portal, webhook e retornos HTTPS', async t => {
  const f = ambiente(t, { local: false })
  assert.equal((await f.actions.gerarCobrancaMercadoPago(f.pedidoId, 40)).success, true)
  assert.equal(f.contar('portal_links'), 1)
  const token = f.db.prepare('SELECT token FROM portal_links').get().token
  assert.equal(f.chamadas[0].payload.notification_url, 'https://erp.example.com/api/webhooks/mercado-pago')
  assert.match(f.chamadas[0].payload.back_urls.success, new RegExp(`portal=${token}$`))
  assert.equal(f.chamadas[0].payload.auto_return, 'approved')
})

test('modo local mantém autorização, isolamento e limite do saldo sem criar cobrança remota', async t => {
  for (const opcoes of [{ sessao: null }, { sessao: { tenantId: 1, usuarioId: 1, perfil: 'visualizador' } },
    { sessao: { tenantId: 2, usuarioId: 1, perfil: 'admin' } }, { token: '' }]) {
    const f = ambiente(t, opcoes)
    assert.equal((await f.actions.gerarCobrancaMercadoPago(f.pedidoId, 40)).success, false)
    assert.equal(f.chamadas.length, 0)
    assert.equal(f.contar('mercado_pago_cobrancas'), 0)
  }
  const f = ambiente(t)
  assert.equal((await f.actions.gerarCobrancaMercadoPago(f.pedidoId, 101)).success, false)
  assert.equal(f.chamadas.length, 0)
})

test('webhook permanece desativado no modo local mesmo com segredo preenchido', async t => {
  const f = ambiente(t)
  const config = mercadoPago.configuracaoMercadoPago({ MERCADO_PAGO_LOCAL_MODE: 'true',
    MERCADO_PAGO_ACCESS_TOKEN: 'token-ficticio', MERCADO_PAGO_WEBHOOK_SECRET: 'segredo-ficticio' })
  const route = carregarTs('../app/api/webhooks/mercado-pago/route.ts', {
    '@/lib/mercado-pago.mjs': { ...f.moduloMP, configuracaoMercadoPago: () => config },
    '@/lib/mercado-pago-processamento': { processarPagamentoMercadoPago() { assert.fail('não deve processar webhook') } },
  })
  const resposta = await route.POST({})
  assert.equal(resposta.status, 503)
  assert.equal((await resposta.json()).error, 'manual_sync_mode')
})
