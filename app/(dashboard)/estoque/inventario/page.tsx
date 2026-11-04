import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getInventario } from '@/app/actions/inventario'
import { InventarioEstoque } from '@/app/components/InventarioEstoque'

export const metadata: Metadata = { title: 'Inventário · Salge 3D' }

export default async function Page() {
  const dados = await getInventario()
  return <div className="studio-page mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
    <Link href="/estoque" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft size={13} /> Estoque</Link>
    <div className="mb-8"><p className="mb-3 text-xs text-muted-foreground">Estoque / Conferência</p><h1 className="text-3xl font-semibold tracking-tight">Inventário físico</h1><p className="mt-2 text-sm text-muted-foreground">Conte, compare e ajuste o saldo com etiquetas de código de barras.</p></div>
    <InventarioEstoque {...dados} />
  </div>
}
