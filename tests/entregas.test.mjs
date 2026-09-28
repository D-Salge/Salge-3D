import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularProgressoPedido, calcularValorProporcional } from '../lib/entregas.mjs'

test('calcula o valor proporcional de uma entrega parcial', () => {
  assert.equal(calcularValorProporcional(350, 100, 40), 140)
  assert.equal(calcularValorProporcional(57, 3, 1), 19)
})

test('calcula unidades e percentuais restantes', () => {
  assert.deepEqual(calcularProgressoPedido({
    quantidadeTotal: 100, quantidadeProduzida: 50, quantidadeEntregue: 40,
  }), {
    quantidadeRestanteProduzir: 50,
    quantidadeRestanteEntregar: 60,
    percentualProduzido: 50,
    percentualEntregue: 40,
  })
})

test('não permite entregar mais do que foi produzido', () => {
  assert.throws(() => calcularProgressoPedido({
    quantidadeTotal: 100, quantidadeProduzida: 30, quantidadeEntregue: 40,
  }), /Progresso do pedido inválido/)
})
