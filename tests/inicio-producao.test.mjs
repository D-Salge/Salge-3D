import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import {
  atualizarLoteProducaoNoBanco,
  iniciarProducaoPedidoNoBanco,
} from '../lib/inicio-producao.mjs'

function base(t, { sinalPercentual = 50 } = {}) {
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
    VALUES (1, ?, ?, 'Peça com sinal', 2, 100, 'Fila', 'Aprovado', 10, ?)`
  ).run(usuarioId, clienteId, sinalPercentual).lastInsertRowid)
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
      pedido: db.prepare('SELECT status, quantidade_produzida FROM pedidos WHERE id = ?').get(pedidoId),
      lote: db.prepare(`SELECT status, quantidade_produzida, tempo_real_horas, inicio_em
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
