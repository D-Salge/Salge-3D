import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularLimiteMei, resumirLimiteMei, vencimentoDas } from '../lib/mei.mjs'

test('calcula limite anual e proporcional no ano de abertura', () => {
  assert.equal(calcularLimiteMei({ ano: 2026, inicioEm: null }), 81000)
  assert.equal(calcularLimiteMei({ ano: 2026, inicioEm: '2026-06-15' }), 47250)
  assert.equal(calcularLimiteMei({ ano: 2027, inicioEm: '2026-06-15' }), 81000)
  assert.equal(calcularLimiteMei({ ano: 2025, inicioEm: '2026-06-15' }), 0)
})

test('classifica atenção e excesso no limite do MEI', () => {
  assert.equal(resumirLimiteMei(40000, 81000).situacao, 'Dentro do limite')
  assert.equal(resumirLimiteMei(70000, 81000).situacao, 'Atenção')
  assert.equal(resumirLimiteMei(82000, 81000).situacao, 'Excedido')
})

test('DAS vence no dia 20 do mês seguinte à competência', () => {
  assert.equal(vencimentoDas('2026-01'), '2026-02-20')
  assert.equal(vencimentoDas('2026-12'), '2027-01-20')
})

