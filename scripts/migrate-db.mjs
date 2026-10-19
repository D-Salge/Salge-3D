import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { aplicarMigracoesComBackup } from '../lib/migracao-segura.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.env.SALGE_DB_PATH
  ? resolve(process.env.SALGE_DB_PATH)
  : join(root, 'database', 'salge3d.sqlite')

if (!existsSync(dbPath)) {
  console.error('Banco ainda não existe. Execute npm run db:init primeiro.')
  process.exit(1)
}

const db = new Database(dbPath)
try {
  db.pragma('foreign_keys = ON')
  const resultado = aplicarMigracoesComBackup(db, { caminhoBanco: dbPath })
  console.log(resultado.aplicadas > 0
    ? `${resultado.aplicadas} migração(ões) aplicada(s) com sucesso.`
    : 'Banco já estava atualizado; nenhuma migração foi aplicada.')
} finally {
  db.close()
}
