import type { Metadata } from 'next'
import { getPedidosComSaldoPendente, getResumoRecebimentos } from '@/app/actions/recebimentos'
import { getDespesas, getResumoDespesas, getFluxoCapital } from '@/app/actions/despesas'
import { FinanceiroPage } from '@/app/components/FinanceiroPage'
import { getProjecaoFluxoCaixa } from '@/app/actions/financeiro'

export const metadata: Metadata = { title: 'Financeiro - Salge 3D' }

export default async function Page() {
  const [pendentes, resumoRec, despesas, resumoDespesas, fluxo, projecao] = await Promise.all([
    getPedidosComSaldoPendente(),
    getResumoRecebimentos(),
    getDespesas(),
    getResumoDespesas(),
    getFluxoCapital(),
    getProjecaoFluxoCaixa(),
  ])
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <FinanceiroPage pendentes={pendentes} resumoRecebimentos={resumoRec} despesas={despesas} resumoDespesas={resumoDespesas} fluxo={fluxo} projecao={projecao} />
    </div>
  )
}
