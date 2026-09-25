import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { calcularSugestaoReposicao, CONSULTA_ITENS_REPOSICAO, resumirListaCompras } from '../lib/estoque.mjs'

test('projeta consumo aberto e sugere rolos inteiros de filamento', () => {
  assert.deepEqual(calcularSugestaoReposicao({
    tipo_item: 'Filamento', saldo: 800, minimo: 150, comprometido: 900,
    volume_reposicao: 1000, preco_volume: 90,
  }), { saldoProjetado: -100, quantidadeRepor: 1000, volumes: 1, custoEstimado: 90 })
})

test('repõe insumo até duas vezes o mínimo', () => {
  assert.deepEqual(calcularSugestaoReposicao({
    tipo_item: 'Insumo', saldo: 8, minimo: 5, comprometido: 4,
    volume_reposicao: 1, preco_volume: 0.5,
  }), { saldoProjetado: 4, quantidadeRepor: 6, volumes: 1, custoEstimado: 3 })
})

test('não sugere compra quando o saldo projetado permanece acima do mínimo', () => {
  assert.equal(calcularSugestaoReposicao({
    tipo_item: 'Filamento', saldo: 900, minimo: 150, comprometido: 100,
    volume_reposicao: 1000, preco_volume: 90,
  }).quantidadeRepor, 0)
})

test('resume quantidade e investimento da lista de compras', () => {
  assert.deepEqual(resumirListaCompras([{ custo_estimado: 90 }, { custo_estimado: 3.25 }]), {
    itens: 2, investimento: 93.25,
  })
})

test('consulta reserva somente pedidos aprovados ainda abertos', () => {
  const db = new Database(':memory:')
  try {
    db.exec(`
      CREATE TABLE filamentos (id INTEGER PRIMARY KEY, tenant_id INTEGER, material TEXT, cor TEXT,
        estoque_gramas REAL, peso_rolo_gramas REAL, estoque_minimo_gramas REAL,
        preco_rolo REAL, fornecedor TEXT, ativo INTEGER);
      CREATE TABLE insumos (id INTEGER PRIMARY KEY, tenant_id INTEGER, nome TEXT, estoque_atual REAL,
        estoque_minimo REAL, unidade TEXT, custo_unitario REAL, ativo INTEGER);
      CREATE TABLE pedidos (id INTEGER PRIMARY KEY, tenant_id INTEGER, orcamento_status TEXT, status TEXT);
      CREATE TABLE pedido_filamentos (pedido_id INTEGER, filamento_id INTEGER,
        peso_gasto_gramas REAL, consumo_real_gramas REAL);
      CREATE TABLE pedido_insumos (pedido_id INTEGER, insumo_id INTEGER, quantidade REAL, consumo_real REAL);
      INSERT INTO filamentos VALUES (1, 1, 'PLA', 'Branco', 500, 1000, 150, 90, 'Fornecedor', 1);
      INSERT INTO insumos VALUES (1, 1, 'Ímã 3x1', 20, 10, 'unid', 0.5, 1);
      INSERT INTO pedidos VALUES (1, 1, 'Aprovado', 'Fila');
      INSERT INTO pedidos VALUES (2, 1, 'Aprovado', 'Finalizado');
      INSERT INTO pedidos VALUES (3, 1, 'Rascunho', 'Fila');
      INSERT INTO pedido_filamentos VALUES (1, 1, 200, 180);
      INSERT INTO pedido_filamentos VALUES (2, 1, 300, 300);
      INSERT INTO pedido_filamentos VALUES (3, 1, 400, NULL);
      INSERT INTO pedido_insumos VALUES (1, 1, 4, NULL);
    `)
    const itens = db.prepare(CONSULTA_ITENS_REPOSICAO).all(1, 1)
    assert.equal(itens.find((item) => item.tipo_item === 'Filamento').comprometido, 180)
    assert.equal(itens.find((item) => item.tipo_item === 'Insumo').comprometido, 4)
  } finally {
    db.close()
  }
})
