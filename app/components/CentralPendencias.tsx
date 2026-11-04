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
    <section className="mb-8 rounded-2xl border border-border bg-card shadow-2xl shadow-black/10">
      <div className="flex items-center justify-between border-b border-border px-6 py-5 sm:px-8">
        <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-warning"><AlertTriangle size={18} /></div><div><h2 className="text-sm font-semibold">Central de pendências</h2><p className="mt-0.5 text-xs text-muted-foreground">O que precisa da sua atenção agora</p></div></div>
        {pendencias.length > 0 && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-warning">{pendencias.length} prioridade{pendencias.length === 1 ? '' : 's'}</span>}
      </div>
      {pendencias.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-7 text-sm text-muted-foreground sm:px-8"><CheckCircle2 size={18} className="text-success" /> Nenhuma pendência urgente encontrada.</div>
      ) : (
        <div className="grid gap-px bg-subtle sm:grid-cols-2">
          {pendencias.map((item) => {
            const Icone = icones[item.tipo]
            return <Link key={item.id} href={item.href} className="group flex min-w-0 items-center gap-3 bg-card px-6 py-4 hover:bg-subtle sm:px-8"><div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.prioridade === 'Critica' ? 'bg-red-500/10 text-destructive' : item.prioridade === 'Alta' ? 'bg-amber-500/10 text-warning' : 'bg-blue-500/10 text-info'}`}><Icone size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-secondary-foreground">{item.titulo}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{item.descricao}{item.dataReferencia ? ` · ${item.dataReferencia.split('-').reverse().join('/')}` : ''}</p></div>{item.valor !== null && <span className="shrink-0 font-mono text-xs text-secondary-foreground">{moeda(item.valor)}</span>}<ArrowRight size={13} className="shrink-0 text-muted-foreground group-hover:text-accent" /></Link>
          })}
        </div>
      )}
    </section>
  )
}
