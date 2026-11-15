import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COOKIE_SESSAO,
  COOKIE_SESSAO_PERSISTENTE,
  DURACAO_SESSAO_SEGUNDOS,
  DURACAO_SESSAO_PERSISTENTE_SEGUNDOS,
  candidatosSessao,
  politicaSessao,
} from '../lib/session-policy.mjs'

const token = 'a'.repeat(64)

test('sessão comum mantém 12h; permanecer logado usa 30 dias e cookie separado', () => {
  assert.equal(DURACAO_SESSAO_SEGUNDOS, 12 * 60 * 60)
  assert.equal(DURACAO_SESSAO_PERSISTENTE_SEGUNDOS, 30 * 24 * 60 * 60)
  assert.notEqual(COOKIE_SESSAO, COOKIE_SESSAO_PERSISTENTE)
  assert.deepEqual(politicaSessao(false), { nomeCookie: COOKIE_SESSAO, duracaoSegundos: DURACAO_SESSAO_SEGUNDOS })
  assert.deepEqual(politicaSessao(true), { nomeCookie: COOKIE_SESSAO_PERSISTENTE, duracaoSegundos: DURACAO_SESSAO_PERSISTENTE_SEGUNDOS })
})

test('encontra cookies persistentes válidos, ignorando tokens malformados', () => {
  assert.deepEqual(candidatosSessao((nome) => nome === COOKIE_SESSAO_PERSISTENTE ? token : undefined), [
    { ...politicaSessao(true), token },
  ])
  assert.deepEqual(candidatosSessao((nome) => nome === COOKIE_SESSAO ? token : undefined), [
    { ...politicaSessao(false), token },
  ])
  assert.deepEqual(candidatosSessao(() => 'token-invalido'), [])
})

test('se ambos estiverem presentes, permite validar o persistente e depois o comum', () => {
  const tokens = { [COOKIE_SESSAO_PERSISTENTE]: token, [COOKIE_SESSAO]: 'b'.repeat(64) }
  assert.deepEqual(candidatosSessao((nome) => tokens[nome]), [
    { ...politicaSessao(true), token },
    { ...politicaSessao(false), token: 'b'.repeat(64) },
  ])
})

test('login, proxy e logout utilizam a política persistente sem migração', () => {
  const codigo = (caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8')
  const formulario = codigo('../app/components/AuthForm.tsx')
  const autenticacao = codigo('../app/actions/auth.ts')
  const sessoes = codigo('../lib/session.ts')
  const proxy = codigo('../proxy.ts')
  const logout = codigo('../app/logout/route.ts')
  assert.match(formulario, /useState\(true\)/)
  assert.match(formulario, /Permanecer logado neste dispositivo/)
  assert.match(formulario, /entrar\(\{ email: form\.email, senha: form\.senha, permanecerLogado \}\)/)
  assert.match(autenticacao, /criarSessao\(usuario, data\.permanecerLogado === true\)/)
  assert.match(sessoes, /politicaSessao\(permanecerLogado\)/)
  assert.match(sessoes, /maxAge: duracaoSegundos/)
  assert.match(sessoes, /DELETE FROM sessoes WHERE token_hash/)
  assert.match(proxy, /response\.cookies\.set\(sessao\.nomeCookie, sessao\.token/)
  assert.match(proxy, /maxAge: sessao\.duracaoSegundos/)
  assert.match(proxy, /response\.cookies\.delete\(COOKIE_SESSAO_PERSISTENTE\)/)
  assert.match(logout, /resposta\.cookies\.delete\(COOKIE_SESSAO_PERSISTENTE\)/)
})
