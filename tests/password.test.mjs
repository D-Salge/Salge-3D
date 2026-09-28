import assert from 'node:assert/strict'
import test from 'node:test'
import { criarHashSenha, hashConfigurado, validarForcaSenha, verificarSenha } from '../lib/password.mjs'

test('exige senha com tamanho, letra e número', () => {
  assert.match(validarForcaSenha('curta1'), /8 caracteres/)
  assert.match(validarForcaSenha('abcdefgh'), /letra e um número/)
  assert.equal(validarForcaSenha('Salge3Dsegura'), null)
})

test('gera hash scrypt com salt e valida sem guardar a senha', async () => {
  const primeiro = await criarHashSenha('Salge3Dsegura')
  const segundo = await criarHashSenha('Salge3Dsegura')
  assert.equal(hashConfigurado(primeiro), true)
  assert.notEqual(primeiro, segundo)
  assert.equal(await verificarSenha('Salge3Dsegura', primeiro), true)
  assert.equal(await verificarSenha('senha-errada1', primeiro), false)
  assert.equal(primeiro.includes('Salge3Dsegura'), false)
})

test('recusa hash legado ou malformado', async () => {
  assert.equal(hashConfigurado('SUBSTITUA_POR_HASH_BCRYPT'), false)
  assert.equal(await verificarSenha('qualquer1', 'SUBSTITUA_POR_HASH_BCRYPT'), false)
})
