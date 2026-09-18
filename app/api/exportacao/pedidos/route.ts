import db from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function csv(valor: unknown) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return `"${texto.replaceAll('"', '""')}"`
}

export async function GET() {
  const rows = db.prepare(`
    SELECT p.numero_orcamento, p.nome_da_peca, c.nome AS cliente,
      p.orcamento_status, p.status, p.data_pedido, p.data_entrega,
      p.valor_total_cobrado,
      COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS total_recebido,
      p.valor_total_cobrado - (
        p.custo_filamento + p.custo_insumos + p.custo_energia +
        p.valor_reserva_maquina + p.custo_embalagem + p.frete_pago + p.custo_extra_real
      ) AS lucro_estimado
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.tenant_id = 1
    ORDER BY p.data_pedido DESC
  `).all() as Record<string, unknown>[]
  const headers = [
    'numero_orcamento', 'nome_da_peca', 'cliente', 'orcamento_status', 'status',
    'data_pedido', 'data_entrega', 'valor_total_cobrado', 'total_recebido', 'lucro_estimado',
  ]
  const content = '\ufeff' + [
    headers.map(csv).join(';'),
    ...rows.map((row) => headers.map((header) => csv(row[header])).join(';')),
  ].join('\r\n')
  return new Response(content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pedidos-salge3d-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
