import type { Metadata } from 'next'
import { getPedidosComSaldoPendente, getResumoRecebimentos } from '@/app/actions/recebimentos'
import { getDespesas, getDespesasRecorrentes, getResumoDespesas, getFluxoCapital } from '@/app/actions/despesas'
import { FinanceiroPage } from '@/app/components/FinanceiroPage'
import { getProjecaoFluxoCaixa } from '@/app/actions/financeiro'
import { getContasFinanceiras, getTransferenciasFinanceiras } from '@/app/actions/contas-financeiras'

export const metadata: Metadata = { title: 'Financeiro - Salge 3D' }

export default async function Page() {
  // Materializa primeiro a competência atual para os demais resumos já enxergarem as contas fixas.
  const recorrentes = await getDespesasRecorrentes()
  const [pendentes, resumoRec, despesas, resumoDespesas, fluxo, projecao, contas, transferencias] = await Promise.all([
    getPedidosComSaldoPendente(),
    getResumoRecebimentos(),
    getDespesas(),
    getResumoDespesas(),
    getFluxoCapital(),
    getProjecaoFluxoCaixa(),
    getContasFinanceiras(),
    getTransferenciasFinanceiras(),
  ])
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <FinanceiroPage pendentes={pendentes} resumoRecebimentos={resumoRec} despesas={despesas} despesasRecorrentes={recorrentes} resumoDespesas={resumoDespesas} fluxo={fluxo} projecao={projecao} contas={contas} transferencias={transferencias} />
    </div>
  )
}
