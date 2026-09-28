import type { Metadata } from 'next'
import { getAtendimentoDados } from '@/app/actions/atendimento'
import { AtendimentoPage } from '@/app/components/AtendimentoPage'

export const metadata: Metadata = { title: 'Qualidade e expedição · Salge 3D' }

export default async function Page({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const params = await searchParams
  const pedidoId = Number(params.pedido)
  const dados = await getAtendimentoDados()
  return <AtendimentoPage dados={dados} pedidoInicial={Number.isSafeInteger(pedidoId) && pedidoId > 0 ? pedidoId : undefined} />
}
