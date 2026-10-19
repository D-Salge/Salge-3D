import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'
import { finalizarPedidoNoBanco, salvarOperacaoNoBanco, mensagemErroFechamento } from '../lib/fechamento-pedido.mjs'

const contexto = { tenantId: 1, usuarioId: 1, perfil: 'admin' }

function base(t, { saldo = 0, saldoLote = saldo, arquivado = true } = {}) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter((linha) => !linha.trim().toUpperCase().startsWith('PRAGMA')).join('\n'))
  applyMigrations(db)
  const cliente = Number(db.prepare("INSERT INTO clientes (tenant_id, usuario_id, nome) VALUES (1, 1, 'Cliente teste')").run().lastInsertRowid)
  const pedido = Number(db.prepare(`INSERT INTO pedidos
    (tenant_id, usuario_id, cliente_id, nome_da_peca, tempo_impressao_horas, valor_total_cobrado, status, orcamento_status, quantidade)
    VALUES (1, 1, ?, 'Peça teste', 2, 100, 'Acabamento', 'Aprovado', 10)`).run(cliente).lastInsertRowid)
  function filamento(nome, estoque, saldoDisponivel = estoque, ativo = 1) {
    const id = Number(db.prepare(`INSERT INTO filamentos
      (tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas, ativo)
      VALUES (1, 1, 'PLA', ?, 1000, 100, ?, ?)`).run(nome, estoque, ativo).lastInsertRowid)
    if (saldoDisponivel > 0) db.prepare(`INSERT INTO lotes_filamento
      (tenant_id, filamento_id, codigo, peso_inicial_gramas, saldo_gramas)
      VALUES (1, ?, ?, 1000, ?)`).run(id, `LOTE-${id}`, saldoDisponivel)
    return id
  }
  const antigo = filamento('Branco antigo', saldo, saldoLote, arquivado ? 0 : 1)
  const linha = Number(db.prepare(`INSERT INTO pedido_filamentos
    (pedido_id, filamento_id, peso_gasto_gramas, custo_calculado) VALUES (?, ?, 100, 10)`).run(pedido, antigo).lastInsertRowid)
  const revisao = { pedidoId: pedido, impressoraId: null, inicioPrevisto: '', fimPrevisto: '',
    tempoRealHoras: 3, custoExtraReal: 2, falhasImpressao: 0,
    materiais: [{ id: linha, consumoReal: 100 }], insumos: [] }
  const saldoDe = (id) => db.prepare('SELECT estoque_gramas AS saldo FROM filamentos WHERE id = ?').get(id).saldo
  const estado = () => db.prepare('SELECT status, tempo_real_horas, valor_total_cobrado, data_conclusao FROM pedidos WHERE id = ?').get(pedido)
  return { db, pedido, antigo, linha, revisao, filamento, saldoDe, estado }
}

function semEfeitos(f) {
  assert.equal(f.estado().status, 'Acabamento')
  assert.equal(f.estado().tempo_real_horas, null)
  assert.equal(f.estado().data_conclusao, null)
  assert.equal(f.db.prepare('SELECT consumo_real_gramas FROM pedido_filamentos WHERE id = ?').get(f.linha).consumo_real_gramas, null)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM historico_pedidos WHERE pedido_id = ?').get(f.pedido).n, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM movimentos_estoque WHERE pedido_id = ?').get(f.pedido).n, 0)
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidade = 'Pedido' AND entidade_id = ?").get(f.pedido).n, 0)
}

test('falha de estoque não deixa revisão ou histórico de sucesso gravados', (t) => {
  const f = base(t)
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INSUFFICIENT_STOCK/)
  semEfeitos(f)
  assert.equal(f.saldoDe(f.antigo), 0)
})

test('arquivar o filamento não impede fechar quando ainda existe saldo real e lotes', (t) => {
  const f = base(t, { saldo: 200 })
  assert.equal(finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), 'UPDATED')
  assert.equal(f.estado().status, 'Finalizado')
  assert.equal(f.estado().tempo_real_horas, 3)
  assert.equal(f.saldoDe(f.antigo), 100)
  assert.equal(f.db.prepare('SELECT ativo FROM filamentos WHERE id = ?').get(f.antigo).ativo, 0)
})

test('substituição explícita usa o novo filamento e mantém preço e custo orçado', (t) => {
  const f = base(t), novo = f.filamento('Branco novo', 500)
  f.revisao.materiais[0].filamentoIdReal = novo
  finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao)
  assert.equal(f.estado().status, 'Finalizado')
  assert.equal(f.estado().valor_total_cobrado, 100)
  assert.equal(f.saldoDe(f.antigo), 0)
  assert.equal(f.saldoDe(novo), 400)
  const linha = f.db.prepare('SELECT filamento_id, peso_gasto_gramas, custo_calculado FROM pedido_filamentos WHERE id = ?').get(f.linha)
  assert.deepEqual(linha, { filamento_id: novo, peso_gasto_gramas: 100, custo_calculado: 10 })
  const historico = f.db.prepare("SELECT descricao FROM historico_pedidos WHERE pedido_id = ? AND evento = 'Filamento substituído'").get(f.pedido)
  assert.match(historico.descricao, /Branco antigo/)
  assert.match(historico.descricao, /Branco novo/)
})

test('sem escolha explícita não troca automaticamente por outro branco de mesmo nome', (t) => {
  const f = base(t), novo = f.filamento('Branco antigo', 500)
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INSUFFICIENT_STOCK/)
  semEfeitos(f)
  assert.equal(f.saldoDe(novo), 500)
})

test('falta de saldo no substituto reverte vínculo, revisão e histórico', (t) => {
  const f = base(t), novo = f.filamento('Branco novo', 50)
  f.revisao.materiais[0].filamentoIdReal = novo
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INSUFFICIENT_STOCK/)
  semEfeitos(f)
  assert.equal(f.db.prepare('SELECT filamento_id FROM pedido_filamentos WHERE id = ?').get(f.linha).filamento_id, f.antigo)
  assert.equal(f.saldoDe(novo), 50)
})

test('saldo agregado sem cobertura nos lotes não permite fechamento nem cria estoque', (t) => {
  const f = base(t, { saldo: 200, saldoLote: 50 })
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INSUFFICIENT_STOCK:.*lotes/)
  semEfeitos(f)
  assert.equal(f.saldoDe(f.antigo), 200)
})

test('falha no segundo filamento reverte também a baixa FIFO do primeiro', (t) => {
  const f = base(t, { saldo: 200 }), segundo = f.filamento('Preto', 200, 50)
  const linha = Number(f.db.prepare(`INSERT INTO pedido_filamentos
    (pedido_id, filamento_id, peso_gasto_gramas, custo_calculado) VALUES (?, ?, 100, 10)`).run(f.pedido, segundo).lastInsertRowid)
  f.revisao.materiais.push({ id: linha, consumoReal: 100 })
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INSUFFICIENT_STOCK/)
  semEfeitos(f)
  assert.equal(f.saldoDe(f.antigo), 200)
  assert.equal(f.db.prepare('SELECT SUM(saldo_gramas) AS saldo FROM lotes_filamento WHERE filamento_id = ?').get(f.antigo).saldo, 200)
})

test('repetir o fechamento não baixa nem grava histórico novamente', (t) => {
  const f = base(t, { saldo: 200 })
  finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao)
  const eventos = f.db.prepare('SELECT COUNT(*) AS n FROM historico_pedidos WHERE pedido_id = ?').get(f.pedido).n
  assert.equal(finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), 'UNCHANGED')
  assert.equal(finalizarPedidoNoBanco(f.db, contexto, f.pedido), 'UNCHANGED')
  assert.equal(f.saldoDe(f.antigo), 100)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM historico_pedidos WHERE pedido_id = ?').get(f.pedido).n, eventos)
})

test('rejeita substituto arquivado ou de outra empresa', (t) => {
  const f = base(t), novo = f.filamento('Outro', 500, 500, 0)
  f.revisao.materiais[0].filamentoIdReal = novo
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INVALID_FILAMENT/)
  semEfeitos(f)
  f.db.prepare("INSERT INTO tenants (id, nome) VALUES (2, 'Outra empresa')").run()
  f.db.prepare('UPDATE filamentos SET ativo = 1, tenant_id = 2 WHERE id = ?').run(novo)
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INVALID_FILAMENT/)
  semEfeitos(f)
})

test('visualizador e empresa diferente não podem fechar o pedido', (t) => {
  const f = base(t, { saldo: 200 })
  assert.throws(() => finalizarPedidoNoBanco(f.db, { ...contexto, perfil: 'visualizador' }, f.pedido, f.revisao), /FORBIDDEN/)
  assert.throws(() => finalizarPedidoNoBanco(f.db, { ...contexto, tenantId: 2 }, f.pedido, f.revisao), /NOT_FOUND/)
  semEfeitos(f)
})

test('não finaliza fora do Acabamento nem com produção parcial', (t) => {
  const f = base(t, { saldo: 200 })
  f.db.prepare("UPDATE pedidos SET status = 'Fila' WHERE id = ?").run(f.pedido)
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INVALID_TRANSITION/)
  f.db.prepare("UPDATE pedidos SET status = 'Acabamento', quantidade_produzida = 4 WHERE id = ?").run(f.pedido)
  assert.throws(() => finalizarPedidoNoBanco(f.db, contexto, f.pedido, f.revisao), /INCOMPLETE_PRODUCTION:4:10/)
  semEfeitos(f)
})

test('salvar revisão sem finalizar preserva o estoque e registra o autor correto', (t) => {
  const f = base(t)
  const usuarioId = Number(f.db.prepare(`INSERT INTO usuarios (tenant_id, nome, email, senha_hash, perfil)
    VALUES (1, 'Operador teste', 'operador@example.invalid', 'teste', 'operador')`).run().lastInsertRowid)
  salvarOperacaoNoBanco(f.db, { ...contexto, usuarioId }, f.revisao)
  assert.equal(f.estado().status, 'Acabamento')
  assert.equal(f.estado().tempo_real_horas, 3)
  assert.equal(f.saldoDe(f.antigo), 0)
  assert.equal(f.db.prepare('SELECT usuario_id FROM historico_pedidos WHERE pedido_id = ?').get(f.pedido).usuario_id, usuarioId)
})

test('explica o bloqueio de saldo e de lotes sem mensagem de sucesso', () => {
  const mensagem = mensagemErroFechamento(new Error('INSUFFICIENT_STOCK:PLA Branco (lotes)'))
  assert.match(mensagem, /Não foi possível finalizar/)
  assert.match(mensagem, /PLA Branco \(lotes\)/)
  assert.match(mensagem, /Nenhuma baixa foi gravada/)
})
