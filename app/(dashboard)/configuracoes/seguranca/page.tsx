import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getBackups } from '@/app/actions/backups'
import { BackupsPage } from '@/app/components/BackupsPage'

export const metadata: Metadata = { title: 'Segurança e backups · Salge 3D' }

export default async function Page() {
  const backups = await getBackups()
  return <div className="mx-auto max-w-[1000px] px-6 py-9 lg:px-10"><Link href="/configuracoes" className="mb-5 inline-flex items-center gap-2 text-xs text-white/40"><ArrowLeft size={13} /> Configurações</Link><BackupsPage backups={backups} /></div>
}
