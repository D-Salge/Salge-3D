/**
 * app/(dashboard)/producao/page.tsx
 * Página de Produção (Kanban).
 */

import type { Metadata } from 'next'
import { getPedidosKanban } from '@/app/actions/pedidos'
import { KanbanBoard } from '@/app/components/KanbanBoard'
import { StudioPageHeading } from '@/app/components/StudioPageHeading'
import { ProducaoWorkspace } from '@/app/components/ProducaoWorkspace'
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
      <StudioPageHeading eyebrow="Pedidos e máquinas" title="Produção" description="Fila de impressão, plates e planejamento das impressoras." />
      <ProducaoWorkspace plano={planejamento} pedidos={pedidos} lotes={controleLotes.lotes}
        board={<KanbanBoard pedidos={pedidos} />}
        batches={<LotesProducao lotes={controleLotes.lotes} pedidos={controleLotes.pedidos} impressoras={impressoras.map(({ id, nome }) => ({ id, nome }))} />}
        planning={<PlanejamentoProducao plano={planejamento} />}
      />
    </div>
  )
}
