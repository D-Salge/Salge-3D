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
  assert.equal(plano.semImpressora[0].impressora_sugerida_id, 1)
})

test('respeita prioridade manual antes da data de entrega', () => {
  const plano = planejarFilaProducao({
    impressoras: [{ id: 1, nome: 'P2S', intervalo_entre_trabalhos_minutos: 0, bloqueios: [] }],
    agora: '2026-09-26T00:00:00.000Z',
    pedidos: [
      { id: 1, impressora_id: 1, status: 'Fila', prioridade_producao: 'Normal', ordem_fila: 1, tempo_impressao_horas: 1, data_entrega: '2026-09-26', data_pedido: '2026-09-20' },
      { id: 2, impressora_id: 1, status: 'Fila', prioridade_producao: 'Urgente', ordem_fila: 2, tempo_impressao_horas: 1, data_entrega: '2026-09-30', data_pedido: '2026-09-21' },
    ],
  })
  assert.deepEqual(plano.impressoras[0].pedidos.map((pedido) => pedido.id), [2, 1])
})

test('pula bloqueios e inclui intervalo operacional entre trabalhos', () => {
  const plano = planejarFilaProducao({
    impressoras: [{
      id: 1, nome: 'P2S', intervalo_entre_trabalhos_minutos: 30,
      bloqueios: [{ inicio_em: '2026-09-26T01:00:00.000Z', fim_em: '2026-09-26T03:00:00.000Z' }],
    }],
    agora: '2026-09-26T00:00:00.000Z',
    pedidos: [
      { id: 1, impressora_id: 1, status: 'Fila', tempo_impressao_horas: 2, data_entrega: null, data_pedido: '2026-09-20' },
      { id: 2, impressora_id: 1, status: 'Fila', tempo_impressao_horas: 1, data_entrega: null, data_pedido: '2026-09-21' },
    ],
  })
  const fila = plano.impressoras[0].pedidos
  assert.equal(fila[0].inicio_previsto_calculado, '2026-09-26T03:00:00.000Z')
  assert.equal(fila[1].inicio_previsto_calculado, '2026-09-26T05:30:00.000Z')
})

test('sugere para pedido sem máquina a impressora que termina primeiro', () => {
  const plano = planejarFilaProducao({
    impressoras: [
      { id: 1, nome: 'P2S', bloqueios: [] },
      { id: 2, nome: 'A1 Mini', bloqueios: [] },
    ],
    agora: '2026-09-26T00:00:00.000Z',
    pedidos: [
      { id: 1, impressora_id: 1, status: 'Fila', tempo_impressao_horas: 10, data_entrega: null, data_pedido: '2026-09-20' },
      { id: 2, impressora_id: null, status: 'Fila', tempo_impressao_horas: 2, data_entrega: null, data_pedido: '2026-09-21' },
    ],
  })
  assert.equal(plano.semImpressora[0].impressora_sugerida_id, 2)
  assert.equal(plano.semImpressora[0].fim_previsto_sugerido, '2026-09-26T02:00:00.000Z')
})

test('distribuição automática respeita impressora preferida e diâmetro do bico', () => {
  const plano = planejarFilaProducao({
    impressoras: [
      { id: 1, nome: 'P2S', bico_atual: '0.2 mm', bloqueios: [] },
      { id: 2, nome: 'A1 Mini', bico_atual: '0.4 mm', bloqueios: [] },
    ],
    agora: '2026-09-26T00:00:00.000Z',
    pedidos: [
      { id: 1, impressora_id: null, impressora_preferida_id: 1, diametro_bico_mm: 0.2,
        status: 'Fila', tempo_impressao_horas: 2, data_entrega: null, data_pedido: '2026-09-21' },
    ],
  })
  assert.equal(plano.semImpressora[0].impressora_sugerida_id, 1)
})
