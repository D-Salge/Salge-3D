import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularConversaoFunil, montarDreMensal, percentualMeta, ultimasCompetencias, variacaoPercentual } from '../lib/relatorios.mjs'

test('gera as últimas competências atravessando a virada do ano', () => {
  assert.deepEqual(ultimasCompetencias('2026-02-15', 4), ['2025-11', '2025-12', '2026-01', '2026-02'])
})

test('combina vendas e despesas sem omitir meses vazios', () => {
  const dre = montarDreMensal(
    ['2026-08', '2026-09'],
    [{ competencia: '2026-09', pedidos: 2, receita: 300, custosPedidos: 120 }],
    [{ competencia: '2026-09', despesasAdministrativas: 30, comprasInvestimentos: 80 }],
  )
  assert.deepEqual(dre[0], { competencia: '2026-08', pedidos: 0, receita: 0, custosPedidos: 0, lucroPedidos: 0, despesasAdministrativas: 0, comprasInvestimentos: 0, resultadoGerencial: 0, margem: 0 })
  assert.equal(dre[1].resultadoGerencial, 150)
  assert.equal(dre[1].margem, 50)
})

test('calcula progresso, variação e conversão com bases vazias', () => {
  assert.equal(percentualMeta(750, 1000), 75)
  assert.equal(percentualMeta(10, 0), 0)
  assert.equal(variacaoPercentual(200, 100), 100)
  assert.equal(variacaoPercentual(50, 0), 100)
  assert.equal(calcularConversaoFunil({ aprovados: 6, recusados: 2, expirados: 2 }), 60)
  assert.equal(calcularConversaoFunil({}), 0)
})
