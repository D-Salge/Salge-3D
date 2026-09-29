'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ClipboardCheck } from 'lucide-react'
import { atualizarChecklistPedido } from '@/app/actions/arquivos-checklists'
import type { ChecklistPedidoItem } from '@/app/actions/operacao'

export function ChecklistPedido({ pedidoId, itens }: { pedidoId: number; itens: ChecklistPedidoItem[] }) {
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const router = useRouter()
  const concluidos = itens.filter(item => item.concluido).length
  const percentual = itens.length ? Math.round(concluidos / itens.length * 100) : 0

  function alternar(item: ChecklistPedidoItem) {
    startTransition(async () => {
      const result = await atualizarChecklistPedido({ pedidoId, itemId: item.id, concluido: !item.concluido })
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  return <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck size={16} /> Checklist do produto</h2><p className="mt-1 text-xs text-white/35">Padrão reutilizável definido no catálogo técnico.</p></div>{itens.length > 0 && <span className="font-mono text-xs text-[#d8f45a]">{concluidos}/{itens.length}</span>}</div>
    {itens.length > 0 && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#d8f45a]" style={{ width: `${percentual}%` }} /></div>}
    <div className="mt-4 space-y-4">{(['Produção', 'Qualidade'] as const).map(etapa => { const grupo = itens.filter(item => item.etapa === etapa); return grupo.length > 0 && <div key={etapa}><p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">{etapa}</p><div className="space-y-2">{grupo.map(item => <button type="button" disabled={isPending} onClick={() => alternar(item)} key={item.id} className={`flex w-full items-start gap-3 rounded-lg p-3 text-left text-xs ${item.concluido ? 'bg-emerald-500/[0.06] text-white/45' : 'bg-white/[0.03] text-white/70'}`}><span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${item.concluido ? 'border-emerald-400 bg-emerald-400 text-[#111]' : 'border-white/20'}`}>{item.concluido && <CheckCircle2 size={11} />}</span><span className={item.concluido ? 'line-through' : ''}>{item.texto}</span></button>)}</div></div> })}{itens.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/30">Nenhum checklist configurado para este produto.</p>}</div>
    {mensagem && <p className="mt-3 text-[10px] text-white/40">{mensagem}</p>}
  </section>
}
