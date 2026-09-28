import test from 'node:test'
import assert from 'node:assert/strict'
import { determinarStatusExpedicao, normalizarCodigoRastreio, resumirAtendimento } from '../lib/atendimento.mjs'
import { custoFichaTecnica, normalizarNomeProduto, proximaVersao } from '../lib/catalogo.mjs'

test('normaliza nome do produto para evitar cadastros duplicados', () => {
  assert.equal(normalizarNomeProduto('  Ímã   Bem-Estar '), 'ima bem-estar')
})

test('calcula próxima versão e custo unitário da ficha', () => {
  assert.equal(proximaVersao([1, 2, 4]), 5)
  assert.equal(custoFichaTecnica([
    { quantidadePorUnidade: 10, custoUnitario: 0.09 },
    { quantidadePorUnidade: 2, custoUnitario: 0.5 },
  ]), 1.9)
})

test('classifica expedição atrasada e normaliza rastreio', () => {
  assert.equal(normalizarCodigoRastreio(' br 123 456 br '), 'BR123456BR')
  assert.equal(determinarStatusExpedicao({ postadoEm: '2026-09-20', entregueEm: null, previsaoEntrega: '2026-09-27', hoje: '2026-09-28' }), 'Atrasado')
  assert.equal(determinarStatusExpedicao({ postadoEm: '2026-09-20', entregueEm: '2026-09-26', previsaoEntrega: '2026-09-27', hoje: '2026-09-28' }), 'Entregue')
})

test('resume ocorrências e expedições pendentes', () => {
  assert.deepEqual(resumirAtendimento([
    { status: 'Aberta', acao: 'Reimprimir' }, { status: 'Resolvida', acao: 'Trocar' },
  ], [
    { status: 'Em trânsito', postado_em: '2026-09-20', entregue_em: null, previsao_entrega: '2026-09-27' },
  ], '2026-09-28'), {
    ocorrenciasAbertas: 1, reimpressoesPendentes: 1, expedicoesEmAberto: 1, expedicoesAtrasadas: 1,
  })
})
