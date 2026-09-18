import type { Metadata } from 'next'
import { getInsumosLista } from '@/app/actions/insumos'
import { InsumosTabela } from '@/app/components/InsumosTabela'

export const metadata: Metadata = { title: 'Insumos - Salge 3D' }

export default async function InsumosPage() {
  const insumos = await getInsumosLista()
  return (
    <div className="mx-auto max-w-[1000px] px-6 py-9 lg:px-10">
      <InsumosTabela insumos={insumos} />
    </div>
  )
}
