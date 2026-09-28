import db from '@/lib/db'
import { getSessaoAtual } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: RouteContext<'/api/clientes/[id]/dados'>) {
  const sessao = await getSessaoAtual()
  if (!sessao || sessao.perfil !== 'admin') return new Response('Não autorizado', { status: 401 })
  const { id } = await context.params
  const clienteId = Number(id)
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) return new Response('Cliente inválido', { status: 400 })
  const cliente = db.prepare(`
    SELECT id, nome, telefone, email, instagram, cidade, origem, tipo_cliente,
      observacoes, ultimo_contato, criado_em, atualizado_em
    FROM clientes WHERE id = ? AND tenant_id = ? AND anonimizado_em IS NULL
  `).get(clienteId, sessao.tenantId)
  if (!cliente) return new Response('Cliente não encontrado', { status: 404 })
  const pedidos = db.prepare(`
    SELECT id, numero_orcamento, nome_da_peca, descricao, quantidade, valor_total_cobrado,
      orcamento_status, status, data_pedido, data_entrega, observacoes
    FROM pedidos WHERE cliente_id = ? AND tenant_id = ? ORDER BY data_pedido, id
  `).all(clienteId, sessao.tenantId) as Array<{ id: number }>
  const ids = pedidos.map((pedido) => pedido.id)
  const recebimentos = ids.length ? db.prepare(`
    SELECT pedido_id, valor, forma_pagamento, data_recebimento, observacao, estornado_em
    FROM recebimentos WHERE tenant_id = ? AND pedido_id IN (${ids.map(() => '?').join(',')})
    ORDER BY data_recebimento, id
  `).all(sessao.tenantId, ...ids) : []
  const entregas = ids.length ? db.prepare(`
    SELECT pedido_id, quantidade, valor_referente, entregue_em, observacao, cancelada_em
    FROM entregas_pedido WHERE tenant_id = ? AND pedido_id IN (${ids.map(() => '?').join(',')})
    ORDER BY entregue_em, id
  `).all(sessao.tenantId, ...ids) : []
  const exportacao = {
    gerado_em: new Date().toISOString(),
    finalidade: 'Portabilidade dos dados pessoais do cliente',
    cliente, pedidos, recebimentos, entregas,
  }
  return Response.json(exportacao, { headers: {
    'Content-Disposition': `attachment; filename="cliente-${clienteId}-dados.json"`,
    'Cache-Control': 'no-store',
  } })
}
