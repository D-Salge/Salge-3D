'use client'

import { useState } from 'react'
import { CheckCircle2, Clock3, MessageCircle } from 'lucide-react'
import type { PendenciaWhatsApp } from '@/app/actions/whatsapp'
import { WhatsAppModal } from './WhatsAppModal'

const CONFIG = {
  cobranca: { label: 'Cobrar pagamento', cor: 'text-amber-300 bg-amber-400/10' },
  orcamento: { label: 'Retomar orçamento', cor: 'text-blue-300 bg-blue-400/10' },
  pronto: { label: 'Avisar que está pronto', cor: 'text-[#d8f45a] bg-[#d8f45a]/10' },
  producao: { label: 'Atualizar produção', cor: 'text-violet-300 bg-violet-400/10' },
} as const

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PendenciasWhatsApp({ pendencias }: { pendencias: PendenciaWhatsApp[] }) {
  const [selecionada, setSelecionada] = useState<PendenciaWhatsApp | null>(null)

  return (
    <section className="mb-8 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.025] p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><MessageCircle size={16} className="text-emerald-400" /><h2 className="text-sm font-semibold">Acompanhamentos pelo WhatsApp</h2></div>
          <p className="mt-1 text-xs text-white/35">Orçamentos, pedidos prontos e pagamentos que pedem um contato.</p>
        </div>
        {pendencias.length > 0 && <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">{pendencias.length} pendente{pendencias.length === 1 ? '' : 's'}</span>}
      </div>

      {pendencias.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-3 text-xs text-white/35"><CheckCircle2 size={14} className="text-emerald-400/70" /> Nenhum acompanhamento pendente agora.</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {pendencias.map((pedido) => {
            const config = CONFIG[pedido.tipo_sugerido]
            return (
              <div key={pedido.id} className="flex flex-col justify-between gap-4 rounded-xl border border-white/[0.07] bg-[#15171b] p-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${config.cor}`}>{config.label}</span>
                    <span className="font-mono text-[10px] text-white/25">{pedido.numero_orcamento || `#${pedido.id}`}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-white/85">{pedido.cliente_nome} · {pedido.nome_da_peca}</p>
                  <p className="mt-1 text-xs text-white/35">
                    {pedido.tipo_sugerido === 'cobranca' ? `Pendente: ${fmtBRL(pedido.saldo_pendente)}` : `Total: ${fmtBRL(pedido.valor_total_cobrado)}`}
                  </p>
                  {pedido.ultimo_contato && <p className="mt-1 flex items-center gap-1 text-[10px] text-white/25"><Clock3 size={10} /> Último contato: {new Date(pedido.ultimo_contato).toLocaleString('pt-BR')}</p>}
                </div>
                <button type="button" onClick={() => setSelecionada(pedido)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"><MessageCircle size={14} /> Preparar mensagem</button>
              </div>
            )
          })}
        </div>
      )}

      {selecionada && <WhatsAppModal key={selecionada.id} pedido={selecionada} tipoInicial={selecionada.tipo_sugerido} onClose={() => setSelecionada(null)} />}
    </section>
  )
}
