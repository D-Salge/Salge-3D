import Database from 'better-sqlite3'
import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { applyMigrations, migrations } from './migrations.mjs'

function tabelaMigracoesExiste(db) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'
  `).get())
}

export function listarMigracoesPendentes(db) {
  if (!tabelaMigracoesExiste(db)) return [...migrations]
  const aplicadas = new Set(db.prepare('SELECT version FROM schema_migrations').all()
    .map((item) => item.version))
  return migrations.filter((migration) => !aplicadas.has(migration.version))
}

function versaoAtual(db) {
  if (!tabelaMigracoesExiste(db)) return 0
  return db.prepare('SELECT COALESCE(MAX(version), 0) AS versao FROM schema_migrations').get().versao
}

function literalSql(valor) {
  return `'${valor.replaceAll("'", "''")}'`
}

function validarBackup(caminho, versoesEsperadas) {
  const backup = new Database(caminho, { readonly: true, fileMustExist: true })
  try {
    const integridade = backup.pragma('integrity_check', { simple: true })
    if (integridade !== 'ok') throw new Error(`BACKUP_INVALID:${integridade}`)
    const versoes = tabelaMigracoesExiste(backup)
      ? backup.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((item) => item.version)
      : []
    if (JSON.stringify(versoes) !== JSON.stringify(versoesEsperadas)) {
      throw new Error('BACKUP_SCHEMA_MISMATCH')
    }
  } finally {
    backup.close()
  }
}

export function criarBackupConsistente({ caminhoBanco, caminhoTemporario, versoesEsperadas }) {
  const origem = new Database(caminhoBanco, { fileMustExist: true })
  try {
    origem.pragma('busy_timeout = 30000')
    origem.exec(`VACUUM INTO ${literalSql(caminhoTemporario)}`)
  } finally {
    origem.close()
  }
  validarBackup(caminhoTemporario, versoesEsperadas)
}

/**
 * Serializa backup e migrações no lock de escrita do próprio banco.
 * O snapshot usa outra conexão porque VACUUM INTO não pode executar dentro da
 * transação que mantém o lock. Leitores continuam vendo todo dado confirmado,
 * inclusive páginas ainda presentes no WAL.
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   caminhoBanco?: string,
 *   bancoExistente?: boolean,
 *   pastaBackups?: string | null,
 *   criarBackup?: typeof criarBackupConsistente,
 * }} opcoes
 */
export function aplicarMigracoesComBackup(db, {
  caminhoBanco,
  bancoExistente = true,
  pastaBackups = caminhoBanco ? path.join(path.dirname(path.resolve(caminhoBanco)), 'backups') : null,
  criarBackup = criarBackupConsistente,
} = {}) {
  db.pragma('busy_timeout = 120000')
  db.exec('BEGIN IMMEDIATE')
  let temporario = null
  try {
    const pendentes = listarMigracoesPendentes(db)
    if (pendentes.length === 0) {
      db.exec('COMMIT')
      return { aplicadas: 0, backup: null }
    }

    let destino = null
    if (bancoExistente) {
      if (!caminhoBanco || caminhoBanco === ':memory:' || !existsSync(caminhoBanco) || statSync(caminhoBanco).size === 0) {
        throw new Error('MIGRATION_BACKUP_PATH_INVALID')
      }
      if (!pastaBackups) throw new Error('MIGRATION_BACKUP_DIR_INVALID')
      mkdirSync(pastaBackups, { recursive: true })
      const atual = versaoAtual(db)
      const final = migrations.at(-1)?.version ?? atual
      const carimbo = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
      destino = path.join(pastaBackups, `antes-migracao-v${atual}-para-v${final}-${carimbo}.sqlite`)
      temporario = destino
      criarBackup({
        caminhoBanco: path.resolve(caminhoBanco),
        caminhoTemporario: temporario,
        versoesEsperadas: tabelaMigracoesExiste(db)
          ? db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((item) => item.version)
          : [],
      })
      temporario = null
      console.log(`Backup pré-migração criado e validado em: ${destino}`)
    }

    applyMigrations(db)
    db.exec('COMMIT')
    return { aplicadas: pendentes.length, backup: destino }
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK')
    if (temporario && existsSync(temporario)) unlinkSync(temporario)
    throw error
  }
}
