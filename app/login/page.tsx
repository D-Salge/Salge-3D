import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/app/components/AuthForm'
import { autenticacaoConfigurada, getSessaoAtual } from '@/lib/session'

export const metadata: Metadata = { title: 'Entrar · Salge 3D' }
export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (!autenticacaoConfigurada()) redirect('/setup')
  if (await getSessaoAtual()) redirect('/')
  return <AuthForm modo="login" />
}
