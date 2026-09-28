import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import db from '@/lib/db'
import type { SessaoAtual } from '@/lib/session'

const PASTA = path.join(process.cwd(), 'database', 'backups')
let backupEmAndamento: Promise<BackupRegistro | null> | null = null

export interface BackupRegistro {
  id: number
  tipo: 'Automático' | 'Manual' | 'Pré-migração' | 'Pré-importação'
  arquivo: string
  tamanho_bytes: number
  sha256: string
  integridade: 'Válido' | 'Inválido' | 'Ausente'
  criado_em: string
}

function nomeSeguro(arquivo: string) {
  return path.basename(arquivo) === arquivo && /^[a-zA-Z0-9._-]+\.sqlite$/.test(arquivo)
}

async function verificarArquivo(caminho: string) {
  const teste = new Database(caminho, { readonly: true, fileMustExist: true })
  try {
    const integridade = teste.pragma('integrity_check', { simple: true })
    const tabelas = teste.prepare(`
      SELECT COUNT(*) AS total FROM sqlite_master
      WHERE type = 'table' AND name IN ('tenants', 'usuarios', 'pedidos', 'filamentos')
    `).get() as { total: number }
    return integridade === 'ok' && tabelas.total === 4
  } finally { teste.close() }
}

export async function criarBackupRegistrado(tipo: 'Automático' | 'Manual', sessao: SessaoAtual): Promise<BackupRegistro> {
  await mkdir(PASTA, { recursive: true })
  const agora = new Date()
  const carimbo = tipo === 'Automático'
    ? agora.toISOString().slice(0, 10)
    : agora.toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const arquivo = `${tipo === 'Automático' ? 'automatico' : 'manual'}-${carimbo}.sqlite`
  const caminho = path.join(PASTA, arquivo)
  if (existsSync(caminho)) await unlink(caminho)
  db.pragma('wal_checkpoint(PASSIVE)')
  await db.backup(caminho)
  const valido = await verificarArquivo(caminho)
  const conteudo = await readFile(caminho)
  const tamanho = (await stat(caminho)).size
  const sha256 = createHash('sha256').update(conteudo).digest('hex')
  const result = db.prepare(`
    INSERT INTO backups_registro (
      tenant_id, usuario_id, tipo, arquivo, tamanho_bytes, sha256, integridade
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(arquivo) DO UPDATE SET usuario_id = excluded.usuario_id,
      tamanho_bytes = excluded.tamanho_bytes, sha256 = excluded.sha256,
      integridade = excluded.integridade, criado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    RETURNING id
  `).get(sessao.tenantId, sessao.usuarioId, tipo, arquivo, tamanho, sha256, valido ? 'Válido' : 'Inválido') as { id: number }
  if (!valido) throw new Error('BACKUP_INVALID')
  await aplicarRetencao(sessao.tenantId)
  return db.prepare('SELECT * FROM backups_registro WHERE id = ?').get(result.id) as BackupRegistro
}

async function aplicarRetencao(tenantId: number) {
  const limite = (db.prepare('SELECT retencao_backups FROM tenants WHERE id = ?').get(tenantId) as { retencao_backups: number }).retencao_backups
  const antigos = db.prepare(`
    SELECT id, arquivo FROM backups_registro WHERE tenant_id = ? AND tipo = 'Automático'
    ORDER BY criado_em DESC, id DESC LIMIT -1 OFFSET ?
  `).all(tenantId, limite) as Array<{ id: number; arquivo: string }>
  for (const item of antigos) {
    if (nomeSeguro(item.arquivo)) await unlink(path.join(PASTA, item.arquivo)).catch(() => undefined)
    db.prepare('DELETE FROM backups_registro WHERE id = ? AND tenant_id = ?').run(item.id, tenantId)
  }
}

export async function garantirBackupDiario(sessao: SessaoAtual) {
  const hoje = new Date().toISOString().slice(0, 10)
  const arquivo = `automatico-${hoje}.sqlite`
  const existente = db.prepare(`SELECT id FROM backups_registro WHERE tenant_id = ? AND arquivo = ? AND integridade = 'Válido'`).get(sessao.tenantId, arquivo)
  if (existente && existsSync(path.join(PASTA, arquivo))) return
  if (!backupEmAndamento) backupEmAndamento = criarBackupRegistrado('Automático', sessao).finally(() => { backupEmAndamento = null })
  await backupEmAndamento
}

export function listarBackups(tenantId: number): BackupRegistro[] {
  const itens = db.prepare(`SELECT * FROM backups_registro WHERE tenant_id = ? ORDER BY criado_em DESC, id DESC LIMIT 100`).all(tenantId) as BackupRegistro[]
  return itens.map((item) => ({ ...item, integridade: existsSync(path.join(PASTA, item.arquivo)) ? item.integridade : 'Ausente' }))
}

export function caminhoBackup(tenantId: number, id: number) {
  const item = db.prepare('SELECT arquivo FROM backups_registro WHERE id = ? AND tenant_id = ?').get(id, tenantId) as { arquivo: string } | undefined
  if (!item || !nomeSeguro(item.arquivo)) return null
  const caminho = path.join(PASTA, item.arquivo)
  return existsSync(caminho) ? { caminho, arquivo: item.arquivo } : null
}
