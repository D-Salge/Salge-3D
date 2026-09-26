import assert from 'node:assert/strict'
import test from 'node:test'
import { listarCompetencias, recorrenciaAtivaNaCompetencia, vencimentoDaCompetencia, vencimentoDaRecorrencia } from '../lib/recorrencias.mjs'

test('limita o vencimento ao último dia do mês', () => {
  assert.equal(vencimentoDaCompetencia('2026-02', 31), '2026-02-28')
  assert.equal(vencimentoDaCompetencia('2028-02', 31), '2028-02-29')
  assert.equal(vencimentoDaCompetencia('2026-09', 15), '2026-09-15')
})

test('lista competências mensais sem ultrapassar o limite', () => {
  assert.deepEqual(listarCompetencias('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02'])
  assert.deepEqual(listarCompetencias('2026-01', '2026-12', 2), ['2026-01', '2026-02'])
})

test('respeita início, término e arquivamento da recorrência', () => {
  const item = { inicia_em: '2026-03-10', termina_em: '2026-05-20', ativo: 1 }
  assert.equal(recorrenciaAtivaNaCompetencia(item, '2026-02'), false)
  assert.equal(recorrenciaAtivaNaCompetencia(item, '2026-04'), true)
  assert.equal(recorrenciaAtivaNaCompetencia(item, '2026-06'), false)
  assert.equal(recorrenciaAtivaNaCompetencia({ ...item, ativo: 0 }, '2026-04'), false)
})

test('não gera cobrança antes do início nem depois do término exato', () => {
  const item = { inicia_em: '2026-09-20', termina_em: '2026-11-05', dia_vencimento: 10, ativo: 1 }
  assert.equal(vencimentoDaRecorrencia(item, '2026-09'), null)
  assert.equal(vencimentoDaRecorrencia(item, '2026-10'), '2026-10-10')
  assert.equal(vencimentoDaRecorrencia(item, '2026-11'), null)
})
