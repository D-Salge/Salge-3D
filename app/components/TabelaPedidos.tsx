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
            {['#', 'Peça', 'Cliente', 'Materiais', 'Tempo', 'Total', 'Status', 'Data', ''].map((h, i) => (
              <th
                key={i}
                className="pb-3 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 first:pl-0 last:pr-0"
              >
                {h}
              </th>
            ))}
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

            return (
              <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 pl-0 pr-3 font-mono text-white/20 text-xs">#{p.id}</td>
                <td className="py-3.5 px-3 font-medium text-white/90 max-w-[140px] truncate">{p.nome_da_peca}</td>
                <td className="py-3.5 px-3 text-white/50">{p.cliente_nome}</td>
                <td className="py-3.5 px-3 text-white/35 text-xs max-w-[160px] truncate">{p.materiais}</td>
                <td className="py-3.5 px-3 font-mono text-white/40 text-xs whitespace-nowrap">{p.tempo_impressao_horas}h</td>
                <td className="py-3.5 px-3 font-mono font-semibold text-[#d8f45a] whitespace-nowrap">{fmtBRL(p.valor_total_cobrado)}</td>
                <td className="py-3.5 px-3"><StatusBadge status={p.status} /></td>
                <td className="py-3.5 px-3 text-white/25 text-xs whitespace-nowrap">{fmtData(p.data_pedido)}</td>
                <td className="py-3.5 pl-3 pr-0 text-right whitespace-nowrap">
                  {zapUrl && (
                    <a
                      href={zapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-md bg-emerald-500/10 p-1.5 text-emerald-400 opacity-0 transition hover:bg-emerald-500/20 group-hover:opacity-100"
                      title="Enviar cobrança pelo WhatsApp"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                      </svg>
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
