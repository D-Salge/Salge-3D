'use client'

/**
 * app/components/KanbanBoard.tsx
 * Quadro Kanban interativo para gerenciar o status de produção.
 */

import { useTransition } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, Flag, PackageCheck, Play } from 'lucide-react'
import type { PedidoResumo } from '@/app/actions/pedidos'
import { atualizarStatusPedido } from '@/app/actions/pedidos'
import { atualizarPrioridadeProducao, moverPedidoNaFila } from '@/app/actions/planejamento'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface KanbanBoardProps {
  pedidos: PedidoResumo[]
}

const COLUNAS = [
  { id: 'Fila',       label: 'Fila de Impressão', dot: 'bg-amber-400' },
  { id: 'Imprimindo', label: 'Imprimindo',        dot: 'bg-blue-400' },
  { id: 'Acabamento', label: 'Acabamento',        dot: 'bg-violet-400' },
  { id: 'Finalizado', label: 'Finalizado',        dot: 'bg-accent' },
]

export function KanbanBoard({ pedidos }: KanbanBoardProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleAvancarStatus(pedidoId: number, statusAtual: string) {
    let proximo = ''
    if (statusAtual === 'Fila') proximo = 'Imprimindo'
    else if (statusAtual === 'Imprimindo') proximo = 'Acabamento'
    else if (statusAtual === 'Acabamento') proximo = 'Finalizado'

    if (!proximo) return

    startTransition(async () => {
      const result = await atualizarStatusPedido(pedidoId, proximo)
      if (!result.success) alert(result.message)
      else router.refresh()
    })
  }

  function alterarPrioridade(pedidoId: number, prioridade: PedidoResumo['prioridade_producao']) {
    startTransition(async () => {
      const result = await atualizarPrioridadeProducao(pedidoId, prioridade)
      if (!result.success) alert(result.message)
      router.refresh()
    })
  }

  function mover(pedidoId: number, direcao: 'subir' | 'descer') {
    startTransition(async () => {
      const result = await moverPedidoNaFila(pedidoId, direcao)
      if (!result.success && !result.message.includes('limite')) alert(result.message)
      router.refresh()
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
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className={`size-2 rounded-full ${col.dot}`} />
              {col.label}
            </div>
            <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {col.items.length}
            </span>
          </div>

          {/* Cards */}
          <div className="erp-list-scroll flex min-h-[150px] flex-col gap-3 rounded-xl border border-border bg-subtle p-3">
            {col.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <span className="text-xs">Nenhum pedido</span>
              </div>
            ) : (
              col.items.map((pedido) => (
                <div
                  key={pedido.id}
                  className="group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-xl transition hover:border-border"
                >
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground">#{pedido.id}</span>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Clock3 size={11} />
                        {pedido.tempo_impressao_horas}h
                      </div>
                    </div>
                    <Link href={`/pedidos/${pedido.id}`} className="text-sm font-semibold text-foreground leading-tight hover:text-accent">
                      {pedido.nome_da_peca}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">{pedido.cliente_nome}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{pedido.impressora_nome || 'Impressora não atribuída'}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Flag size={11} className={pedido.prioridade_producao === 'Urgente' ? 'text-destructive' : pedido.prioridade_producao === 'Alta' ? 'text-warning' : 'text-muted-foreground'} />
                      <select disabled={isPending || pedido.status === 'Finalizado'} value={pedido.prioridade_producao} onChange={(event) => alterarPrioridade(pedido.id, event.target.value as PedidoResumo['prioridade_producao'])} className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[10px] text-secondary-foreground disabled:opacity-40"><option>Normal</option><option>Alta</option><option>Urgente</option></select>
                      {pedido.status === 'Fila' && <div className="flex"><button type="button" disabled={isPending} onClick={() => mover(pedido.id, 'subir')} className="rounded-l-md border border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Subir na fila"><ChevronUp size={11} /></button><button type="button" disabled={isPending} onClick={() => mover(pedido.id, 'descer')} className="rounded-r-md border border-l-0 border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Descer na fila"><ChevronDown size={11} /></button></div>}
                    </div>
                    {pedido.quantidade > 1 && <div className="mt-3 space-y-2 rounded-lg bg-subtle p-2.5"><div><div className="mb-1 flex justify-between text-[9px] text-muted-foreground"><span>Produzido</span><span>{pedido.quantidade_produzida}/{pedido.quantidade}</span></div><div className="h-1 overflow-hidden rounded bg-subtle"><div className="h-full bg-blue-400" style={{ width: `${Math.min(100, (pedido.quantidade_produzida / pedido.quantidade) * 100)}%` }} /></div></div><div><div className="mb-1 flex justify-between text-[9px] text-muted-foreground"><span>Entregue</span><span>{pedido.quantidade_entregue}/{pedido.quantidade}</span></div><div className="h-1 overflow-hidden rounded bg-subtle"><div className="h-full bg-accent" style={{ width: `${Math.min(100, (pedido.quantidade_entregue / pedido.quantidade) * 100)}%` }} /></div></div></div>}
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
                              ? 'border-red-500/30 bg-red-500/10 text-destructive'
                              : 'border-border bg-subtle text-secondary-foreground'
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
                      <Link href={`/pedidos/${pedido.id}`} className="text-[10px] text-muted-foreground hover:text-accent">Detalhes</Link>
                      {col.id === 'Acabamento' ? (
                        <Link href={`/pedidos/${pedido.id}#fechamento`} className="flex items-center gap-1.5 rounded-md bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent transition hover:bg-accent/20">
                          <PackageCheck size={12} /> Revisar e finalizar
                        </Link>
                      ) : (
                        <button
                          onClick={() => handleAvancarStatus(pedido.id, pedido.status)}
                          disabled={isPending}
                          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-50
                            ${col.id === 'Fila' ? 'bg-blue-500/10 text-info hover:bg-blue-500/20' : ''}
                            ${col.id === 'Imprimindo' ? 'bg-violet-500/10 text-accent hover:bg-violet-500/20' : ''}
                          `}
                        >
                          {col.id === 'Fila' && <><Play size={12} /> Iniciar Impressão</>}
                          {col.id === 'Imprimindo' && <><CheckCircle2 size={12} /> Concluir Impressão</>}
                        </button>
                      )}
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
