import assert from 'node:assert/strict'
import test from 'node:test'
import { calcularIndicadoresQualidade, calcularStatusManutencao } from '../lib/manutencao.mjs'

test('classifica manutenção em dia, próxima e vencida pelas horas de uso', () => {
  assert.deepEqual(
    calcularStatusManutencao({ horasTotais: 170, horasUltimaManutencao: 50, intervaloHoras: 200 }),
    { status: 'Em dia', horasDesdeManutencao: 120, horasRestantes: 80, percentual: 60 },
  )
  assert.equal(
    calcularStatusManutencao({ horasTotais: 210, horasUltimaManutencao: 50, intervaloHoras: 200 }).status,
    'Proxima',
  )
  assert.deepEqual(
    calcularStatusManutencao({ horasTotais: 280, horasUltimaManutencao: 50, intervaloHoras: 200 }),
    { status: 'Vencida', horasDesdeManutencao: 230, horasRestantes: 0, percentual: 115 },
  )
})

test('calcula falhas, desvio de tempo, custo e lucro por impressora', () => {
  assert.deepEqual(calcularIndicadoresQualidade({
    pedidosFinalizados: 10,
    pedidosComFalha: 2,
    totalFalhas: 3,
    horasPrevistas: 40,
    horasReais: 44.25,
    custoExtra: 18.555,
    custoProducao: 200.101,
    faturamento: 350,
  }), {
    pedidosFinalizados: 10,
    pedidosComFalha: 2,
    totalFalhas: 3,
    taxaPedidosComFalha: 20,
    horasPrevistas: 40,
    horasReais: 44.3,
    desvioHoras: 4.3,
    custoExtra: 18.56,
    custoProducao: 200.1,
    faturamento: 350,
    lucroEstimado: 149.9,
  })
})

test('não gera NaN quando uma impressora ainda não possui produção', () => {
  const resultado = calcularIndicadoresQualidade({})
  assert.equal(resultado.taxaPedidosComFalha, 0)
  assert.equal(resultado.desvioHoras, 0)
  assert.equal(resultado.lucroEstimado, 0)
})
