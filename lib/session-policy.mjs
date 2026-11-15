// Políticas de duração compartilhadas pelo login e pela proteção das rotas.
// O nome do cookie identifica se o usuário optou por permanecer logado,
// sem exigir mudanças no schema existente de sessoes.
export const COOKIE_SESSAO = 'salge_session'
export const COOKIE_SESSAO_PERSISTENTE = 'salge_session_persistente'
export const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 12
export const DURACAO_SESSAO_PERSISTENTE_SEGUNDOS = 60 * 60 * 24 * 30

export function politicaSessao(permanecerLogado = false) {
  return permanecerLogado
    ? { nomeCookie: COOKIE_SESSAO_PERSISTENTE, duracaoSegundos: DURACAO_SESSAO_PERSISTENTE_SEGUNDOS }
    : { nomeCookie: COOKIE_SESSAO, duracaoSegundos: DURACAO_SESSAO_SEGUNDOS }
}

// Não aceita tokens inválidos e permite conferir ambos os tipos no banco.
// Se um cookie for inválido/expirado, o outro ainda poderá ser verificado.
export function candidatosSessao(lerCookie) {
  return [politicaSessao(true), politicaSessao(false)].flatMap((politica) => {
    const token = lerCookie(politica.nomeCookie)
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
      ? [{ ...politica, token }]
      : []
  })
}
