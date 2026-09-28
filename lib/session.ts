import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import db from '@/lib/db'

export const COOKIE_SESSAO = 'salge_session'
const DURACAO_SEGUNDOS = 60 * 60 * 12

export type PerfilUsuario = 'admin' | 'operador' | 'visualizador'

export interface SessaoAtual {
  usuarioId: number
  tenantId: number
  nome: string
  email: string
  perfil: PerfilUsuario
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export function autenticacaoConfigurada(): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM usuarios WHERE ativo = 1 AND senha_hash LIKE 'scrypt$%' LIMIT 1`).get())
}

export async function criarSessao(usuario: { id: number; tenant_id: number }) {
  const token = randomBytes(32).toString('hex')
  const expiraEm = new Date(Date.now() + DURACAO_SEGUNDOS * 1000).toISOString()
  db.prepare(`
    INSERT INTO sessoes (tenant_id, usuario_id, token_hash, expira_em) VALUES (?, ?, ?, ?)
  `).run(usuario.tenant_id, usuario.id, tokenHash(token), expiraEm)
  const jar = await cookies()
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: DURACAO_SEGUNDOS,
  })
}

export async function encerrarSessao() {
  const jar = await cookies()
  const token = jar.get(COOKIE_SESSAO)?.value
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(tokenHash(token))
  jar.delete(COOKIE_SESSAO)
}

export async function getSessaoAtual(): Promise<SessaoAtual | null> {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const sessao = db.prepare(`
    SELECT s.usuario_id AS usuarioId, s.tenant_id AS tenantId,
      u.nome, u.email, u.perfil
    FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id AND u.tenant_id = s.tenant_id
    WHERE s.token_hash = ? AND datetime(s.expira_em) > datetime('now') AND u.ativo = 1
  `).get(tokenHash(token)) as SessaoAtual | undefined
  if (!sessao) return null
  db.prepare(`UPDATE sessoes SET ultimo_uso_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE token_hash = ?`).run(tokenHash(token))
  return sessao
}

export async function exigirSessao(): Promise<SessaoAtual> {
  const sessao = await getSessaoAtual()
  if (!sessao) throw new Error('UNAUTHORIZED')
  return sessao
}

export async function exigirPerfil(perfis: PerfilUsuario[]): Promise<SessaoAtual> {
  const sessao = await exigirSessao()
  if (!perfis.includes(sessao.perfil)) throw new Error('FORBIDDEN')
  return sessao
}
