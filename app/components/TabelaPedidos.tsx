'use client'

import { useState } from 'react'
import type { PedidoResumo } from '@/app/actions/pedidos'
import { RecebimentoModal } from '@/app/components/RecebimentoModal'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  'Fila':        { label: 'Fila',       dot: 'bg-amber-400',   text: 'text-amber-400/80' },
  'Imprimindo':  { label: 'Imprimindo', dot: 'bg-blue-400',    text: 'text-blue-400/80' },
  'Acabamento':  { label: 'Acabamento', dot: 'bg-violet-400',  text: 'text-violet-400/80' },
  'Finalizado':  { label: 'Finalizado', dot: 'bg-[#d8f45a]',   text: 'text-[#d8f45a]/80' },
  'Cancelado':   { label: 'Cancelado',  dot: 'bg-red-400',     text: 'text-red-400/80' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, dot: 'bg-slate-400', text: 'text-slate-400/80' }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      <span className={`text-xs ${cfg.text}`}>{cfg.label}</span>
    </span>
  )
}

export function TabelaPedidos({ pedidos }: { pedidos: PedidoResumo[] }) {
  const [modalPedidoId, setModalPedidoId] = useState<number | null>(null)

  const fmtBRL = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
  const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

  if (pedidos.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="w-[120px] pb-3 pl-0 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Número</th>
            <th className="w-[150px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Peça</th>
            <th className="w-[100px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Cliente</th>
            <th className="w-[90px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Total</th>
            <th className="hidden w-[90px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 xl:table-cell">Recebido</th>
            <th className="w-[90px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Orçamento</th>
            <th className="w-[95px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Produção</th>
            <th className="hidden w-[75px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 xl:table-cell">Data</th>
            <th className="sticky right-0 z-20 w-[220px] min-w-[220px] bg-[#15171b] pb-3 pl-4 pr-0 text-right text-[10px] font-medium uppercase tracking-wider text-white/25 shadow-[-12px_0_18px_-18px_rgba(0,0,0,0.95)]">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {pedidos.map((p) => {
            let zapUrl = ''
            if (p.cliente_telefone) {
              const num = p.cliente_telefone.replace(/\D/g, '')
              const text = encodeURIComponent(`Olá, ${p.cliente_nome.split(' ')[0]}! Tudo bem? O orçamento da sua peça "${p.nome_da_peca}" ficou em ${fmtBRL(p.valor_total_cobrado)}. Podemos iniciar a produção?`)
              zapUrl = `https://wa.me/55${num}?text=${text}`
            }

            const isPendente = p.total_recebido < p.valor_total_cobrado

            return (
              <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 pl-0 pr-3 font-mono text-white/35 text-xs whitespace-nowrap">{p.numero_orcamento ?? `#${p.id}`}</td>
                <td className="py-3.5 px-3 font-medium text-white/90 max-w-[140px] truncate">{p.nome_da_peca}</td>
                <td className="py-3.5 px-3 text-white/50">{p.cliente_nome}</td>
                <td className="py-3.5 px-3 font-mono font-semibold text-[#d8f45a] whitespace-nowrap">{fmtBRL(p.valor_total_cobrado)}</td>
                <td className="hidden py-3.5 px-3 font-mono text-xs whitespace-nowrap xl:table-cell">
                   <span className={isPendente ? 'text-amber-400' : 'text-emerald-400'}>{fmtBRL(p.total_recebido)}</span>
                </td>
                <td className="py-3.5 px-3"><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/60">{p.orcamento_status}</span></td>
                <td className="py-3.5 px-3"><StatusBadge status={p.status} /></td>
                <td className="hidden py-3.5 px-3 text-white/25 text-xs whitespace-nowrap xl:table-cell">{fmtData(p.data_pedido)}</td>
                <td className="sticky right-0 z-10 w-[220px] min-w-[220px] bg-[#15171b] py-3.5 pl-4 pr-0 text-right shadow-[-12px_0_18px_-18px_rgba(0,0,0,0.95)] transition-colors group-hover:bg-[#17191d]">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Link href={`/pedidos/${p.id}`} className="inline-flex h-7 items-center rounded-md bg-[#d8f45a]/10 px-2 text-xs font-medium text-[#d8f45a] hover:bg-[#d8f45a]/20">Detalhes</Link>
                    <Link href={`/orcamentos/duplicar/${p.id}`} className="inline-flex h-7 items-center rounded-md bg-white/[0.05] px-2 text-xs font-medium text-white/60 hover:bg-white/[0.1] hover:text-white">Duplicar</Link>
                    {p.orcamento_status === 'Aprovado' && <button
                      onClick={() => setModalPedidoId(p.id)}
                      className="inline-flex h-7 items-center rounded-md bg-white/[0.05] px-2 text-xs font-medium text-white/60 hover:bg-white/[0.1] hover:text-white"
                      title="Registrar Pagamento"
                    >
                      💰 Pagar
                    </button>}
                    {zapUrl && (
                      <a
                        href={zapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 items-center justify-center rounded-md bg-emerald-500/10 px-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
                        title="Enviar cobrança pelo WhatsApp"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {modalPedidoId && (
        <RecebimentoModal pedidoId={modalPedidoId} onClose={() => setModalPedidoId(null)} />
      )}
    </div>
  )
}
