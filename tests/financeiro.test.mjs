import assert from 'node:assert/strict'
import test from 'node:test'
import { adicionarMeses, distribuirRecebimento, dividirEmParcelas, gerarParcelas } from '../lib/financeiro.mjs'

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

test('gera parcelas de despesa com centavos e vencimentos mensais corretos', () => {
  const parcelas = gerarParcelas(322.92, 7, '2026-09-30')

  assert.equal(parcelas.length, 7)
  assert.deepEqual(parcelas.map((item) => item.valor), [46.14, 46.13, 46.13, 46.13, 46.13, 46.13, 46.13])
  assert.deepEqual(parcelas.map((item) => item.vencimentoEm), [
    '2026-09-30', '2026-10-30', '2026-11-30', '2026-12-30',
    '2027-01-30', '2027-02-28', '2027-03-30',
  ])
  assert.equal(Math.round(parcelas.reduce((total, item) => total + item.valor, 0) * 100), 32292)
})
