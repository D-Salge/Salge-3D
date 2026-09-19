import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getImpressoras, getPedidoDetalhes } from '@/app/actions/operacao'
import { PedidoDetalhesPage } from '@/app/components/PedidoDetalhesPage'

export const metadata: Metadata = { title: 'Detalhes do pedido · Salge 3D' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pedidoId = Number(id)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) notFound()
  const [pedido, impressoras] = await Promise.all([getPedidoDetalhes(pedidoId), getImpressoras()])
  if (!pedido) notFound()
  return <PedidoDetalhesPage pedido={pedido} impressoras={impressoras} />
}
