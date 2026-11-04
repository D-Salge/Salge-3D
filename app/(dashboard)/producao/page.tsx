/**
 * app/(dashboard)/producao/page.tsx
 * Página de Produção (Kanban).
 */

import type { Metadata } from 'next'
import { getPedidosKanban } from '@/app/actions/pedidos'
import { KanbanBoard } from '@/app/components/KanbanBoard'
import { Box } from 'lucide-react'
import { getPlanejamentoProducao } from '@/app/actions/planejamento'
import { PlanejamentoProducao } from '@/app/components/PlanejamentoProducao'
import { getLotesProducao } from '@/app/actions/lotes-producao'
import { getImpressoras } from '@/app/actions/operacao'
import { LotesProducao } from '@/app/components/LotesProducao'

export const metadata: Metadata = {
  title: 'Produção · Salge 3D',
  description: 'Acompanhamento da fila de produção em Kanban.',
}

export default async function ProducaoPage() {
  const [pedidos, planejamento, controleLotes, impressoras] = await Promise.all([
    getPedidosKanban(), getPlanejamentoProducao(), getLotesProducao(), getImpressoras(),
  ])

  return (
    <div className="studio-page mx-auto flex h-full max-w-[1440px] flex-col px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      {/* Header da Página */}
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end shrink-0">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-secondary-foreground">Produção</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">
            Fila de Produção
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acompanhe o andamento das peças e atualize os status.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-2 text-xs text-secondary-foreground">
            <Box size={14} className="text-accent" />
            {pedidos.filter(p => p.status !== 'Finalizado').length} peças ativas
          </div>
        </div>
      </div>

      <PlanejamentoProducao plano={planejamento} />

      <LotesProducao lotes={controleLotes.lotes} pedidos={controleLotes.pedidos} impressoras={impressoras.map(({ id, nome }) => ({ id, nome }))} />

      {/* Kanban Board */}
      <KanbanBoard pedidos={pedidos} />
    </div>
  )
}
