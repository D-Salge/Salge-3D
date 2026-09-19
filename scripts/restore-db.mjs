import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'

const origemInformada = process.argv[2]
if (!origemInformada) {
  console.error('Uso: npm run db:restore -- "C:\\caminho\\backup.sqlite"')
  process.exit(1)
}

const origem = path.resolve(origemInformada)
const destino = path.resolve('database', 'salge3d.sqlite')
const pastaBackups = path.resolve('database', 'backups')
mkdirSync(pastaBackups, { recursive: true })

if (!existsSync(origem)) {
  console.error(`Backup não encontrado: ${origem}`)
  process.exit(1)
}

function validarBanco(arquivo) {
  const banco = new Database(arquivo, { readonly: true, fileMustExist: true })
  try {
    const integridade = banco.pragma('integrity_check', { simple: true })
    if (integridade !== 'ok') throw new Error(`Falha no integrity_check: ${integridade}`)
    const tabelas = banco.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('tenants', 'usuarios', 'pedidos', 'filamentos')
    `).all().map((item) => item.name)
    if (tabelas.length !== 4) throw new Error('O arquivo não é um backup válido do Salge 3D.')
  } finally {
    banco.close()
  }
}

validarBanco(origem)

const carimbo = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const backupAutomatico = path.join(pastaBackups, `antes-restauracao-${carimbo}.sqlite`)
if (existsSync(destino)) {
  const atual = new Database(destino)
  try {
    atual.pragma('wal_checkpoint(TRUNCATE)')
    await atual.backup(backupAutomatico)
  } finally {
    atual.close()
  }
}

const temporario = `${destino}.restaurando`
try {
  copyFileSync(origem, temporario)
  validarBanco(temporario)
  copyFileSync(temporario, destino)
  const restaurado = new Database(destino)
  try {
    restaurado.pragma('foreign_keys = ON')
    applyMigrations(restaurado)
    const integridade = restaurado.pragma('integrity_check', { simple: true })
    if (integridade !== 'ok') throw new Error(`Banco restaurado inválido: ${integridade}`)
  } finally {
    restaurado.close()
  }
  console.log('Banco restaurado e migrado com sucesso.')
  if (existsSync(backupAutomatico)) console.log(`Cópia anterior preservada em: ${backupAutomatico}`)
} catch (error) {
  if (existsSync(backupAutomatico)) copyFileSync(backupAutomatico, destino)
  throw error
} finally {
  for (const arquivo of [temporario, `${temporario}-wal`, `${temporario}-shm`]) {
    if (existsSync(arquivo)) unlinkSync(arquivo)
  }
}
