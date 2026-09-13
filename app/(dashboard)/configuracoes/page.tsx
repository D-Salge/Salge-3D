import type { Metadata } from 'next'
import { getConfiguracoes } from '@/app/actions/configuracoes'
import { ConfiguracoesForm } from '@/app/components/ConfiguracoesForm'

export const metadata: Metadata = {
  title: 'Configurações · Salge 3D',
  description: 'Configurações do sistema.',
}

export default async function ConfiguracoesPage() {
  const config = await getConfiguracoes()

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-9 lg:px-10">
      <ConfiguracoesForm initialData={config} />
    </div>
  )
}
