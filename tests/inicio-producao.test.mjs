import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import {
  atualizarLoteProducaoNoBanco,
  iniciarProducaoPedidoNoBanco,
} from '../lib/inicio-producao.mjs'

function base(t, { sinalPercentual = 50, orcamentoStatus = 'Aprovado' } = {}) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter((linha) => !linha.trim().toUpperCase().startsWith('PRAGMA')).join('\n'))
  applyMigrations(db)

  const usuarioId = Number(db.prepare(`INSERT INTO usuarios
    (tenant_id, nome, email, senha_hash, perfil)
    VALUES (1, 'Operador produção', 'producao@example.invalid', 'teste', 'operador')`
  ).run().lastInsertRowid)
  const clienteId = Number(db.prepare(`INSERT INTO clientes (tenant_id, usuario_id, nome)
    VALUES (1, ?, 'Cliente produção')`).run(usuarioId).lastInsertRowid)
  const pedidoId = Number(db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
      valor_total_cobrado, status, orcamento_status, quantidade, sinal_percentual)
    VALUES (1, ?, ?, 'Peça com sinal', 2, 100, 'Fila', ?, 10, ?)`
  ).run(usuarioId, clienteId, orcamentoStatus, sinalPercentual).lastInsertRowid)
  const loteId = Number(db.prepare(`INSERT INTO lotes_producao
    (tenant_id, usuario_id, pedido_id, codigo, quantidade_planejada)
    VALUES (1, ?, ?, 'LOTE-SINAL-01', 10)`
  ).run(usuarioId, pedidoId).lastInsertRowid)
  const contexto = { tenantId: 1, usuarioId, perfil: 'operador' }
  const dadosLote = { loteId, status: 'Imprimindo', quantidadeProduzida: 0, tempoRealHoras: null }

  function receber(valor, { estornado = false, tipo = 'Parcial' } = {}) {
    db.prepare(`INSERT INTO recebimentos
      (tenant_id, pedido_id, valor, tipo_recebimento, estornado_em)
      VALUES (1, ?, ?, ?, ?)`
    ).run(pedidoId, valor, tipo, estornado ? '2026-01-01T00:00:00Z' : null)
  }

  function estado() {
    return {
      pedido: db.prepare(`SELECT status, quantidade_produzida, data_conclusao
        FROM pedidos WHERE id = ?`).get(pedidoId),
      lote: db.prepare(`SELECT status, quantidade_produzida, tempo_real_horas, inicio_em, fim_em
        FROM lotes_producao WHERE id = ?`).get(loteId),
      historico: db.prepare('SELECT COUNT(*) AS total FROM historico_pedidos WHERE pedido_id = ?').get(pedidoId).total,
      auditoria: db.prepare(`SELECT COUNT(*) AS total FROM auditoria
        WHERE entidade_id IN (?, ?)`).get(pedidoId, loteId).total,
    }
  }

  return { contexto, dadosLote, db, estado, loteId, pedidoId, receber, usuarioId }
}

function confirmarSemEfeitos(f, anterior) {
  assert.deepEqual(f.estado(), anterior)
}

test('sinal exigido sem pagamento bloqueia início pelo pedido e pelo lote', (t) => {
  const f = base(t)
  const anterior = f.estado()
  assert.throws(() => iniciarProducaoPedidoNoBanco(f.db, f.contexto, f.pedidoId), /SIGNAL_PENDING:50/)
  assert.throws(() => atualizarLoteProducaoNoBanco(f.db, f.contexto, f.dadosLote), /SIGNAL_PENDING:50/)
  confirmarSemEfeitos(f, anterior)
})

test('pagamento abaixo do sinal necessário continua bloqueado nos dois caminhos', (t) => {
  const f = base(t)
  f.receber(49.99, { tipo: 'Sinal' })
  const anterior = f.estado()
  assert.throws(() => iniciarProducaoPedidoNoBanco(f.db, f.contexto, f.pedidoId), /SIGNAL_PENDING:0.01/)
  assert.throws(() => atualizarLoteProducaoNoBanco(f.db, f.contexto, f.dadosLote), /SIGNAL_PENDING:0.01/)
  confirmarSemEfeitos(f, anterior)
})

test('sinal suficiente permite iniciar pelos dois caminhos e registra o autor correto', (t) => {
  const peloPedido = base(t)
  peloPedido.receber(50, { tipo: 'Parcial' })
  assert.equal(iniciarProducaoPedidoNoBanco(
    peloPedido.db, peloPedido.contexto, peloPedido.pedidoId,
  ), 'UPDATED')
  assert.equal(peloPedido.estado().pedido.status, 'Imprimindo')

  const peloLote = base(t)
  peloLote.receber(20, { tipo: 'Sinal' })
  peloLote.receber(30, { tipo: 'Parcial' })
  assert.deepEqual(atualizarLoteProducaoNoBanco(
    peloLote.db, peloLote.contexto, peloLote.dadosLote,
  ), { resultado: 'UPDATED', pedidoId: peloLote.pedidoId })
  assert.equal(peloLote.estado().pedido.status, 'Imprimindo')
  assert.equal(peloLote.estado().lote.status, 'Imprimindo')

  for (const f of [peloPedido, peloLote]) {
    assert.deepEqual(
      f.db.prepare('SELECT DISTINCT usuario_id FROM historico_pedidos WHERE pedido_id = ?').all(f.pedidoId),
      [{ usuario_id: f.usuarioId }],
    )
    assert.deepEqual(
      f.db.prepare('SELECT DISTINCT usuario_id FROM auditoria WHERE tenant_id = 1').all(),
      [{ usuario_id: f.usuarioId }],
    )
  }
})

test('pedido histórico com sinal de zero por cento continua podendo iniciar', (t) => {
  const peloPedido = base(t, { sinalPercentual: 0 })
  assert.equal(iniciarProducaoPedidoNoBanco(
    peloPedido.db, peloPedido.contexto, peloPedido.pedidoId,
  ), 'UPDATED')

  const peloLote = base(t, { sinalPercentual: 0 })
  assert.equal(atualizarLoteProducaoNoBanco(
    peloLote.db, peloLote.contexto, peloLote.dadosLote,
  ).resultado, 'UPDATED')
})

test('recebimento estornado não libera a produção', (t) => {
  const f = base(t)
  f.receber(50, { estornado: true, tipo: 'Sinal' })
  const anterior = f.estado()
  assert.throws(() => iniciarProducaoPedidoNoBanco(f.db, f.contexto, f.pedidoId), /SIGNAL_PENDING:50/)
  assert.throws(() => atualizarLoteProducaoNoBanco(f.db, f.contexto, f.dadosLote), /SIGNAL_PENDING:50/)
  confirmarSemEfeitos(f, anterior)
})

test('bloqueio do lote não deixa quantidade, tempo, status ou histórico parciais', (t) => {
  const f = base(t)
  const anterior = f.estado()
  assert.throws(() => atualizarLoteProducaoNoBanco(f.db, f.contexto, {
    ...f.dadosLote,
    quantidadeProduzida: 3,
    tempoRealHoras: 1.5,
  }), /SIGNAL_PENDING/)
  confirmarSemEfeitos(f, anterior)
})

test('sinal pendente bloqueia conclusão direta e avanço sem iniciar, sem efeitos parciais', (t) => {
  for (const dados of [
    { status: 'Concluído', quantidadeProduzida: 10, tempoRealHoras: 2 },
    { status: 'Planejado', quantidadeProduzida: 3, tempoRealHoras: 1 },
  ]) {
    const f = base(t)
    const anterior = f.estado()
    assert.throws(() => atualizarLoteProducaoNoBanco(f.db, f.contexto, {
      loteId: f.loteId,
      ...dados,
    }), /SIGNAL_PENDING:50/)
    confirmarSemEfeitos(f, anterior)
  }
})

test('orçamento não aprovado bloqueia conclusão direta e avanço sem iniciar', (t) => {
  for (const dados of [
    { status: 'Concluído', quantidadeProduzida: 10, tempoRealHoras: 2 },
    { status: 'Planejado', quantidadeProduzida: 3, tempoRealHoras: 1 },
  ]) {
    const f = base(t, { orcamentoStatus: 'Rascunho' })
    const anterior = f.estado()
    assert.throws(() => atualizarLoteProducaoNoBanco(f.db, f.contexto, {
      loteId: f.loteId,
      ...dados,
    }), /NOT_APPROVED/)
    confirmarSemEfeitos(f, anterior)
  }
})

test('lote planejado não pode pular o início nem registrar avanço após liberar o sinal', (t) => {
  for (const dados of [
    { status: 'Concluído', quantidadeProduzida: 10, tempoRealHoras: 2 },
    { status: 'Planejado', quantidadeProduzida: 3, tempoRealHoras: 1 },
  ]) {
    const f = base(t, { sinalPercentual: 0 })
    const anterior = f.estado()
    assert.throws(() => atualizarLoteProducaoNoBanco(f.db, f.contexto, {
      loteId: f.loteId,
      ...dados,
    }), /INVALID_LOT_TRANSITION|PRODUCTION_NOT_STARTED/)
    confirmarSemEfeitos(f, anterior)
  }
})

test('fluxo legítimo inicia, avança e conclui sem duplicar a conclusão', (t) => {
  const f = base(t)
  f.receber(50, { tipo: 'Sinal' })

  assert.equal(atualizarLoteProducaoNoBanco(
    f.db, f.contexto, f.dadosLote,
  ).resultado, 'UPDATED')
  assert.equal(atualizarLoteProducaoNoBanco(f.db, f.contexto, {
    ...f.dadosLote,
    quantidadeProduzida: 4,
    tempoRealHoras: 1.25,
  }).resultado, 'UPDATED')
  const conclusao = {
    ...f.dadosLote,
    status: 'Concluído',
    quantidadeProduzida: 10,
    tempoRealHoras: 2,
  }
  assert.equal(atualizarLoteProducaoNoBanco(
    f.db, f.contexto, conclusao,
  ).resultado, 'UPDATED')

  const concluido = f.estado()
  assert.equal(concluido.pedido.status, 'Imprimindo')
  assert.equal(concluido.pedido.quantidade_produzida, 10)
  assert.equal(concluido.lote.status, 'Concluído')
  assert.equal(concluido.lote.quantidade_produzida, 10)
  assert.equal(concluido.lote.tempo_real_horas, 2)
  assert.ok(concluido.lote.inicio_em)
  assert.ok(concluido.lote.fim_em)
  assert.equal(concluido.historico, 3)
  assert.equal(concluido.auditoria, 3)

  assert.equal(atualizarLoteProducaoNoBanco(
    f.db, f.contexto, conclusao,
  ).resultado, 'UNCHANGED')
  assert.deepEqual(f.estado(), concluido)
})

test('estorno posterior ao início não bloqueia avanço já em produção', (t) => {
  const f = base(t)
  f.receber(50, { tipo: 'Sinal' })
  assert.equal(atualizarLoteProducaoNoBanco(
    f.db, f.contexto, f.dadosLote,
  ).resultado, 'UPDATED')
  f.db.prepare(`UPDATE recebimentos SET estornado_em = '2026-01-02T00:00:00Z'
    WHERE pedido_id = ? AND tenant_id = 1`).run(f.pedidoId)

  assert.equal(atualizarLoteProducaoNoBanco(f.db, f.contexto, {
    ...f.dadosLote,
    quantidadeProduzida: 2,
    tempoRealHoras: 0.5,
  }).resultado, 'UPDATED')
  assert.equal(f.estado().lote.quantidade_produzida, 2)
})

test('repetir o início não duplica efeitos pelo pedido nem pelo lote', (t) => {
  const peloPedido = base(t, { sinalPercentual: 0 })
  assert.equal(iniciarProducaoPedidoNoBanco(
    peloPedido.db, peloPedido.contexto, peloPedido.pedidoId,
  ), 'UPDATED')
  const efeitosPedido = peloPedido.estado()
  assert.equal(iniciarProducaoPedidoNoBanco(
    peloPedido.db, peloPedido.contexto, peloPedido.pedidoId,
  ), 'UNCHANGED')
  assert.deepEqual(peloPedido.estado(), efeitosPedido)

  const peloLote = base(t, { sinalPercentual: 0 })
  assert.equal(atualizarLoteProducaoNoBanco(
    peloLote.db, peloLote.contexto, peloLote.dadosLote,
  ).resultado, 'UPDATED')
  const efeitosLote = peloLote.estado()
  assert.equal(atualizarLoteProducaoNoBanco(
    peloLote.db, peloLote.contexto, peloLote.dadosLote,
  ).resultado, 'UNCHANGED')
  assert.deepEqual(peloLote.estado(), efeitosLote)
})

test('empresa diferente e visualizador não alteram pedido, lote ou autoria', (t) => {
  const f = base(t, { sinalPercentual: 0 })
  const anterior = f.estado()
  const outraEmpresa = { ...f.contexto, tenantId: 2 }
  const visualizador = { ...f.contexto, perfil: 'visualizador' }
  assert.throws(() => iniciarProducaoPedidoNoBanco(f.db, outraEmpresa, f.pedidoId), /NOT_FOUND/)
  assert.throws(() => atualizarLoteProducaoNoBanco(f.db, outraEmpresa, f.dadosLote), /NOT_FOUND/)
  assert.throws(() => iniciarProducaoPedidoNoBanco(f.db, visualizador, f.pedidoId), /FORBIDDEN/)
  assert.throws(() => atualizarLoteProducaoNoBanco(f.db, visualizador, f.dadosLote), /FORBIDDEN/)
  confirmarSemEfeitos(f, anterior)
})
