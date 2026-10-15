import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import { desfazerConciliacaoExtrato } from '../lib/conciliacao.mjs'

function bancoTeste() {
  const db = new Database(':memory:')
  const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().toUpperCase().startsWith('PRAGMA'))
    .join('\n')
  db.exec(schema)
  applyMigrations(db)
  db.pragma('foreign_keys = ON')
  return db
}

function criarLancamento(db, dados = {}) {
  const contaId = db.prepare(`SELECT id FROM contas_financeiras WHERE tenant_id = 1 AND nome = 'Mercado Pago'`).get().id
  const importacaoId = Number(db.prepare(`INSERT INTO extrato_importacoes (
    tenant_id, usuario_id, nome_arquivo, hash_arquivo, quantidade_lancamentos, conta_financeira_id
  ) VALUES (1, 1, 'extrato.xlsx', ?, 1, ?)`).run(crypto.randomUUID(), contaId).lastInsertRowid)
  const result = db.prepare(`INSERT INTO extrato_lancamentos (
    tenant_id, importacao_id, identificador_externo, data_lancamento, descricao, valor,
    status, classificacao, entidade_tipo, entidade_id, transferencia_financeira_id,
    fluxo_capital_id, conciliado_em
  ) VALUES (1, ?, ?, '2026-10-13', 'Pix enviado Daniel Solis Salge', -378.80,
    ?, ?, ?, ?, ?, ?, '2026-10-15T12:00:00Z')`).run(
      importacaoId,
      crypto.randomUUID(),
      dados.status ?? 'Conciliado',
      dados.classificacao ?? 'Pessoal',
      dados.entidadeTipo ?? null,
      dados.entidadeId ?? null,
      dados.transferenciaId ?? null,
      dados.fluxoId ?? null,
    )
  return Number(result.lastInsertRowid)
}

test('desfaz retirada criada pelo extrato e devolve o Pix para pendente', () => {
  const db = bancoTeste()
  try {
    const contaId = db.prepare(`SELECT id FROM contas_financeiras WHERE nome = 'Mercado Pago'`).get().id
    const fluxoId = Number(db.prepare(`INSERT INTO fluxo_capital (
      tenant_id, usuario_id, tipo, valor, descricao, data_movimentacao, conta_financeira_id
    ) VALUES (1, 1, 'Retirada', 378.80, 'Pix enviado Daniel Solis Salge', '2026-10-13', ?)`)
      .run(contaId).lastInsertRowid)
    const lancamentoId = criarLancamento(db, { fluxoId })

    const resultado = db.transaction(() => desfazerConciliacaoExtrato(db, 1, lancamentoId)).immediate()

    assert.equal(resultado.fluxoCapitalRemovido, true)
    assert.equal(db.prepare('SELECT 1 FROM fluxo_capital WHERE id = ?').get(fluxoId), undefined)
    assert.deepEqual(
      db.prepare(`SELECT status, classificacao, fluxo_capital_id, conciliado_em
        FROM extrato_lancamentos WHERE id = ?`).get(lancamentoId),
      { status: 'Pendente', classificacao: null, fluxo_capital_id: null, conciliado_em: null },
    )
  } finally {
    db.close()
  }
})

test('desfaz vínculo sem apagar uma despesa que já existia', () => {
  const db = bancoTeste()
  try {
    const contaId = db.prepare(`SELECT id FROM contas_financeiras WHERE nome = 'Mercado Pago'`).get().id
    const despesaId = Number(db.prepare(`INSERT INTO despesas (
      tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
      competencia_em, vencimento_em, pago_em, forma_pagamento, conta_financeira_id
    ) VALUES (1, 1, 'Equipamento', '2ª Parcela A1 Mini', 378.80, '2026-10-13',
      '2026-10-13', '2026-10-13', '2026-10-13', 'Pix', ?)`)
      .run(contaId).lastInsertRowid)
    const lancamentoId = criarLancamento(db, {
      classificacao: 'Despesa', entidadeTipo: 'Despesa', entidadeId: despesaId,
    })
    db.prepare(`INSERT INTO extrato_conciliacoes (
      tenant_id, extrato_lancamento_id, entidade_tipo, entidade_id, valor_vinculado
    ) VALUES (1, ?, 'Despesa', ?, 378.80)`).run(lancamentoId, despesaId)

    desfazerConciliacaoExtrato(db, 1, lancamentoId)

    assert.equal(db.prepare('SELECT estornada_em FROM despesas WHERE id = ?').get(despesaId).estornada_em, null)
    assert.equal(db.prepare('SELECT 1 FROM extrato_conciliacoes WHERE extrato_lancamento_id = ?').get(lancamentoId), undefined)
    assert.equal(db.prepare('SELECT status FROM extrato_lancamentos WHERE id = ?').get(lancamentoId).status, 'Pendente')
  } finally {
    db.close()
  }
})

test('estorna a despesa criada automaticamente ao desfazer a classificação', () => {
  const db = bancoTeste()
  try {
    const contaId = db.prepare(`SELECT id FROM contas_financeiras WHERE nome = 'Mercado Pago'`).get().id
    const despesaId = Number(db.prepare(`INSERT INTO despesas (
      tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
      competencia_em, vencimento_em, pago_em, forma_pagamento, conta_financeira_id
    ) VALUES (1, 1, 'Equipamento', 'Despesa criada pelo extrato', 378.80, '2026-10-13',
      '2026-10-13', '2026-10-13', '2026-10-13', 'Extrato bancário', ?)`)
      .run(contaId).lastInsertRowid)
    db.prepare(`INSERT INTO auditoria (
      tenant_id, usuario_id, entidade, entidade_id, acao, descricao
    ) VALUES (1, 1, 'Despesa', ?, 'CRIAR_DO_EXTRATO', 'Teste')`).run(despesaId)
    const lancamentoId = criarLancamento(db, {
      classificacao: 'Despesa', entidadeTipo: 'Despesa', entidadeId: despesaId,
    })

    const resultado = desfazerConciliacaoExtrato(db, 1, lancamentoId)

    assert.equal(resultado.despesaCriadaPeloExtrato, true)
    assert.ok(db.prepare('SELECT estornada_em FROM despesas WHERE id = ?').get(despesaId).estornada_em)
    assert.equal(db.prepare('SELECT status FROM extrato_lancamentos WHERE id = ?').get(lancamentoId).status, 'Pendente')
  } finally {
    db.close()
  }
})

test('estorna transferência automática e reabre o lançamento do cofrinho', () => {
  const db = bancoTeste()
  try {
    const contas = db.prepare(`SELECT id, nome FROM contas_financeiras
      WHERE nome IN ('Mercado Pago', 'Cofrinho Salge 3D')`).all()
    const mercadoPagoId = contas.find((conta) => conta.nome === 'Mercado Pago').id
    const cofrinhoId = contas.find((conta) => conta.nome === 'Cofrinho Salge 3D').id
    const transferenciaId = Number(db.prepare(`INSERT INTO transferencias_financeiras (
      tenant_id, usuario_id, conta_origem_id, conta_destino_id, valor,
      data_transferencia, descricao
    ) VALUES (1, 1, ?, ?, 75, '2026-10-15', 'Dinheiro reservado Salge 3D')`)
      .run(mercadoPagoId, cofrinhoId).lastInsertRowid)
    const lancamentoId = criarLancamento(db, {
      classificacao: 'Transferencia', transferenciaId,
    })

    const resultado = desfazerConciliacaoExtrato(db, 1, lancamentoId)

    assert.equal(resultado.transferenciaEstornada, true)
    assert.ok(db.prepare('SELECT estornada_em FROM transferencias_financeiras WHERE id = ?').get(transferenciaId).estornada_em)
    assert.equal(db.prepare('SELECT status FROM extrato_lancamentos WHERE id = ?').get(lancamentoId).status, 'Pendente')
  } finally {
    db.close()
  }
})
