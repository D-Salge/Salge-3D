import assert from 'node:assert/strict'
import test from 'node:test'
import { classificarPrazo, resumirAgenda, somarDias } from '../lib/agenda.mjs'

test('soma dias atravessando mês e ano', () => {
  assert.equal(somarDias('2026-12-30', 3), '2027-01-02')
  assert.equal(somarDias('2028-02-28', 1), '2028-02-29')
})

test('classifica compromissos atrasados, de hoje e futuros', () => {
  assert.equal(classificarPrazo('2026-09-27', '2026-09-28'), 'Atrasado')
  assert.equal(classificarPrazo('2026-09-28', '2026-09-28'), 'Hoje')
  assert.equal(classificarPrazo('2026-10-03', '2026-09-28'), 'Proximos7Dias')
  assert.equal(classificarPrazo('2026-10-20', '2026-09-28'), 'Futuro')
})

test('resume a agenda sem alterar os itens', () => {
  const itens = [
    { vencimento_em: '2026-09-27' },
    { vencimento_em: '2026-09-28' },
    { vencimento_em: '2026-10-01' },
  ]
  assert.deepEqual(resumirAgenda(itens, '2026-09-28'), {
    total: 3, Atrasado: 1, Hoje: 1, Proximos7Dias: 1, Futuro: 0,
  })
  assert.equal(itens.length, 3)
})
