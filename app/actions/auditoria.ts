'use server'

import db from '@/lib/db'

const TENANT_ID = 1

export interface EventoAuditoria {
  id: number
  entidade: string
  entidade_id: number | null
  acao: string
  descricao: string
  dados_json: string | null
  criado_em: string
  usuario_nome: string
}

export async function getEventosAuditoria(): Promise<EventoAuditoria[]> {
  return db.prepare(`
    SELECT a.id, a.entidade, a.entidade_id, a.acao, a.descricao,
      a.dados_json, a.criado_em, u.nome AS usuario_nome
    FROM auditoria a
    JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.tenant_id = ?
    ORDER BY a.criado_em DESC, a.id DESC
    LIMIT 300
  `).all(TENANT_ID) as EventoAuditoria[]
}
