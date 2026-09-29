import { AlertTriangle, CheckCircle2, Gauge } from 'lucide-react'
import type { PedidoDetalhes } from '@/app/actions/operacao'

function valor(item: PedidoDetalhes['desvios']['itens'][number], numero: number) {
  if (item.unidade === 'R$') return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return `${numero.toLocaleString('pt-BR')} ${item.unidade}`
}

export function AnaliseDesviosPedido({ desvios }: { desvios: PedidoDetalhes['desvios'] }) {
  const cor = desvios.nivel === 'Crítico' ? 'text-red-300' : desvios.nivel === 'Atenção' ? 'text-amber-300' : 'text-emerald-300'
  return <section className="mb-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Gauge size={16} className={cor} /> Previsto × realizado</h2><p className="mt-1 text-xs text-white/35">Desvios acima de 5% pedem atenção; acima de 15% são críticos.</p></div><div className="text-right"><p className={`text-xs font-semibold ${cor}`}>{desvios.nivel}</p><p className="mt-1 text-[10px] text-white/30">dados reais: {desvios.completude}%</p></div></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{desvios.itens.map(item => <div key={item.rotulo} className="rounded-xl bg-black/15 p-3"><div className="flex items-center justify-between"><p className="text-[10px] uppercase text-white/30">{item.rotulo}</p>{item.nivel === 'Dentro' ? <CheckCircle2 size={12} className="text-emerald-300" /> : <AlertTriangle size={12} className={item.nivel === 'Crítico' ? 'text-red-300' : 'text-amber-300'} />}</div><p className="mt-2 text-xs text-white/55">{valor(item, item.previsto)} → <b className="text-white/80">{valor(item, item.realizado)}</b></p><p className={`mt-1 text-[10px] ${item.percentual > 5 ? item.percentual > 15 ? 'text-red-300' : 'text-amber-300' : 'text-emerald-300'}`}>{item.percentual > 0 ? '+' : ''}{item.percentual.toLocaleString('pt-BR')}%</p></div>)}</div>
    {desvios.usandoEstimativas && <p className="mt-3 text-[10px] text-amber-200/55">Alguns campos reais ainda estão vazios; nesses pontos o comparativo usa os valores estimados.</p>}
  </section>
}
