import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { COOKIE_SESSAO } from '@/lib/session'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESSAO)?.value
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    db.prepare('DELETE FROM sessoes WHERE token_hash = ?')
      .run(createHash('sha256').update(token).digest('hex'))
  }
  const resposta = NextResponse.redirect(new URL('/login', request.url))
  resposta.cookies.delete(COOKIE_SESSAO)
  return resposta
}
