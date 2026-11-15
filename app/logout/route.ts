import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { candidatosSessao, COOKIE_SESSAO, COOKIE_SESSAO_PERSISTENTE } from '@/lib/session-policy.mjs'

export async function GET(request: NextRequest) {
  for (const candidato of candidatosSessao((nome) => request.cookies.get(nome)?.value)) {
    db.prepare('DELETE FROM sessoes WHERE token_hash = ?')
      .run(createHash('sha256').update(candidato.token).digest('hex'))
  }
  const resposta = NextResponse.redirect(new URL('/login', request.url))
  resposta.cookies.delete(COOKIE_SESSAO)
  resposta.cookies.delete(COOKIE_SESSAO_PERSISTENTE)
  return resposta
}
