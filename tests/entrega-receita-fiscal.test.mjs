import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import { registrarEntregaParcialNoBanco } from '../lib/registro-entrega.mjs'
import { registrarReceitaFiscalDeRecebimento } from '../lib/receitas-fiscais.mjs'

function criarBase(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter((linha) => !linha.trim().toUpperCase().startsWith('PRAGMA')).join('\n'))
  applyMigrations(db)
  db.prepare(`UPDATE tenants SET mei_natureza_padrao = 'Serviço' WHERE id = 1`).run()
  const adminId = db.prepare(`SELECT id FROM usuarios
    WHERE tenant_id = 1 AND perfil = 'admin' ORDER BY id LIMIT 1`).get().id

  const operadorId = Number(db.prepare(`INSERT INTO usuarios
    (tenant_id, nome, email, senha_hash, perfil)
    VALUES (1, 'Operador entrega', 'entrega@example.invalid', 'teste', 'operador')`
  ).run().lastInsertRowid)
  const visualizadorId = Number(db.prepare(`INSERT INTO usuarios
    (tenant_id, nome, email, senha_hash, perfil)
    VALUES (1, 'Leitor entrega', 'leitor-entrega@example.invalid', 'teste', 'visualizador')`
  ).run().lastInsertRowid)
  const clienteId = Number(db.prepare(`INSERT INTO clientes
    (tenant_id, usuario_id, nome) VALUES (1, ?, 'Cliente entrega')`
  ).run(operadorId).lastInsertRowid)
  const pedidoId = Number(db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas,
      valor_total_cobrado, status, orcamento_status, quantidade, quantidade_produzida,
      numero_orcamento)
    VALUES (1, ?, ?, 'Peça fiscal', 2, 100, 'Acabamento', 'Aprovado', 10, 0, 'ORC-TESTE')`
  ).run(operadorId, clienteId).lastInsertRowid)
  db.prepare(`INSERT INTO parcelas_receber
    (tenant_id, pedido_id, numero, valor, vencimento_em)
    VALUES (1, ?, 1, 100, '2026-10-31')`).run(pedidoId)

  const outroTenantId = Number(db.prepare(`INSERT INTO tenants
    (nome, mei_natureza_padrao) VALUES ('Outra empresa', 'Venda')`
  ).run().lastInsertRowid)
  const outroUsuarioId = Number(db.prepare(`INSERT INTO usuarios
    (tenant_id, nome, email, senha_hash, perfil)
    VALUES (?, 'Outro operador', 'outro@example.invalid', 'teste', 'operador')`
  ).run(outroTenantId).lastInsertRowid)

  const contexto = { tenantId: 1, usuarioId: operadorId, perfil: 'operador' }
  const dados = {
    operacaoId: randomUUID(),
    pedidoId,
    quantidade: 2,
    entregueEm: '2026-10-19',
    observacao: 'Primeira remessa',
    registrarPagamento: true,
    valorRecebido: 20,
    formaPagamento: 'Pix',
  }
  const contagem = (tabela) => db.prepare(`SELECT COUNT(*) AS total FROM ${tabela}`).get().total
  const estado = () => ({
    entregas: contagem('entregas_pedido'),
    recebimentos: contagem('recebimentos'),
    alocacoes: contagem('recebimento_alocacoes'),
    receitas: contagem('receitas_fiscais'),
    historico: contagem('historico_pedidos'),
    auditoria: contagem('auditoria'),
    quantidadeProduzida: db.prepare('SELECT quantidade_produzida FROM pedidos WHERE id = ?').get(pedidoId).quantidade_produzida,
  })
  return {
    adminId, contexto, dados, db, estado, operadorId, outroTenantId, outroUsuarioId,
    pedidoId, visualizadorId,
  }
}

test('entrega parcial com pagamento grava recebimento, alocação e receita fiscal uma vez', (t) => {
  const f = criarBase(t)
  const resultado = registrarEntregaParcialNoBanco(f.db, f.contexto, f.dados)
  assert.equal(resultado.resultado, 'CREATED')
  assert.deepEqual(f.estado(), {
    entregas: 1, recebimentos: 1, alocacoes: 1, receitas: 1,
    historico: 1, auditoria: 2, quantidadeProduzida: 2,
  })
  assert.deepEqual(f.db.prepare(`SELECT rf.tenant_id, rf.usuario_id, rf.data_competencia,
      rf.natureza, rf.origem, rf.valor, r.pedido_id
    FROM receitas_fiscais rf JOIN recebimentos r ON r.id = rf.recebimento_id`).get(), {
    tenant_id: 1,
    usuario_id: f.operadorId,
    data_competencia: '2026-10-19',
    natureza: 'Serviço',
    origem: 'ERP',
    valor: 20,
    pedido_id: f.pedidoId,
  })
  assert.deepEqual(
    f.db.prepare(`SELECT DISTINCT usuario_id FROM auditoria ORDER BY usuario_id`).all(),
    [{ usuario_id: f.operadorId }],
  )
})

test('entrega sem pagamento não cria recebimento, alocação ou receita', (t) => {
  const f = criarBase(t)
  const resultado = registrarEntregaParcialNoBanco(f.db, f.contexto, {
    ...f.dados, registrarPagamento: false, valorRecebido: 0,
  })
  assert.equal(resultado.resultado, 'CREATED')
  assert.deepEqual(f.estado(), {
    entregas: 1, recebimentos: 0, alocacoes: 0, receitas: 0,
    historico: 1, auditoria: 1, quantidadeProduzida: 2,
  })
})

test('falha ao gravar a receita fiscal desfaz toda a entrega', (t) => {
  const f = criarBase(t)
  const anterior = f.estado()
  f.db.exec(`CREATE TRIGGER falha_receita BEFORE INSERT ON receitas_fiscais
    BEGIN SELECT RAISE(ABORT, 'FALHA_RECEITA'); END`)
  assert.throws(
    () => registrarEntregaParcialNoBanco(f.db, f.contexto, f.dados),
    /FALHA_RECEITA/,
  )
  assert.deepEqual(f.estado(), anterior)
})

test('reenvio da mesma operação não duplica entrega, pagamento ou receita', (t) => {
  const f = criarBase(t)
  const primeiro = registrarEntregaParcialNoBanco(f.db, f.contexto, f.dados)
  const estadoCriado = f.estado()
  const repetido = registrarEntregaParcialNoBanco(f.db, f.contexto, f.dados)
  assert.deepEqual(repetido, { resultado: 'UNCHANGED', entregaId: primeiro.entregaId })
  assert.deepEqual(f.estado(), estadoCriado)
})

test('operações distintas com os mesmos dados continuam permitidas', (t) => {
  const f = criarBase(t)
  registrarEntregaParcialNoBanco(f.db, f.contexto, f.dados)
  registrarEntregaParcialNoBanco(f.db, {
    tenantId: 1, usuarioId: f.adminId, perfil: 'admin',
  }, {
    ...f.dados, operacaoId: randomUUID(),
  })
  assert.deepEqual(f.estado(), {
    entregas: 2, recebimentos: 2, alocacoes: 2, receitas: 2,
    historico: 2, auditoria: 4, quantidadeProduzida: 4,
  })
})

test('empresa alheia, visualizador e contexto anônimo são bloqueados sem efeitos', (t) => {
  const f = criarBase(t)
  const anterior = f.estado()
  assert.throws(() => registrarEntregaParcialNoBanco(f.db, {
    tenantId: f.outroTenantId, usuarioId: f.outroUsuarioId, perfil: 'operador',
  }, f.dados), /NOT_FOUND/)
  assert.throws(() => registrarEntregaParcialNoBanco(f.db, {
    tenantId: 1, usuarioId: f.visualizadorId, perfil: 'visualizador',
  }, f.dados), /FORBIDDEN/)
  assert.throws(() => registrarEntregaParcialNoBanco(f.db, null, f.dados), /UNAUTHORIZED/)
  assert.deepEqual(f.estado(), anterior)
})

test('regra fiscal compartilhada preserva o caminho comum de recebimento', (t) => {
  const f = criarBase(t)
  const recebimentoId = Number(f.db.prepare(`INSERT INTO recebimentos
    (tenant_id, pedido_id, valor, forma_pagamento, data_recebimento, observacao)
    VALUES (1, ?, 15, 'Transferencia', '2026-10-18', 'Recebimento comum')`
  ).run(f.pedidoId).lastInsertRowid)
  registrarReceitaFiscalDeRecebimento(f.db, {
    tenantId: 1,
    usuarioId: f.operadorId,
    recebimentoId,
    pedidoId: f.pedidoId,
  })
  assert.deepEqual(f.db.prepare(`SELECT recebimento_id, data_competencia, natureza,
      origem, descricao, valor FROM receitas_fiscais`).get(), {
    recebimento_id: recebimentoId,
    data_competencia: '2026-10-18',
    natureza: 'Serviço',
    origem: 'ERP',
    descricao: 'Recebimento ORC-TESTE — Peça fiscal',
    valor: 15,
  })
})
