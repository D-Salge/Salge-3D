import type { Metadata } from 'next'
import { getImpressoras } from '@/app/actions/operacao'
import { ImpressorasPage } from '@/app/components/ImpressorasPage'

export const metadata: Metadata = { title: 'Impressoras · Salge 3D' }

export default async function Page() {
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-9 lg:px-10">
      <ImpressorasPage impressoras={await getImpressoras()} />
    </div>
  )
}
