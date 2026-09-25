import assert from 'node:assert/strict'
import test from 'node:test'
import { agruparVendasPorProduto } from '../lib/relatorios.mjs'

test('agrupa vendas do mesmo produto ignorando acentos, caixa e espaços', () => {
  const produtos = agruparVendasPorProduto([
    {
      id: 1,
      nome_da_peca: 'Espremedor de Pasta de Dente',
      cliente_id: 10,
      quantidade: 3,
      valor_total_cobrado: 57,
      custo_total: 30,
      data_pedido: '2026-09-20T12:00:00Z',
    },
    {
      id: 2,
      nome_da_peca: '  ESPREMEDOR de pasta de dênte ',
      cliente_id: 11,
      quantidade: 2,
      valor_total_cobrado: 40,
      custo_total: 20,
      data_pedido: '2026-09-22T12:00:00Z',
    },
  ])

  assert.equal(produtos.length, 1)
  assert.equal(produtos[0].pedidos, 2)
  assert.equal(produtos[0].unidades, 5)
  assert.equal(produtos[0].clientes, 2)
  assert.equal(produtos[0].faturamento, 97)
  assert.equal(produtos[0].lucro, 47)
  assert.equal(produtos[0].receita_media_unidade, 19.4)
  assert.equal(produtos[0].ultimo_pedido_id, 2)
})

test('ordena produtos pelo maior faturamento', () => {
  const produtos = agruparVendasPorProduto([
    { id: 1, nome_da_peca: 'Produto A', cliente_id: 1, quantidade: 1, valor_total_cobrado: 20, custo_total: 10, data_pedido: '2026-09-20' },
    { id: 2, nome_da_peca: 'Produto B', cliente_id: 1, quantidade: 1, valor_total_cobrado: 50, custo_total: 20, data_pedido: '2026-09-21' },
  ])
  assert.equal(produtos[0].nome, 'Produto B')
  assert.equal(produtos[1].nome, 'Produto A')
})
