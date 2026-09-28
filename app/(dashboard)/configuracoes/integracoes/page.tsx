import type { Metadata } from 'next'
import { getDiagnosticoSistema } from '@/app/actions/integracoes'
import { getEnviosWhatsAppOficial } from '@/app/actions/whatsapp'
import { IntegracoesPage } from '@/app/components/IntegracoesPage'

export const metadata: Metadata = { title: 'Integrações e hospedagem · Salge 3D' }

export default async function Page() {
  const [diagnostico, envios] = await Promise.all([getDiagnosticoSistema(), getEnviosWhatsAppOficial()])
  return <div className="mx-auto max-w-[1100px] px-6 py-9 lg:px-10"><IntegracoesPage diagnostico={diagnostico} envios={envios} /></div>
}

