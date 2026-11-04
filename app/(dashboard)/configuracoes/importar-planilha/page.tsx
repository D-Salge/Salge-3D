import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getHistoricoImportacoes } from '@/app/actions/importacao-planilha'
import { ImportacaoPlanilha } from '@/app/components/ImportacaoPlanilha'

export const metadata: Metadata = {
  title: 'Importar planilha · Salge 3D',
  description: 'Importação validada da planilha de controle para o ERP.',
}

export default async function ImportarPlanilhaPage() {
  const history = await getHistoricoImportacoes()
  return (
    <div className="studio-page mx-auto max-w-[1000px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <Link href="/configuracoes" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-secondary-foreground"><ArrowLeft size={14} /> Configurações</Link>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">Importar planilha</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Valide o arquivo completo, confira reconciliações e só então grave os dados. O processo é atômico: se algo falhar, nenhuma parte da importação permanece.</p>
      </div>
      <ImportacaoPlanilha history={history} />
    </div>
  )
}
