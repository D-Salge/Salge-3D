import type { Metadata } from 'next'
import { getEstoqueProdutosAcabados } from '@/app/actions/producao-estoque'
import { ProdutosAcabadosPage } from '@/app/components/ProdutosAcabadosPage'

export const metadata: Metadata = { title: 'Produtos acabados' }

export default async function Page() {
  return <ProdutosAcabadosPage dados={await getEstoqueProdutosAcabados()} />
}

