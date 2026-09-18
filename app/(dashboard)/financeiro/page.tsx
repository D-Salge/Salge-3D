import type { Metadata } from 'next'
import { getPedidosComSaldoPendente, getResumoRecebimentos } from '@/app/actions/recebimentos'
import { getDespesas, getResumoDespesas, getFluxoCapital } from '@/app/actions/despesas'
import { FinanceiroPage } from '@/app/components/FinanceiroPage'

export const metadata: Metadata = { title: 'Financeiro - Salge 3D' }

export default async function Page() {
  const [pendentes, resumoRec, despesas, resumoDespesas, fluxo] = await Promise.all([
    getPedidosComSaldoPendente(),
    getResumoRecebimentos(),
    getDespesas(),
    getResumoDespesas(),
    getFluxoCapital(),
  ])
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <FinanceiroPage pendentes={pendentes} resumoRecebimentos={resumoRec} despesas={despesas} resumoDespesas={resumoDespesas} fluxo={fluxo} />
    </div>
  )
}
