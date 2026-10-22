import type { Metadata } from 'next'
import { getProducaoEstoqueDados } from '@/app/actions/producao-estoque'
import { ProducaoEstoquePage } from '@/app/components/ProducaoEstoquePage'

export const metadata: Metadata = { title: 'Produzir para estoque · Salge 3D' }

export default async function Page() {
  return <ProducaoEstoquePage dados={await getProducaoEstoqueDados()} />
}

