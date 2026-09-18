'use client'

/**
 * app/components/KanbanBoard.tsx
 * Quadro Kanban interativo para gerenciar o status de produção.
 */

import { useTransition } from 'react'
import { Clock3, Play, CheckCircle2, PackageCheck } from 'lucide-react'
import type { PedidoResumo } from '@/app/actions/pedidos'
import { atualizarStatusPedido } from '@/app/actions/pedidos'
import Link from 'next/link'

interface KanbanBoardProps {
  pedidos: PedidoResumo[]
}

const COLUNAS = [
  { id: 'Fila',       label: 'Fila de Impressão', dot: 'bg-amber-400' },
  { id: 'Imprimindo', label: 'Imprimindo',        dot: 'bg-blue-400' },
  { id: 'Acabamento', label: 'Acabamento',        dot: 'bg-violet-400' },
  { id: 'Finalizado', label: 'Finalizado',        dot: 'bg-[#d8f45a]' },
]

export function KanbanBoard({ pedidos }: KanbanBoardProps) {
  const [isPending, startTransition] = useTransition()

  function handleAvancarStatus(pedidoId: number, statusAtual: string) {
    let proximo = ''
    if (statusAtual === 'Fila') proximo = 'Imprimindo'
    else if (statusAtual === 'Imprimindo') proximo = 'Acabamento'
    else if (statusAtual === 'Acabamento') proximo = 'Finalizado'

    if (!proximo) return

    startTransition(async () => {
      const result = await atualizarStatusPedido(pedidoId, proximo)
      if (!result.success) alert(result.message)
    })
  }

  // Agrupa os pedidos por status
  const agrupados = COLUNAS.map((col) => ({
    ...col,
    items: pedidos.filter((p) => p.status === col.id),
  }))

  return (
    <div className="flex flex-1 gap-6 overflow-x-auto pb-4">
      {agrupados.map((col) => (
        <div key={col.id} className="flex w-[320px] shrink-0 flex-col gap-4">
          
          {/* Header da coluna */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
              <span className={`size-2 rounded-full ${col.dot}`} />
              {col.label}
            </div>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-white/40">
              {col.items.length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-3 min-h-[150px] rounded-xl bg-white/[0.02] p-3 border border-white/[0.05]">
            {col.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-white/20">
                <span className="text-xs">Nenhum pedido</span>
              </div>
            ) : (
              col.items.map((pedido) => (
                <div
                  key={pedido.id}
                  className="group relative flex flex-col gap-3 rounded-lg border border-white/[0.08] bg-[#15171b] p-4 shadow-xl transition hover:border-white/[0.15]"
                >
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-white/40">#{pedido.id}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                        <Clock3 size={11} />
                        {pedido.tempo_impressao_horas}h
                      </div>
                    </div>
                    <Link href={`/pedidos/${pedido.id}`} className="text-sm font-semibold text-white/90 leading-tight hover:text-[#d8f45a]">
                      {pedido.nome_da_peca}
                    </Link>
                    <p className="mt-0.5 text-xs text-white/50">{pedido.cliente_nome}</p>
                    <p className="mt-1 text-[10px] text-white/30">{pedido.impressora_nome || 'Impressora não atribuída'}</p>
                  </div>

                  {/* Materiais - Badges com verificação de estoque */}
                  <div className="flex flex-wrap gap-1.5">
                    {pedido.materiais.split('///').filter(m => m !== '').map((matRaw, i) => {
                      const [nome, pesoStr, estoqueStr] = matRaw.split('|')
                      const peso = Number(pesoStr) || 0
                      const estoque = Number(estoqueStr) || 0
                      const semEstoque = estoque < peso

                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                            semEstoque
                              ? 'border-red-500/30 bg-red-500/10 text-red-400'
                              : 'border-white/[0.08] bg-white/[0.04] text-white/60'
                          }`}
                        >
                          <span>{nome}</span>
                          {semEstoque && (
                            <span 
                              className="size-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
                              title={`Estoque insuficiente (${estoque}g disponíveis, ${peso}g necessários)`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Ação (Avançar status) */}
                  {col.id !== 'Finalizado' && (
                    <div className="mt-1 flex items-center justify-between">
                      <Link href={`/pedidos/${pedido.id}`} className="text-[10px] text-white/35 hover:text-[#d8f45a]">Detalhes</Link>
                      <button
                        onClick={() => handleAvancarStatus(pedido.id, pedido.status)}
                        disabled={isPending}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-50
                          ${col.id === 'Fila' ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : ''}
                          ${col.id === 'Imprimindo' ? 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20' : ''}
                          ${col.id === 'Acabamento' ? 'bg-[#d8f45a]/10 text-[#d8f45a] hover:bg-[#d8f45a]/20' : ''}
                        `}
                      >
                        {col.id === 'Fila' && <><Play size={12} /> Iniciar Impressão</>}
                        {col.id === 'Imprimindo' && <><CheckCircle2 size={12} /> Concluir Impressão</>}
                        {col.id === 'Acabamento' && <><PackageCheck size={12} /> Finalizar Peça</>}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
