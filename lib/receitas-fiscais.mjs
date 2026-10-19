/**
 * Registra a contrapartida fiscal de um recebimento já persistido.
 * O valor, a competência e a classificação são obtidos do próprio
 * recebimento e da empresa para que todos os fluxos usem a mesma regra.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   tenantId: number,
 *   usuarioId: number,
 *   recebimentoId: number,
 *   pedidoId: number,
 *   prefixoDescricao?: string,
 * }} dados
 */
export function registrarReceitaFiscalDeRecebimento(db, dados) {
  const contexto = db.prepare(`
    SELECT r.valor, substr(r.data_recebimento, 1, 10) AS data_competencia,
      p.numero_orcamento, p.nome_da_peca, t.mei_natureza_padrao
    FROM recebimentos r
    JOIN pedidos p ON p.id = r.pedido_id AND p.tenant_id = r.tenant_id
    JOIN tenants t ON t.id = r.tenant_id
    WHERE r.id = ? AND r.pedido_id = ? AND r.tenant_id = ?
      AND r.estornado_em IS NULL
  `).get(dados.recebimentoId, dados.pedidoId, dados.tenantId)
  if (!contexto) throw new Error('RECEIPT_NOT_FOUND')

  const prefixo = dados.prefixoDescricao?.trim() || 'Recebimento'
  const resultado = db.prepare(`
    INSERT INTO receitas_fiscais (
      tenant_id, usuario_id, recebimento_id, data_competencia,
      natureza, origem, descricao, valor
    ) VALUES (?, ?, ?, ?, ?, 'ERP', ?, ?)
  `).run(
    dados.tenantId,
    dados.usuarioId,
    dados.recebimentoId,
    contexto.data_competencia,
    contexto.mei_natureza_padrao,
    `${prefixo} ${contexto.numero_orcamento || `#${dados.pedidoId}`} — ${contexto.nome_da_peca}`,
    contexto.valor,
  )
  return Number(resultado.lastInsertRowid)
}
