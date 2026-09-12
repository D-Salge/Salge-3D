import type { Metadata } from 'next'
import { getClientesLista } from '@/app/actions/clientes'
import { ClientesTabela } from '@/app/components/ClientesTabela'

export const metadata: Metadata = {
  title: 'Clientes · Salge 3D',
  description: 'Gerenciamento de clientes.',
}

export default async function ClientesPage() {
  const clientes = await getClientesLista()

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-9 lg:px-10">
      <ClientesTabela clientes={clientes} />
    </div>
  )
}
