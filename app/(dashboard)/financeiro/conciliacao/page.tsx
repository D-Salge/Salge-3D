import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getConciliacaoBancaria } from '@/app/actions/conciliacao'
import { getContasFinanceiras } from '@/app/actions/contas-financeiras'
import { ConciliacaoBancaria } from '@/app/components/ConciliacaoBancaria'

export const metadata: Metadata = { title: 'Conciliação bancária · Salge 3D' }

export default async function Page() {
  const [dados, contas] = await Promise.all([getConciliacaoBancaria(), getContasFinanceiras()])
  return <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
    <Link href="/financeiro" className="mb-5 inline-flex items-center gap-2 text-xs text-white/40 hover:text-white"><ArrowLeft size={13} /> Financeiro</Link>
    <div className="mb-8"><p className="mb-3 text-xs text-white/35">Financeiro / Conferência</p><h1 className="text-3xl font-semibold tracking-tight">Conciliação bancária</h1><p className="mt-2 text-sm text-white/40">Cruze o extrato do banco com recebimentos e despesas do ERP.</p></div>
    <ConciliacaoBancaria {...dados} contas={contas} />
  </div>
}
