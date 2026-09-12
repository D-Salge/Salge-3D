'use client'

/**
 * app/components/TabelaPedidos.tsx  —  v2
 * Estilizado para combinar com o design ForgeOS/v0.
 */

import type { PedidoResumo } from '@/app/actions/pedidos'

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
  const fmtBRL = (v: number) =>
    `R$ ${v.toFixed(2).replace('.', ',')}`

  const fmtData = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    })

  if (pedidos.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {['#', 'Peça', 'Cliente', 'Materiais', 'Tempo', 'Total', 'Status', 'Data'].map((h) => (
              <th
                key={h}
                className="pb-3 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 first:pl-0 last:pr-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {pedidos.map((p) => (
            <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
              <td className="py-3.5 pl-0 pr-3 font-mono text-white/20 text-xs">
                #{p.id}
              </td>
              <td className="py-3.5 px-3 font-medium text-white/90 max-w-[140px] truncate">
                {p.nome_da_peca}
              </td>
              <td className="py-3.5 px-3 text-white/50">{p.cliente_nome}</td>
              <td className="py-3.5 px-3 text-white/35 text-xs max-w-[160px] truncate">
                {p.materiais}
              </td>
              <td className="py-3.5 px-3 font-mono text-white/40 text-xs whitespace-nowrap">
                {p.tempo_impressao_horas}h
              </td>
              <td className="py-3.5 px-3 font-mono font-semibold text-[#d8f45a] whitespace-nowrap">
                {fmtBRL(p.valor_total_cobrado)}
              </td>
              <td className="py-3.5 px-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="py-3.5 pl-3 pr-0 text-white/25 text-xs whitespace-nowrap">
                {fmtData(p.data_pedido)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
