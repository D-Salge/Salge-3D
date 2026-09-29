import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularDesviosOperacao } from '../lib/desvios-operacao.mjs'

test('classifica desvios operacionais e a completude dos dados reais', () => {
  const resumo = calcularDesviosOperacao({
    custoPrevisto: 100, custoReal: 120,
    horasPrevistas: 10, horasReais: 10.5,
    filamentoPrevisto: 500, filamentoReal: 530,
    custoMateriaisPrevisto: 50, custoMateriaisReal: 54,
    camposReais: 2, camposTotais: 4,
  })
  assert.equal(resumo.nivel, 'Crítico')
  assert.equal(resumo.itens[0].percentual, 20)
  assert.equal(resumo.completude, 50)
  assert.equal(resumo.usandoEstimativas, true)
})

test('não produz divisão inválida quando o previsto é zero', () => {
  const resumo = calcularDesviosOperacao({
    custoPrevisto: 0, custoReal: 0, horasPrevistas: 0, horasReais: 0,
    filamentoPrevisto: 0, filamentoReal: 0,
    custoMateriaisPrevisto: 0, custoMateriaisReal: 0,
  })
  assert.equal(resumo.nivel, 'Dentro')
  assert.equal(resumo.itens[0].percentual, 0)
})
