import type { Metadata } from 'next'
import { getAgenda } from '@/app/actions/agenda'
import { AgendaPage } from '@/app/components/AgendaPage'

export const metadata: Metadata = { title: 'Agenda · Salge 3D' }
export const dynamic = 'force-dynamic'

export default async function Page() {
  return <AgendaPage agenda={await getAgenda()} />
}
