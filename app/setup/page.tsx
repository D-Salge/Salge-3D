import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/app/components/AuthForm'
import { autenticacaoConfigurada } from '@/lib/session'

export const metadata: Metadata = { title: 'Configuração inicial · Salge 3D' }
export const dynamic = 'force-dynamic'

export default function SetupPage() {
  if (autenticacaoConfigurada()) redirect('/login')
  return <AuthForm modo="setup" />
}
