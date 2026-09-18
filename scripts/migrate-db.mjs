import Database from 'better-sqlite3'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { applyMigrations } from '../lib/migrations.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = join(root, 'database', 'salge3d.sqlite')

if (!existsSync(dbPath)) {
  console.error('Banco ainda não existe. Execute npm run db:init primeiro.')
  process.exit(1)
}

const db = new Database(dbPath)
try {
  db.pragma('foreign_keys = ON')
  applyMigrations(db)
  console.log('Migrações aplicadas com sucesso.')
} finally {
  db.close()
}
