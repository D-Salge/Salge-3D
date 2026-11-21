import type { Metadata } from 'next'
import { getResumoProdutos } from '@/app/actions/produtos'
import { ProdutosPage } from '@/app/components/ProdutosPage'
import { getCatalogoDados } from '@/app/actions/catalogo'

export const metadata: Metadata = { title: 'Produtos e vendas' }

export default async function Page({ searchParams }: {
  searchParams: Promise<{ aba?: string | string[] }>
}) {
  const { aba } = await searchParams
  const abaInicial = aba === 'vendas' ? 'vendas' : 'catalogo'
  const [produtos, catalogo] = await Promise.all([getResumoProdutos(), getCatalogoDados()])
  return <ProdutosPage key={abaInicial} produtos={produtos} catalogo={catalogo} abaInicial={abaInicial} />
}
