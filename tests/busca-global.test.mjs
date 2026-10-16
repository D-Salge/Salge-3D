import assert from 'node:assert/strict'
import test from 'node:test'
import { criarPadraoLike, normalizarTermoBusca, normalizarTextoBusca } from '../lib/busca-global.mjs'

test('normaliza espaços e limita o termo da busca global', () => {
  assert.equal(normalizarTermoBusca('  Espremedor   de pasta  '), 'Espremedor de pasta')
  assert.equal(normalizarTermoBusca('a'.repeat(120)).length, 80)
})

test('escapa curingas do LIKE sem alterar a intenção da busca', () => {
  assert.equal(criarPadraoLike('50%_P2S!'), '%50!%!_p2s!!%')
  assert.equal(criarPadraoLike(' a '), null)
})

test('busca global ignora acentos e diferenças entre maiúsculas', () => {
  assert.equal(normalizarTextoBusca('  Ímãs de Coração  '), 'imas de coracao')
  assert.equal(criarPadraoLike('João'), '%joao%')
})

