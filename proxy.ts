import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

type PerfilUsuario = 'admin' | 'operador' | 'visualizador'
const COOKIE_SESSAO = 'salge_session'
const DURACAO_SESSAO_SEGUNDOS = 60 * 60 * 12

const PUBLICOS = ['/login', '/setup', '/portal', '/pagamento/retorno', '/api/health', '/api/webhooks/whatsapp', '/api/webhooks/mercado-pago']

function sessaoDaRequisicao(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESSAO)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const hash = createHash('sha256').update(token).digest('hex')
  const usuario = db.prepare(`
    SELECT u.id, u.perfil FROM sessoes s
    JOIN usuarios u ON u.id = s.usuario_id AND u.tenant_id = s.tenant_id
    WHERE s.token_hash = ? AND datetime(s.expira_em) > datetime('now') AND u.ativo = 1
  `).get(hash) as { id: number; perfil: PerfilUsuario } | undefined
  return usuario ? { ...usuario, token, hash } : null
}

function respostaComSessaoRenovada(sessao: { token: string; hash: string }) {
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_SEGUNDOS * 1000).toISOString()
  db.prepare(`UPDATE sessoes SET expira_em = ?, ultimo_uso_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE token_hash = ?`)
    .run(expiraEm, sessao.hash)
  const response = NextResponse.next()
  response.cookies.set(COOKIE_SESSAO, sessao.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: DURACAO_SESSAO_SEGUNDOS,
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
      return response
    }
    const configurado = Boolean(db.prepare(`SELECT 1 FROM usuarios WHERE ativo = 1 AND senha_hash LIKE 'scrypt$%' LIMIT 1`).get())
    const destino = new URL(configurado ? '/login' : '/setup', request.url)
    if (configurado) destino.searchParams.set('retorno', pathname)
    const response = NextResponse.redirect(destino)
    response.cookies.delete(COOKIE_SESSAO)
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
