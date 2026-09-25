import type { Metadata } from 'next'
import { getResumoProdutos } from '@/app/actions/produtos'
import { ProdutosPage } from '@/app/components/ProdutosPage'

export const metadata: Metadata = { title: 'Produtos e vendas · Salge 3D' }

export default async function Page() {
  const produtos = await getResumoProdutos()
  return <ProdutosPage produtos={produtos} />
}
