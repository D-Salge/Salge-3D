import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { applyMigrations, migrations } from '../lib/migrations.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = join(root, 'database', 'salge3d.sqlite')

if (!existsSync(dbPath)) {
  console.error('Banco ainda não existe. Execute npm run db:init primeiro.')
  process.exit(1)
}

const db = new Database(dbPath)
try {
  db.pragma('foreign_keys = ON')
  const tabelaExiste = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'
  `).get()
  const versaoAtual = tabelaExiste
    ? db.prepare('SELECT COALESCE(MAX(version), 0) AS versao FROM schema_migrations').get().versao
    : 0
  if (migrations.some((migration) => migration.version > versaoAtual)) {
    const pasta = join(root, 'database', 'backups')
    mkdirSync(pasta, { recursive: true })
    const carimbo = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
    const destinoBackup = join(pasta, `antes-migracao-v${versaoAtual}-${carimbo}.sqlite`)
    db.pragma('wal_checkpoint(TRUNCATE)')
    await db.backup(destinoBackup)
    console.log(`Backup automático criado em: ${destinoBackup}`)
  }
  applyMigrations(db)
  console.log('Migrações aplicadas com sucesso.')
} finally {
  db.close()
}
