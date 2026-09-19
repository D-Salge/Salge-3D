import assert from 'node:assert/strict'
import test from 'node:test'
import { adicionarMeses, distribuirRecebimento, dividirEmParcelas } from '../lib/financeiro.mjs'

test('divide valores em parcelas sem perder centavos', () => {
  assert.deepEqual(dividirEmParcelas(100, 3), [33.34, 33.33, 33.33])
  assert.equal(dividirEmParcelas(199.99, 6).reduce((a, b) => a + b, 0).toFixed(2), '199.99')
})

test('mantém o dia do vencimento e limita ao último dia do mês', () => {
  assert.equal(adicionarMeses('2026-01-31', 1), '2026-02-28')
  assert.equal(adicionarMeses('2028-01-31', 1), '2028-02-29')
})

test('distribui pagamento nas parcelas mais antigas', () => {
  assert.deepEqual(distribuirRecebimento(70, [
    { id: 1, valor: 50, recebido: 20 },
    { id: 2, valor: 50, recebido: 0 },
  ]), {
    alocacoes: [{ parcelaId: 1, valor: 30 }, { parcelaId: 2, valor: 40 }],
    restante: 0,
  })
})
