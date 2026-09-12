/**
 * app/(dashboard)/orcamentos/page.tsx
 * Página de criação de orçamentos → URL: /orcamentos
 */

import type { Metadata } from 'next'
import { getClientes, getFilamentos, getPedidosRecentes } from '@/app/actions/pedidos'
import { OrcamentoPage } from '@/app/components/OrcamentoPage'

export const metadata: Metadata = {
  title: 'Orçamentos · Salge 3D',
  description: 'Crie orçamentos de impressão 3D com múltiplos filamentos.',
}

export default async function OrcamentosPage() {
  const [clientes, filamentos, pedidosRecentes] = await Promise.all([
    getClientes(),
    getFilamentos(),
    getPedidosRecentes(20),
  ])

  return (
    <OrcamentoPage
      clientes={clientes}
      filamentos={filamentos}
      pedidosRecentes={pedidosRecentes}
    />
  )
}
