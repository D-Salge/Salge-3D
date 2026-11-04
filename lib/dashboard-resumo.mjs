// Read-only dashboard queries. Every join is scoped to the authenticated company.
export function obterResumoVisualDashboard(db, tenantId, hoje) {
  const recebimentos = db
    .prepare(
      `
    SELECT date(data_recebimento) AS dia, SUM(valor) AS valor
    FROM recebimentos
    WHERE tenant_id = ? AND estornado_em IS NULL
      AND date(data_recebimento) BETWEEN date(?, '-29 days') AND date(?)
    GROUP BY date(data_recebimento) ORDER BY dia
  `,
    )
    .all(tenantId, hoje, hoje);
  const porDia = new Map(recebimentos.map((item) => [item.dia, item.valor]));
  const dias = Array.from({ length: 30 }, (_, index) => {
    const data = new Date(`${hoje}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() - 29 + index);
    const dia = data.toISOString().slice(0, 10);
    return { dia, valor: Number(porDia.get(dia) ?? 0) };
  });
  const estoque = db
    .prepare(
      `
    SELECT COALESCE(SUM(MAX(0, COALESCE(estoque_gramas, peso_rolo_gramas, 0))), 0) AS gramas
    FROM filamentos WHERE tenant_id = ? AND ativo = 1
  `,
    )
    .get(tenantId);
  const impressoras = db
    .prepare(
      `
    SELECT id, nome, modelo, status FROM impressoras
    WHERE tenant_id = ? AND ativo = 1 ORDER BY nome, id
  `,
    )
    .all(tenantId)
    .map((impressora) => {
      const lote = db
        .prepare(
          `
      SELECT p.id AS pedidoId, p.nome_da_peca AS projeto, l.codigo AS referencia,
        l.status, l.quantidade_planejada AS planejado, l.quantidade_produzida AS produzido
      FROM lotes_producao l JOIN pedidos p ON p.id = l.pedido_id AND p.tenant_id = l.tenant_id
      WHERE l.tenant_id = ? AND l.impressora_id = ? AND l.status IN ('Imprimindo', 'Planejado')
        AND p.orcamento_status = 'Aprovado' AND p.status NOT IN ('Cancelado', 'Finalizado')
      ORDER BY CASE l.status WHEN 'Imprimindo' THEN 0 ELSE 1 END, l.id LIMIT 1
    `,
        )
        .get(tenantId, impressora.id);
      const pedido =
        lote ??
        db
          .prepare(
            `
      SELECT id AS pedidoId, nome_da_peca AS projeto, numero_orcamento AS referencia,
        status, quantidade AS planejado, quantidade_produzida AS produzido
      FROM pedidos WHERE tenant_id = ? AND impressora_id = ? AND orcamento_status = 'Aprovado'
        AND status IN ('Imprimindo', 'Fila', 'Acabamento')
        AND NOT EXISTS (SELECT 1 FROM lotes_producao l WHERE l.tenant_id = pedidos.tenant_id
          AND l.pedido_id = pedidos.id AND l.status IN ('Planejado', 'Imprimindo'))
      ORDER BY CASE status WHEN 'Imprimindo' THEN 0 ELSE 1 END, data_pedido, id LIMIT 1
    `,
          )
          .get(tenantId, impressora.id);
      return { ...impressora, trabalho: pedido ?? null };
    });
  return { dias, filamentoGramas: estoque.gramas, impressoras };
}
