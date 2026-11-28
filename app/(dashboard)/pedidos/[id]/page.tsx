import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFilamentosParaConsumo, getImpressoras, getPedidoDetalhes } from '@/app/actions/operacao'
import { PedidoDetalhesPage } from '@/app/components/PedidoDetalhesPage'
import { getContasDeEntrada } from '@/app/actions/contas-financeiras'
import { configuracaoMercadoPago } from '@/lib/mercado-pago.mjs'

export const metadata: Metadata = { title: 'Detalhes do pedido' }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pedidoId = Number(id)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) notFound()
  const [pedido, impressoras, filamentos, contasDeEntrada] = await Promise.all([
    getPedidoDetalhes(pedidoId), getImpressoras(), getFilamentosParaConsumo(), getContasDeEntrada(),
  ])
  if (!pedido) notFound()
  return <PedidoDetalhesPage
    pedido={pedido}
    impressoras={impressoras}
    filamentos={filamentos}
    contasDeEntrada={contasDeEntrada}
    mercadoPagoTeste={configuracaoMercadoPago().testMode}
  />
}
