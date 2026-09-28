import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getUsuarios } from '@/app/actions/usuarios'
import { UsuariosSistema } from '@/app/components/UsuariosSistema'

export const metadata: Metadata = { title: 'Usuários · Salge 3D' }

export default async function Page() {
  const usuarios = await getUsuarios()
  return <div className="mx-auto max-w-[1000px] px-6 py-9 lg:px-10"><Link href="/configuracoes" className="mb-5 inline-flex items-center gap-2 text-xs text-white/40"><ArrowLeft size={13} /> Configurações</Link><UsuariosSistema usuarios={usuarios} /></div>
}
