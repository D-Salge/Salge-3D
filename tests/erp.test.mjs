import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularRentabilidade, calcularSaldoPendente } from '../lib/erp.mjs'

test('calcula saldo pendente sem permitir valor negativo', () => {
  assert.equal(calcularSaldoPendente(100, 35.5), 64.5)
  assert.equal(calcularSaldoPendente(100, 120), 0)
})

test('calcula custo real, lucro e margem do pedido', () => {
  assert.deepEqual(calcularRentabilidade({
    valorVendido: 200,
    custoFilamento: 20,
    custoInsumos: 5,
    custoEnergia: 4,
    custoMaquina: 30,
    custoEmbalagem: 6,
    fretePago: 10,
    custoExtra: 5,
  }), { custoReal: 80, lucroLiquido: 120, margemPercentual: 60 })
})

test('rejeita valores financeiros inválidos', () => {
  assert.throws(() => calcularSaldoPendente(-1, 0), RangeError)
  assert.throws(() => calcularRentabilidade({
    valorVendido: Number.NaN,
    custoFilamento: 0,
    custoInsumos: 0,
    custoEnergia: 0,
    custoMaquina: 0,
    custoEmbalagem: 0,
    fretePago: 0,
    custoExtra: 0,
  }), RangeError)
})
