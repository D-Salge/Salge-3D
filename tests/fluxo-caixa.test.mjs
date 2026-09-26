import assert from 'node:assert/strict'
import test from 'node:test'
import { projetarFluxoCaixa } from '../lib/fluxo-caixa.mjs'

test('projeta entradas, saídas e saldo acumulado por mês', () => {
  const projecao = projetarFluxoCaixa({
    saldoInicial: 100,
    inicio: '2026-09-26',
    meses: 3,
    movimentos: [
      { data: '2026-09-10', tipo: 'Entrada', valor: 50 },
      { data: '2026-09-30', tipo: 'Saida', valor: 20 },
      { data: '2026-10-15', tipo: 'Entrada', valor: 80 },
      { data: '2026-10-20', tipo: 'Saida', valor: 200 },
    ],
  })
  assert.deepEqual(projecao.periodos, [
    { chave: '2026-09', entradas: 50, saidas: 20, resultado: 30, saldo: 130 },
    { chave: '2026-10', entradas: 80, saidas: 200, resultado: -120, saldo: 10 },
    { chave: '2026-11', entradas: 0, saidas: 0, resultado: 0, saldo: 10 },
  ])
  assert.equal(projecao.menorSaldo, 10)
})

test('traz valores vencidos para o mês atual e ignora fora do horizonte', () => {
  const projecao = projetarFluxoCaixa({
    saldoInicial: 0,
    inicio: '2026-09-26',
    meses: 2,
    movimentos: [
      { data: '2026-07-01', tipo: 'Entrada', valor: 30 },
      { data: '2027-01-01', tipo: 'Saida', valor: 90 },
    ],
  })
  assert.equal(projecao.periodos[0].entradas, 30)
  assert.equal(projecao.periodos[1].saidas, 0)
})
