import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { candidatosSessao, COOKIE_SESSAO, COOKIE_SESSAO_PERSISTENTE } from '@/lib/session-policy.mjs'

type PerfilUsuario = 'admin' | 'operador' | 'visualizador'

const PUBLICOS = ['/login', '/setup', '/portal', '/pagamento/retorno', '/api/health', '/api/webhooks/whatsapp', '/api/webhooks/mercado-pago']

function sessaoDaRequisicao(request: NextRequest) {
  for (const candidato of candidatosSessao((nome) => request.cookies.get(nome)?.value)) {
    const hash = createHash('sha256').update(candidato.token).digest('hex')
    const usuario = db.prepare(`
      SELECT u.id, u.perfil FROM sessoes s
      JOIN usuarios u ON u.id = s.usuario_id AND u.tenant_id = s.tenant_id
      WHERE s.token_hash = ? AND datetime(s.expira_em) > datetime('now') AND u.ativo = 1
    `).get(hash) as { id: number; perfil: PerfilUsuario } | undefined
    if (usuario) return { ...usuario, ...candidato, hash }
  }
  return null
}

function respostaComSessaoRenovada(sessao: { token: string; hash: string; nomeCookie: string; duracaoSegundos: number }) {
  const expiraEm = new Date(Date.now() + sessao.duracaoSegundos * 1000).toISOString()
  db.prepare(`UPDATE sessoes SET expira_em = ?, ultimo_uso_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE token_hash = ?`)
    .run(expiraEm, sessao.hash)
  const response = NextResponse.next()
  response.cookies.set(sessao.nomeCookie, sessao.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: sessao.duracaoSegundos,
  })
  return response
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (PUBLICOS.some((prefixo) => pathname === prefixo || pathname.startsWith(`${prefixo}/`))) return NextResponse.next()
  const sessao = sessaoDaRequisicao(request)
  if (!sessao) {
    if (pathname.startsWith('/api/') || request.headers.has('next-action')) {
      const response = new NextResponse('Não autorizado', { status: 401 })
      response.cookies.delete(COOKIE_SESSAO)
      response.cookies.delete(COOKIE_SESSAO_PERSISTENTE)
      return response
    }
    const configurado = Boolean(db.prepare(`SELECT 1 FROM usuarios WHERE ativo = 1 AND senha_hash LIKE 'scrypt$%' LIMIT 1`).get())
    const destino = new URL(configurado ? '/login' : '/setup', request.url)
    if (configurado) destino.searchParams.set('retorno', pathname)
    const response = NextResponse.redirect(destino)
    response.cookies.delete(COOKIE_SESSAO)
    response.cookies.delete(COOKIE_SESSAO_PERSISTENTE)
    return response
  }
  const somenteAdmin = pathname === '/auditoria' || pathname.startsWith('/configuracoes') || pathname === '/api/backup' || pathname.startsWith('/api/backups/')
  if (somenteAdmin && sessao.perfil !== 'admin') return new NextResponse('Acesso restrito ao administrador', { status: 403 })
  if (request.headers.has('next-action') && sessao.perfil === 'visualizador') return new NextResponse('Perfil somente leitura', { status: 403 })
  return respostaComSessaoRenovada(sessao)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
