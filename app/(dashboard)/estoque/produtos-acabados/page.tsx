import type { Metadata } from 'next'
import { getEstoqueProdutosAcabados } from '@/app/actions/producao-estoque'
import { ProdutosAcabadosPage } from '@/app/components/ProdutosAcabadosPage'

export const metadata: Metadata = { title: 'Produtos acabados · Salge 3D' }

export default async function Page() {
  return <ProdutosAcabadosPage dados={await getEstoqueProdutosAcabados()} />
}

