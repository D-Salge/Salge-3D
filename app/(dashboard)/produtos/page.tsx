import type { Metadata } from 'next'
import { getResumoProdutos } from '@/app/actions/produtos'
import { ProdutosPage } from '@/app/components/ProdutosPage'
import { getCatalogoDados } from '@/app/actions/catalogo'

export const metadata: Metadata = { title: 'Produtos e vendas · Salge 3D' }

export default async function Page() {
  const [produtos, catalogo] = await Promise.all([getResumoProdutos(), getCatalogoDados()])
  return <ProdutosPage produtos={produtos} catalogo={catalogo} />
}
