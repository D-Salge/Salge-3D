'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, Check, WandSparkles } from 'lucide-react'
import { aplicarPlanejamentoProducao, type PlanejamentoProducao as Plano } from '@/app/actions/planejamento'

function fmtData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function PlanejamentoProducao({ plano }: { plano: Plano }) {
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const totalPedidos = plano.impressoras.reduce((total, impressora) => total + impressora.pedidos.length, 0)

  function aplicar() {
    if (!confirm('Aplicar estes horários previstos aos pedidos atribuídos?')) return
    startTransition(async () => setMensagem((await aplicarPlanejamentoProducao()).message))
  }

  return (
    <section className="mb-7 rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock size={17} className="text-[#d8f45a]" /> Previsão da produção</h2>
          <p className="mt-1 text-xs text-white/35">Fila contínua por impressora, priorizando o que já está imprimindo e as entregas mais próximas.</p>
        </div>
        <button type="button" onClick={aplicar} disabled={isPending || totalPedidos === 0}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d] disabled:opacity-40">
          {isPending ? <WandSparkles size={14} className="animate-pulse" /> : <Check size={14} />}
          {isPending ? 'Aplicando...' : 'Aplicar horários'}
        </button>
      </div>
      {mensagem && <p className="mb-4 rounded-lg bg-white/[0.04] p-3 text-xs text-white/60">{mensagem}</p>}

      {plano.semImpressora.length > 0 && <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs text-amber-100/70">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" />
        <span>{plano.semImpressora.length} pedido{plano.semImpressora.length === 1 ? '' : 's'} sem impressora não entrou no planejamento. {plano.semImpressora.map((pedido) => pedido.numero_orcamento ?? `#${pedido.id}`).join(', ')}</span>
      </div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {plano.impressoras.map((impressora) => (
          <div key={impressora.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium">{impressora.nome}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-white/30">{impressora.status} · {impressora.horas_planejadas.toFixed(1)}h na fila</p></div>
              <div className="text-right"><p className="text-[10px] text-white/30">Livre em</p><p className="mt-1 font-mono text-xs text-[#d8f45a]">{fmtData(impressora.livre_em)}</p></div>
            </div>
            <div className="mt-4 space-y-2">
              {impressora.pedidos.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-3 text-center text-xs text-white/25">Sem pedidos atribuídos.</p>}
              {impressora.pedidos.map((pedido, index) => (
                <Link key={pedido.id} href={`/pedidos/${pedido.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] p-3 hover:bg-white/[0.06]">
                  <div className="min-w-0"><p className="truncate text-xs font-medium text-white/80">{index + 1}. {pedido.nome_da_peca}</p><p className="mt-1 truncate text-[10px] text-white/35">{pedido.cliente_nome} · {pedido.tempo_impressao_horas}h</p></div>
                  <div className="shrink-0 text-right"><p className={`font-mono text-[10px] ${pedido.atrasado ? 'text-red-300' : 'text-white/45'}`}>{fmtData(pedido.fim_previsto_calculado)}</p>{pedido.atrasado && <p className="mt-1 text-[9px] uppercase text-red-400">risco de atraso</p>}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
