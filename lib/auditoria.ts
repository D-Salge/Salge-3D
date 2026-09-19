import type Database from 'better-sqlite3'

export function registrarAuditoria(
  db: Database.Database,
  dados: {
    tenantId?: number
    usuarioId?: number
    entidade: string
    entidadeId?: number | null
    acao: string
    descricao: string
    detalhes?: unknown
  },
) {
  db.prepare(`
    INSERT INTO auditoria (
      tenant_id, usuario_id, entidade, entidade_id, acao, descricao, dados_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    dados.tenantId ?? 1,
    dados.usuarioId ?? 1,
    dados.entidade,
    dados.entidadeId ?? null,
    dados.acao,
    dados.descricao,
    dados.detalhes === undefined ? null : JSON.stringify(dados.detalhes),
  )
}
