import type { Metadata } from 'next'
import { getFilamentosLista } from '@/app/actions/filamentos'
import { FilamentosTabela } from '@/app/components/FilamentosTabela'

export const metadata: Metadata = {
  title: 'Estoque de Filamentos · Salge 3D',
  description: 'Gerenciamento de estoque de materiais.',
}

export default async function FilamentosPage() {
  const filamentos = await getFilamentosLista()

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <FilamentosTabela filamentos={filamentos} />
    </div>
  )
}
