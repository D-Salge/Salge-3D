import assert from 'node:assert/strict'
import test from 'node:test'
import { priorizarPendencias } from '../lib/central-pendencias.mjs'

test('ordena pendências por prioridade e depois pela data mais antiga', () => {
  const resultado = priorizarPendencias([
    { id: 'a', prioridade: 'Media', dataReferencia: '2026-09-20' },
    { id: 'b', prioridade: 'Critica', dataReferencia: '2026-09-25' },
    { id: 'c', prioridade: 'Critica', dataReferencia: '2026-09-10' },
    { id: 'd', prioridade: 'Alta', dataReferencia: null },
  ])
  assert.deepEqual(resultado.map((item) => item.id), ['c', 'b', 'd', 'a'])
})

test('limita a quantidade exibida sem alterar a lista original', () => {
  const entrada = [{ id: 1, prioridade: 'Alta' }, { id: 2, prioridade: 'Critica' }]
  assert.deepEqual(priorizarPendencias(entrada, 1).map((item) => item.id), [2])
  assert.deepEqual(entrada.map((item) => item.id), [1, 2])
})
