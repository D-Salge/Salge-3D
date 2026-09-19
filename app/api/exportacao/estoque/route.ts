import db from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function csv(valor: unknown) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return `"${texto.replaceAll('"', '""')}"`
}

export async function GET() {
  const rows = db.prepare(`
    SELECT m.criado_em AS data, m.tipo_item,
      CASE WHEN m.tipo_item = 'Filamento' THEN f.material || ' ' || f.cor ELSE i.nome END AS item,
      l.codigo AS lote, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior,
      m.motivo, m.pedido_id
    FROM movimentos_estoque m
    LEFT JOIN filamentos f ON m.tipo_item = 'Filamento' AND f.id = m.item_id
    LEFT JOIN insumos i ON m.tipo_item = 'Insumo' AND i.id = m.item_id
    LEFT JOIN lotes_filamento l ON l.id = m.lote_filamento_id
    WHERE m.tenant_id = 1 ORDER BY m.criado_em DESC, m.id DESC
  `).all() as Record<string, unknown>[]
  const headers = ['data', 'tipo_item', 'item', 'lote', 'tipo', 'quantidade', 'saldo_anterior', 'saldo_posterior', 'motivo', 'pedido_id']
  const content = '\ufeff' + [headers.map(csv).join(';'), ...rows.map(row => headers.map(header => csv(row[header])).join(';'))].join('\r\n')
  return new Response(content, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="estoque-salge3d-${new Date().toISOString().slice(0, 10)}.csv"`,
    'Cache-Control': 'no-store',
  } })
}
