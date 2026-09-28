import test from 'node:test'
import assert from 'node:assert/strict'
import { calcularTotalCompra, precoUnitarioEstoque, ratearCompraPorCategoria } from '../lib/compras.mjs'

test('calcula subtotal e total da compra com frete e desconto', () => {
  assert.deepEqual(calcularTotalCompra([{ valorTotal: 100 }, { valorTotal: 50 }], 12, 2), {
    subtotal: 150, total: 160,
  })
})

test('calcula custo por unidade de estoque', () => {
  assert.equal(precoUnitarioEstoque(322.92, 7), 46.13143)
})

test('rateia compra mista sem perder centavos', () => {
  assert.deepEqual(ratearCompraPorCategoria([
    { tipoItem: 'Filamento', valorTotal: 100 },
    { tipoItem: 'Insumo', valorTotal: 50 },
  ], 10, 1), [
    { categoria: 'Filamentos', valor: 106 },
    { categoria: 'Insumos', valor: 53 },
  ])
})

test('rejeita desconto maior que a compra', () => {
  assert.throws(() => calcularTotalCompra([{ valorTotal: 10 }], 0, 11), /TOTAL_INVALIDO/)
  assert.throws(() => calcularTotalCompra([{ valorTotal: 10 }], 0, 10), /TOTAL_INVALIDO/)
  assert.throws(() => calcularTotalCompra([{ valorTotal: 10 }], Number.NaN, 0), /TOTAL_INVALIDO/)
})
