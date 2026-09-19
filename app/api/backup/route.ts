import { readFileSync } from 'fs'
import path from 'path'
import db from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  db.pragma('wal_checkpoint(TRUNCATE)')
  const file = readFileSync(path.join(process.cwd(), 'database', 'salge3d.sqlite'))
  const date = new Date().toISOString().slice(0, 10)
  return new Response(file as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Disposition': `attachment; filename="salge3d-backup-${date}.sqlite"`,
      'Cache-Control': 'no-store',
    },
  })
}
