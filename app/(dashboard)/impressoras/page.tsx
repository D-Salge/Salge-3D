import type { Metadata } from 'next'
import {
  getImpressoras,
  getIndicadoresQualidadeImpressoras,
  getManutencoesImpressoras,
} from '@/app/actions/operacao'
import { ImpressorasPage } from '@/app/components/ImpressorasPage'

export const metadata: Metadata = { title: 'Impressoras · Salge 3D' }

export default async function Page() {
  const [impressoras, indicadores, manutencoes] = await Promise.all([
    getImpressoras(),
    getIndicadoresQualidadeImpressoras(),
    getManutencoesImpressoras(),
  ])
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <ImpressorasPage
        impressoras={impressoras}
        indicadores={indicadores}
        manutencoes={manutencoes}
      />
    </div>
  )
}
