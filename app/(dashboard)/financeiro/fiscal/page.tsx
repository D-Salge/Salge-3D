import type { Metadata } from 'next'
import { getPainelFiscal } from '@/app/actions/fiscal'
import { FiscalMeiPage } from '@/app/components/FiscalMeiPage'

export const metadata: Metadata = { title: 'Fiscal e MEI · Salge 3D' }

export default async function Page({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const params = await searchParams
  const solicitado = Number(params.ano)
  const ano = Number.isSafeInteger(solicitado) && solicitado >= 2020 && solicitado <= 2100
    ? solicitado : new Date().getFullYear()
  return <div className="mx-auto max-w-[1320px] px-6 py-9 lg:px-10"><FiscalMeiPage painel={await getPainelFiscal(ano)} /></div>
}
