import assert from 'node:assert/strict'
import test from 'node:test'

import { arredondarMoeda, calcularOrcamento } from '../lib/orcamento.mjs'

test('arredonda valores monetários em centavos', () => {
  assert.equal(arredondarMoeda(10.005), 10.01)
})

test('calcula material, máquina, taxa e total', () => {
  const total = calcularOrcamento({
    tempoImpressaoHoras: 2.5,
    custoHoraMaquina: 8.5,
    taxaOperacional: 18,
    materiais: [
      { pesoGramas: 100, custoPorGrama: 0.09 },
      { pesoGramas: 50, custoPorGrama: 0.12 },
    ],
  })

  assert.deepEqual(total, {
    materialCost: 15,
    machineReserve: 21.25,
    operationalFee: 18,
    total: 54.25,
  })
})

test('rejeita números inválidos ou negativos', () => {
  assert.throws(
    () => calcularOrcamento({
      tempoImpressaoHoras: -1,
      custoHoraMaquina: 8.5,
      taxaOperacional: 18,
      materiais: [],
    }),
    /tempoImpressaoHoras/,
  )

  assert.throws(() => arredondarMoeda(Number.NaN), /inválido/)
})
