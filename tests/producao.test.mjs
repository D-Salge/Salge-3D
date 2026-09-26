import assert from 'node:assert/strict'
import test from 'node:test'
import { planejarFilaProducao } from '../lib/producao.mjs'

const impressoras = [{ id: 1, nome: 'P2S' }, { id: 2, nome: 'A1 Mini' }]

test('agenda pedidos por impressora sem sobreposição e prioriza impressão em andamento', () => {
  const plano = planejarFilaProducao({
    impressoras,
    agora: '2026-09-26T00:00:00.000Z',
    pedidos: [
      { id: 1, impressora_id: 1, status: 'Fila', tempo_impressao_horas: 2, data_entrega: '2026-09-27', data_pedido: '2026-09-25' },
      { id: 2, impressora_id: 1, status: 'Imprimindo', tempo_impressao_horas: 3, data_entrega: '2026-09-28', data_pedido: '2026-09-26' },
    ],
  })
  const fila = plano.impressoras[0].pedidos
  assert.deepEqual(fila.map((pedido) => pedido.id), [2, 1])
  assert.equal(fila[0].fim_previsto_calculado, fila[1].inicio_previsto_calculado)
  assert.equal(plano.impressoras[0].horas_planejadas, 5)
})

test('separa pedidos sem impressora e sinaliza atraso previsto', () => {
  const plano = planejarFilaProducao({
    impressoras,
    agora: '2026-09-26T00:00:00.000Z',
    pedidos: [
      { id: 3, impressora_id: null, status: 'Fila', tempo_impressao_horas: 1, data_entrega: null, data_pedido: '2026-09-25' },
      { id: 4, impressora_id: 2, status: 'Fila', tempo_impressao_horas: 49, data_entrega: '2026-09-27', data_pedido: '2026-09-25' },
    ],
  })
  assert.deepEqual(plano.semImpressora.map((pedido) => pedido.id), [3])
  assert.equal(plano.impressoras[1].pedidos[0].atrasado, true)
})
