import db from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function csv(valor: unknown) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return `"${texto.replaceAll('"', '""')}"`
}

export async function GET() {
  const rows = db.prepare(`
    SELECT data_recebimento AS data, 'Recebimento' AS tipo,
      forma_pagamento AS categoria, COALESCE(observacao, 'Pagamento de pedido') AS descricao,
      'Pedido #' || pedido_id AS documento, valor AS entrada, 0 AS saida,
      CASE WHEN estornado_em IS NULL THEN 'Confirmado' ELSE 'Estornado' END AS situacao
    FROM recebimentos WHERE tenant_id = 1
    UNION ALL
    SELECT COALESCE(pago_em, vencimento_em, data_despesa), 'Despesa', categoria,
      descricao, 'Despesa #' || id, 0, valor,
      CASE WHEN estornada_em IS NOT NULL THEN 'Estornada'
        WHEN pago_em IS NOT NULL THEN 'Paga' ELSE 'Pendente' END
    FROM despesas WHERE tenant_id = 1
    UNION ALL
    SELECT data_movimentacao, tipo, 'Capital', COALESCE(descricao, tipo),
      'Capital #' || id,
      CASE WHEN tipo = 'Aporte' THEN valor ELSE 0 END,
      CASE WHEN tipo = 'Retirada' THEN valor ELSE 0 END, 'Confirmado'
    FROM fluxo_capital WHERE tenant_id = 1
    ORDER BY data DESC
  `).all() as Record<string, unknown>[]
  const headers = ['data', 'tipo', 'categoria', 'descricao', 'documento', 'entrada', 'saida', 'situacao']
  const content = '\ufeff' + [headers.map(csv).join(';'), ...rows.map(row => headers.map(header => csv(row[header])).join(';'))].join('\r\n')
  return new Response(content, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="financeiro-salge3d-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store',
  } })
}
