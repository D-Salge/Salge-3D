import { readFile } from 'node:fs/promises'
import { caminhoBackup } from '@/lib/backup'
import { getSessaoAtual } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: RouteContext<'/api/backups/[id]'>) {
  const sessao = await getSessaoAtual()
  if (!sessao || sessao.perfil !== 'admin') return new Response('Não autorizado', { status: 401 })
  const { id } = await context.params
  const backup = caminhoBackup(sessao.tenantId, Number(id))
  if (!backup) return new Response('Backup não encontrado', { status: 404 })
  const file = await readFile(backup.caminho)
  return new Response(file as BodyInit, { headers: {
    'Content-Type': 'application/vnd.sqlite3',
    'Content-Disposition': `attachment; filename="${backup.arquivo}"`,
    'Cache-Control': 'no-store',
  } })
}
