import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularValorSinal, classificarRecebimentoAutomatico, percentualDoPedido } from '../lib/sinal.mjs'

test('calcula o sinal e arredonda em centavos', () => {
  assert.equal(calcularValorSinal(229.90, 50), 114.95)
  assert.equal(calcularValorSinal(350, 40), 140)
})

test('calcula quanto o recebimento representa do pedido', () => {
  assert.equal(percentualDoPedido(140, 350), 40)
  assert.equal(percentualDoPedido(33.33, 100), 33.33)
})

test('classifica sinal, pagamento parcial e quitação automática', () => {
  assert.equal(classificarRecebimentoAutomatico({ valor: 115, saldo: 230, valorTotal: 230, sinalPercentual: 50 }), 'Sinal')
  assert.equal(classificarRecebimentoAutomatico({ valor: 50, saldo: 115, valorTotal: 230, sinalPercentual: 50, sinalRecebido: 115 }), 'Parcial')
  assert.equal(classificarRecebimentoAutomatico({ valor: 115, saldo: 115, valorTotal: 230, sinalPercentual: 50, sinalRecebido: 115 }), 'Quitacao')
})

test('rejeita percentuais fora do intervalo', () => {
  assert.throws(() => calcularValorSinal(100, 101), /Percentual/)
  assert.throws(() => calcularValorSinal(100, -1), /Percentual/)
})
