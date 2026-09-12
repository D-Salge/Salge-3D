/**
 * app/(dashboard)/producao/page.tsx
 * Página de Produção (Kanban).
 */

import type { Metadata } from 'next'
import { getPedidosKanban } from '@/app/actions/pedidos'
import { KanbanBoard } from '@/app/components/KanbanBoard'
import { Box } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Produção · Salge 3D',
  description: 'Acompanhamento da fila de produção em Kanban.',
}

export default async function ProducaoPage() {
  const pedidos = await getPedidosKanban()

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-9 lg:px-10 h-full flex flex-col">
      {/* Header da Página */}
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end shrink-0">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-white/65">Produção</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">
            Fila de Produção
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Acompanhe o andamento das peças e atualize os status.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white/60">
            <Box size={14} className="text-[#d8f45a]" />
            {pedidos.filter(p => p.status !== 'Finalizado').length} peças ativas
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <KanbanBoard pedidos={pedidos} />
    </div>
  )
}
