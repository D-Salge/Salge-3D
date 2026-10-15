import type { Metadata } from 'next'
import { getInsumosLista } from '@/app/actions/insumos'
import { InsumosTabela } from '@/app/components/InsumosTabela'

export const metadata: Metadata = { title: 'Insumos - Salge 3D' }

export default async function InsumosPage() {
  const insumos = await getInsumosLista()
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <InsumosTabela insumos={insumos} />
    </div>
  )
}
