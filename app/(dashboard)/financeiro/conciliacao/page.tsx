import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getConciliacaoBancaria } from '@/app/actions/conciliacao'
import { getContasFinanceiras } from '@/app/actions/contas-financeiras'
import { ConciliacaoBancaria } from '@/app/components/ConciliacaoBancaria'

export const metadata: Metadata = { title: 'Conciliação bancária · Salge 3D' }

export default async function Page() {
  const [dados, contas] = await Promise.all([getConciliacaoBancaria(), getContasFinanceiras()])
  return <div className="studio-page mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
    <Link href="/financeiro" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={13} /> Financeiro</Link>
    <div className="mb-8"><p className="mb-3 text-xs text-muted-foreground">Financeiro / Conferência</p><h1 className="text-3xl font-semibold tracking-tight">Conciliação bancária</h1><p className="mt-2 text-sm text-muted-foreground">Cruze vendas, despesas, aportes e transferências com o extrato da conta.</p></div>
    <ConciliacaoBancaria {...dados} contas={contas} />
  </div>
}
