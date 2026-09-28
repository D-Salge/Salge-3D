import type { Metadata } from 'next'
import { getRelatorioGerencial } from '@/app/actions/relatorios'
import { RelatoriosPage } from '@/app/components/RelatoriosPage'

export const metadata: Metadata = { title: 'Relatórios · Salge 3D' }

export default async function Page() {
  return (
    <div className="mx-auto max-w-[1320px] px-6 py-9 lg:px-10">
      <RelatoriosPage relatorio={await getRelatorioGerencial()} />
    </div>
  )
}
