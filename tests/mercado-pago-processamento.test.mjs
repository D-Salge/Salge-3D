import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import { processarPagamentoMercadoPagoNoBanco } from '../lib/mercado-pago-processamento-db.mjs'

const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
  .split('\n').filter((linha) => !linha.trim().toUpperCase().startsWith('PRAGMA')).join('\n')

function inserirPedido(db, { tenantId = 1, usuarioId, numero = 'ORC-MP-1' } = {}) {
  const clienteId = Number(db.prepare(`INSERT INTO clientes
    (tenant_id, usuario_id, nome) VALUES (?, ?, ?)`
  ).run(tenantId, usuarioId, `Cliente ${numero}`).lastInsertRowid)
  const pedidoId = Number(db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
      valor_total_cobrado, status, orcamento_status, numero_orcamento, sinal_percentual)
    VALUES (?, ?, ?, 'Peça Mercado Pago', 2, 100, 'Fila', 'Aprovado', ?, 50)`
  ).run(tenantId, usuarioId, clienteId, numero).lastInsertRowid)
  db.prepare(`INSERT INTO parcelas_receber
    (tenant_id, pedido_id, numero, valor, vencimento_em)
    VALUES (?, ?, 1, 100, '2026-10-31')`).run(tenantId, pedidoId)
  return pedidoId
}

function inserirCobranca(db, { tenantId = 1, usuarioId, pedidoId, referencia = 'mp-ref-1', valor = 40 } = {}) {
  return Number(db.prepare(`INSERT INTO mercado_pago_cobrancas (
    tenant_id, usuario_id, pedido_id, preference_id, external_reference,
    init_point, valor
  ) VALUES (?, ?, ?, ?, ?, 'https://example.invalid/pay', ?)`
  ).run(tenantId, usuarioId, pedidoId, `pref-${referencia}`, referencia, valor).lastInsertRowid)
}

function criarBase(t, { arquivo = ':memory:' } = {}) {
  const db = new Database(arquivo)
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 10000')
  db.exec(schema)
  applyMigrations(db)
  db.prepare(`UPDATE tenants SET mei_natureza_padrao = 'Serviço' WHERE id = 1`).run()
  const usuarioId = db.prepare(`SELECT id FROM usuarios
    WHERE tenant_id = 1 AND perfil = 'admin' ORDER BY id LIMIT 1`).get().id
  const pedidoId = inserirPedido(db, { usuarioId })
  const cobrancaId = inserirCobranca(db, { usuarioId, pedidoId })
  if (t) t.after(() => db.open && db.close())

  const pagamento = (alteracoes = {}) => ({
    id: 987654321,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: 'mp-ref-1',
    transaction_amount: 40,
    payment_method_id: 'pix',
    date_approved: '2026-10-19T10:00:00Z',
    transaction_details: { net_received_amount: 38 },
    ...alteracoes,
  })
  const contar = (tabela, filtro = '') => db.prepare(
    `SELECT COUNT(*) AS total FROM ${tabela} ${filtro}`,
  ).get().total
  const estadoFinanceiro = () => ({
    recebimentos: contar('recebimentos'),
    alocacoes: contar('recebimento_alocacoes'),
    receitas: contar('receitas_fiscais'),
    taxas: contar('despesas', "WHERE codigo_externo LIKE 'MP-TAXA-%'"),
    historico: contar('historico_pedidos', "WHERE evento = 'Pagamento confirmado'"),
    auditoria: contar('auditoria', "WHERE acao = 'CRIAR_AUTOMATICO'"),
  })
  return { cobrancaId, db, estadoFinanceiro, pagamento, pedidoId, usuarioId }
}

function processar(f, pagamento = f.pagamento()) {
  return processarPagamentoMercadoPagoNoBanco(
    f.db,
    pagamento,
    { type: 'payment', data: { id: pagamento.id } },
    'payment.updated',
  )
}

function executarWorker(caminhoBanco, pagamento, inicio) {
  const worker = fileURLToPath(new URL('./fixtures/mercado-pago-worker.mjs', import.meta.url))
  const serializado = Buffer.from(JSON.stringify(pagamento)).toString('base64url')
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [worker, caminhoBanco, serializado, String(inicio)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let saida = ''
    let erro = ''
    filho.stdout.on('data', (trecho) => { saida += trecho })
    filho.stderr.on('data', (trecho) => { erro += trecho })
    filho.on('error', reject)
    filho.on('close', (codigo) => {
      if (codigo !== 0) reject(new Error(`worker ${codigo}: ${erro}`))
      else resolve(JSON.parse(saida))
    })
  })
}

test('pagamento aprovado novo cria uma única baixa e a receita fiscal compartilhada', (t) => {
  const f = criarBase(t)
  assert.deepEqual(processar(f), { duplicado: false, status: 'Aprovado', valor: 40 })
  assert.deepEqual(f.estadoFinanceiro(), {
    recebimentos: 1, alocacoes: 1, receitas: 1, taxas: 1, historico: 1, auditoria: 2,
  })
  assert.deepEqual(f.db.prepare(`SELECT rf.tenant_id, rf.usuario_id, rf.natureza,
      rf.origem, rf.valor, r.pedido_id
    FROM receitas_fiscais rf JOIN recebimentos r ON r.id = rf.recebimento_id`).get(), {
    tenant_id: 1,
    usuario_id: f.usuarioId,
    natureza: 'Serviço',
    origem: 'ERP',
    valor: 40,
    pedido_id: f.pedidoId,
  })
})

test('repetição do mesmo evento não duplica nenhum efeito', (t) => {
  const f = criarBase(t)
  processar(f)
  const anterior = f.estadoFinanceiro()
  assert.deepEqual(processar(f), { duplicado: true, status: 'Aprovado', valor: null })
  assert.deepEqual(f.estadoFinanceiro(), anterior)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM mercado_pago_eventos').get().total, 1)
})

test('status_detail diferente reconhece o pagamento antes de validar o saldo consumido', (t) => {
  const f = criarBase(t)
  processar(f)
  const anterior = f.estadoFinanceiro()
  const resultado = processar(f, f.pagamento({ status_detail: 'settled' }))
  assert.deepEqual(resultado, { duplicado: true, status: 'Aprovado', valor: 40 })
  assert.deepEqual(f.estadoFinanceiro(), anterior)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM mercado_pago_eventos').get().total, 2)
  assert.equal(f.db.prepare('SELECT status_detalhe FROM mercado_pago_cobrancas WHERE id = ?')
    .get(f.cobrancaId).status_detalhe, 'settled')
})

test('taxa informada posteriormente cria somente a despesa faltante', (t) => {
  const f = criarBase(t)
  processar(f, f.pagamento({ transaction_details: { net_received_amount: 40 } }))
  assert.deepEqual(f.estadoFinanceiro(), {
    recebimentos: 1, alocacoes: 1, receitas: 1, taxas: 0, historico: 1, auditoria: 1,
  })

  const pagamentoComTaxa = f.pagamento({ status_detail: 'fee-reported',
    transaction_details: { net_received_amount: 38 } })
  assert.deepEqual(processar(f, pagamentoComTaxa), {
    duplicado: true, status: 'Aprovado', valor: 40,
  })
  assert.deepEqual(f.estadoFinanceiro(), {
    recebimentos: 1, alocacoes: 1, receitas: 1, taxas: 1, historico: 1, auditoria: 2,
  })
  assert.deepEqual(f.db.prepare(`SELECT mc.valor_liquido, mc.taxa_valor,
      d.valor AS despesa_valor, d.codigo_externo
    FROM mercado_pago_cobrancas mc
    JOIN despesas d ON d.id = mc.despesa_taxa_id
    WHERE mc.id = ?`).get(f.cobrancaId), {
    valor_liquido: 38,
    taxa_valor: 2,
    despesa_valor: 2,
    codigo_externo: 'MP-TAXA-987654321',
  })

  const estadoReconhecido = f.estadoFinanceiro()
  assert.deepEqual(processar(f, pagamentoComTaxa), {
    duplicado: true, status: 'Aprovado', valor: null,
  })
  assert.deepEqual(f.estadoFinanceiro(), estadoReconhecido)
})

test('chamadas concorrentes com detalhes diferentes serializam sem duplicar efeitos', async (t) => {
  const diretorio = mkdtempSync(path.join(tmpdir(), 'salge-mp-concorrencia-'))
  const caminhoBanco = path.join(diretorio, 'teste.sqlite')
  t.after(() => rmSync(diretorio, { recursive: true, force: true }))
  const f = criarBase(null, { arquivo: caminhoBanco })
  const pagamentoA = f.pagamento({ status_detail: 'accredited' })
  const pagamentoB = f.pagamento({ status_detail: 'settled' })
  f.db.close()

  const inicio = Date.now() + 400
  const resultados = await Promise.all([
    executarWorker(caminhoBanco, pagamentoA, inicio),
    executarWorker(caminhoBanco, pagamentoB, inicio),
  ])
  assert.equal(resultados.filter((resultado) => resultado.duplicado === false).length, 1)
  assert.equal(resultados.filter((resultado) => resultado.duplicado === true).length, 1)

  const verificacao = new Database(caminhoBanco, { readonly: true })
  const contar = (tabela, filtro = '') => verificacao.prepare(
    `SELECT COUNT(*) AS total FROM ${tabela} ${filtro}`,
  ).get().total
  assert.deepEqual({
    recebimentos: contar('recebimentos'),
    alocacoes: contar('recebimento_alocacoes'),
    receitas: contar('receitas_fiscais'),
    taxas: contar('despesas', "WHERE codigo_externo LIKE 'MP-TAXA-%'"),
    historico: contar('historico_pedidos', "WHERE evento = 'Pagamento confirmado'"),
    auditoria: contar('auditoria', "WHERE acao = 'CRIAR_AUTOMATICO'"),
    eventos: contar('mercado_pago_eventos'),
  }, {
    recebimentos: 1, alocacoes: 1, receitas: 1, taxas: 1,
    historico: 1, auditoria: 2, eventos: 2,
  })
  verificacao.close()
})

test('taxa tardia concorrente cria uma única despesa sem repetir efeitos fiscais', async (t) => {
  const diretorio = mkdtempSync(path.join(tmpdir(), 'salge-mp-taxa-concorrente-'))
  const caminhoBanco = path.join(diretorio, 'teste.sqlite')
  t.after(() => rmSync(diretorio, { recursive: true, force: true }))
  const f = criarBase(null, { arquivo: caminhoBanco })
  processar(f, f.pagamento({ transaction_details: { net_received_amount: 40 } }))
  const pagamentoA = f.pagamento({
    status_detail: 'fee-reported-a',
    transaction_details: { net_received_amount: 38 },
  })
  const pagamentoB = f.pagamento({
    status_detail: 'fee-reported-b',
    transaction_details: { net_received_amount: 38 },
  })
  f.db.close()

  const inicio = Date.now() + 400
  const resultados = await Promise.all([
    executarWorker(caminhoBanco, pagamentoA, inicio),
    executarWorker(caminhoBanco, pagamentoB, inicio),
  ])
  assert.equal(resultados.every((resultado) => resultado.duplicado === true), true)

  const verificacao = new Database(caminhoBanco, { readonly: true })
  const contar = (tabela, filtro = '') => verificacao.prepare(
    `SELECT COUNT(*) AS total FROM ${tabela} ${filtro}`,
  ).get().total
  assert.deepEqual({
    recebimentos: contar('recebimentos'),
    alocacoes: contar('recebimento_alocacoes'),
    receitas: contar('receitas_fiscais'),
    taxas: contar('despesas', "WHERE codigo_externo LIKE 'MP-TAXA-%'"),
    historico: contar('historico_pedidos', "WHERE evento = 'Pagamento confirmado'"),
    auditoria: contar('auditoria', "WHERE acao = 'CRIAR_AUTOMATICO'"),
    eventos: contar('mercado_pago_eventos'),
  }, {
    recebimentos: 1, alocacoes: 1, receitas: 1, taxas: 1,
    historico: 1, auditoria: 2, eventos: 3,
  })
  assert.deepEqual(verificacao.prepare(`SELECT mc.valor_liquido, mc.taxa_valor,
      d.valor AS despesa_valor
    FROM mercado_pago_cobrancas mc
    JOIN despesas d ON d.id = mc.despesa_taxa_id
    WHERE mc.id = ?`).get(f.cobrancaId), {
    valor_liquido: 38,
    taxa_valor: 2,
    despesa_valor: 2,
  })
  verificacao.close()
})

test('taxa divergente já contabilizada é rejeitada sem gravações parciais', (t) => {
  const f = criarBase(t)
  processar(f)
  const estadoAnterior = f.estadoFinanceiro()
  const cobrancaAnterior = f.db.prepare(`SELECT status, status_detalhe, valor_liquido,
      taxa_valor, despesa_taxa_id, atualizado_em
    FROM mercado_pago_cobrancas WHERE id = ?`).get(f.cobrancaId)
  const eventosAnteriores = f.db.prepare('SELECT COUNT(*) AS total FROM mercado_pago_eventos').get().total

  assert.throws(
    () => processar(f, f.pagamento({
      status_detail: 'fee-divergent',
      transaction_details: { net_received_amount: 37 },
    })),
    /PAYMENT_FEE_MISMATCH:3:2/,
  )
  assert.deepEqual(f.estadoFinanceiro(), estadoAnterior)
  assert.deepEqual(f.db.prepare(`SELECT status, status_detalhe, valor_liquido,
      taxa_valor, despesa_taxa_id, atualizado_em
    FROM mercado_pago_cobrancas WHERE id = ?`).get(f.cobrancaId), cobrancaAnterior)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM mercado_pago_eventos').get().total,
    eventosAnteriores)
  assert.equal(f.db.prepare('SELECT valor FROM despesas WHERE id = ?')
    .get(cobrancaAnterior.despesa_taxa_id).valor, 2)
})

test('associações divergentes de pagamento, cobrança ou pedido são rejeitadas', (t) => {
  const f = criarBase(t)
  processar(f)
  f.db.prepare('UPDATE mercado_pago_cobrancas SET pagamento_id = NULL WHERE id = ?')
    .run(f.cobrancaId)
  const outroPedidoId = inserirPedido(f.db, { usuarioId: f.usuarioId, numero: 'ORC-MP-2' })
  inserirCobranca(f.db, {
    usuarioId: f.usuarioId,
    pedidoId: outroPedidoId,
    referencia: 'mp-ref-2',
  })
  const anterior = f.estadoFinanceiro()
  assert.throws(
    () => processar(f, f.pagamento({ external_reference: 'mp-ref-2', status_detail: 'other-order' })),
    /PAYMENT_ASSOCIATION_MISMATCH:RECEIPT/,
  )
  assert.deepEqual(f.estadoFinanceiro(), anterior)
  assert.equal(f.db.prepare("SELECT COUNT(*) AS total FROM mercado_pago_eventos WHERE evento_chave LIKE '%other-order'").get().total, 0)

  const outroTenantId = Number(f.db.prepare(`INSERT INTO tenants
    (nome, mei_natureza_padrao) VALUES ('Empresa divergente', 'Venda')`).run().lastInsertRowid)
  const outroUsuarioId = Number(f.db.prepare(`INSERT INTO usuarios
    (tenant_id, nome, email, senha_hash, perfil)
    VALUES (?, 'Admin divergente', 'mp-divergente@example.invalid', 'teste', 'admin')`
  ).run(outroTenantId).lastInsertRowid)
  const pedidoOutroTenant = inserirPedido(f.db, {
    tenantId: outroTenantId,
    usuarioId: outroUsuarioId,
    numero: 'ORC-MP-OUTRA-EMPRESA',
  })
  inserirCobranca(f.db, {
    tenantId: outroTenantId,
    usuarioId: outroUsuarioId,
    pedidoId: pedidoOutroTenant,
    referencia: 'mp-ref-outra-empresa',
  })
  assert.throws(
    () => processar(f, f.pagamento({
      external_reference: 'mp-ref-outra-empresa',
      status_detail: 'other-tenant',
    })),
    /PAYMENT_ASSOCIATION_MISMATCH:RECEIPT/,
  )
  assert.deepEqual(f.estadoFinanceiro(), anterior)

  f.db.prepare(`UPDATE mercado_pago_cobrancas
    SET pagamento_id = 'outro-pagamento', status = 'Aprovado' WHERE id = ?`).run(f.cobrancaId)
  assert.throws(
    () => processar(f, f.pagamento({ id: 123456789, status_detail: 'wrong-charge' })),
    /PAYMENT_ASSOCIATION_MISMATCH:CHARGE_PAYMENT/,
  )
  assert.deepEqual(f.estadoFinanceiro(), anterior)
})

test('pagamento novo com valor incompatível continua bloqueado sem efeitos parciais', (t) => {
  const f = criarBase(t)
  assert.throws(() => processar(f, f.pagamento({ transaction_amount: 41 })), /VALUE_MISMATCH/)
  assert.deepEqual(f.estadoFinanceiro(), {
    recebimentos: 0, alocacoes: 0, receitas: 0, taxas: 0, historico: 0, auditoria: 0,
  })
  assert.equal(f.db.prepare('SELECT COUNT(*) AS total FROM mercado_pago_eventos').get().total, 0)
  assert.deepEqual(f.db.prepare(`SELECT status, pagamento_id, valor_liquido, taxa_valor
    FROM mercado_pago_cobrancas WHERE id = ?`).get(f.cobrancaId), {
    status: 'Pendente', pagamento_id: null, valor_liquido: null, taxa_valor: null,
  })
})

test('recebimento estornado não é recriado, reativado nem recoloca a cobrança como aprovada', (t) => {
  const f = criarBase(t)
  processar(f, f.pagamento({ transaction_details: { net_received_amount: 40 } }))
  processar(f, f.pagamento({ status: 'refunded', status_detail: 'refunded',
    transaction_details: { net_received_amount: 40 } }))
  const recebimentoAntes = f.db.prepare(`SELECT id, estornado_em, estorno_motivo
    FROM recebimentos WHERE mercado_pago_pagamento_id = '987654321'`).get()
  const anterior = f.estadoFinanceiro()
  const resultado = processar(f, f.pagamento({ status_detail: 'approved-again',
    transaction_details: { net_received_amount: 38 } }))
  assert.deepEqual(resultado, { duplicado: true, status: 'Aprovado', valor: 40 })
  assert.deepEqual(f.estadoFinanceiro(), anterior)
  assert.deepEqual(f.db.prepare(`SELECT id, estornado_em, estorno_motivo
    FROM recebimentos WHERE mercado_pago_pagamento_id = '987654321'`).get(), recebimentoAntes)
  assert.equal(f.db.prepare('SELECT status FROM mercado_pago_cobrancas WHERE id = ?')
    .get(f.cobrancaId).status, 'Reembolsado')
  assert.deepEqual(f.db.prepare(`SELECT valor_liquido, taxa_valor, despesa_taxa_id
    FROM mercado_pago_cobrancas WHERE id = ?`).get(f.cobrancaId), {
    valor_liquido: 40,
    taxa_valor: 0,
    despesa_taxa_id: null,
  })
  assert.equal(f.db.prepare("SELECT COUNT(*) AS total FROM despesas WHERE codigo_externo LIKE 'MP-TAXA-%'").get().total, 0)
  assert.notEqual(f.db.prepare('SELECT cancelada_em FROM receitas_fiscais').get().cancelada_em, null)
})
