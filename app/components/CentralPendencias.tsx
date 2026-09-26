import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDollarSign, PackageSearch, Printer, ReceiptText, Wrench } from 'lucide-react'
import type { PendenciaCentral } from '@/app/actions/pendencias'

const icones = {
  Cobranca: CircleDollarSign,
  Despesa: CircleDollarSign,
  Producao: Printer,
  Estoque: PackageSearch,
  Manutencao: Wrench,
  Orcamento: ReceiptText,
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CentralPendencias({ pendencias }: { pendencias: PendenciaCentral[] }) {
  return (
    <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5 sm:px-8">
        <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-300"><AlertTriangle size={18} /></div><div><h2 className="text-sm font-semibold">Central de pendências</h2><p className="mt-0.5 text-xs text-white/35">O que precisa da sua atenção agora</p></div></div>
        {pendencias.length > 0 && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-300">{pendencias.length} prioridade{pendencias.length === 1 ? '' : 's'}</span>}
      </div>
      {pendencias.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-7 text-sm text-white/40 sm:px-8"><CheckCircle2 size={18} className="text-emerald-400" /> Nenhuma pendência urgente encontrada.</div>
      ) : (
        <div className="grid gap-px bg-white/[0.04] sm:grid-cols-2">
          {pendencias.map((item) => {
            const Icone = icones[item.tipo]
            return <Link key={item.id} href={item.href} className="group flex min-w-0 items-center gap-3 bg-[#15171b] px-6 py-4 hover:bg-white/[0.025] sm:px-8"><div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.prioridade === 'Critica' ? 'bg-red-500/10 text-red-300' : item.prioridade === 'Alta' ? 'bg-amber-500/10 text-amber-300' : 'bg-blue-500/10 text-blue-300'}`}><Icone size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-white/75">{item.titulo}</p><p className="mt-1 truncate text-[10px] text-white/30">{item.descricao}{item.dataReferencia ? ` · ${item.dataReferencia.split('-').reverse().join('/')}` : ''}</p></div>{item.valor !== null && <span className="shrink-0 font-mono text-xs text-white/55">{moeda(item.valor)}</span>}<ArrowRight size={13} className="shrink-0 text-white/20 group-hover:text-[#d8f45a]" /></Link>
          })}
        </div>
      )}
    </section>
  )
}
