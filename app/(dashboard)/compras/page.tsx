import type { Metadata } from 'next'
import { getComprasDados } from '@/app/actions/compras'
import { getResumoEstoque } from '@/app/actions/estoque'
import { ComprasPage } from '@/app/components/ComprasPage'

export const metadata: Metadata = { title: 'Compras e fornecedores · Salge 3D' }

export default async function Page() {
  const [dados, estoque] = await Promise.all([getComprasDados(), getResumoEstoque()])
  return <ComprasPage dados={dados} sugestoes={estoque.alertas} />
}
