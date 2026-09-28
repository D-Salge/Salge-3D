import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, MessageCircle, Settings2, Target, TrendingUp, Users } from 'lucide-react'
import type { RelatorioGerencial } from '@/app/actions/relatorios'

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mes(chave: string) {
  const [ano, numero] = chave.split('-')
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(Number(ano), Number(numero) - 1, 1)).replace('.', '') + `/${ano.slice(2)}`
}

function Variacao({ valor }: { valor: number }) {
  const positivo = valor >= 0
  const Icone = positivo ? ArrowUpRight : ArrowDownRight
  return <span className={`inline-flex items-center gap-1 text-[10px] ${positivo ? 'text-emerald-400' : 'text-red-300'}`}><Icone size={11} /> {Math.abs(valor).toLocaleString('pt-BR')}% vs. mês anterior</span>
}

function MetaCard({ titulo, realizado, meta, percentual, formato, variacao }: {
  titulo: string
  realizado: number
  meta: number
  percentual: number
  formato: 'moeda' | 'numero'
  variacao: number
}) {
  const exibir = (valor: number) => formato === 'moeda' ? moeda(valor) : valor.toLocaleString('pt-BR')
  return <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><div className="flex items-center justify-between"><p className="text-xs text-white/40">{titulo}</p><Target size={15} className="text-[#d8f45a]" /></div><p className="mt-3 text-2xl font-semibold">{exibir(realizado)}</p>{meta > 0 ? <><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-[#d8f45a]" style={{ width: `${Math.min(percentual, 100)}%` }} /></div><div className="mt-2 flex items-center justify-between gap-2"><span className="text-[10px] text-white/30">{percentual.toLocaleString('pt-BR')}% de {exibir(meta)}</span><Variacao valor={variacao} /></div></> : <div className="mt-4 flex items-center justify-between"><Link href="/configuracoes" className="flex items-center gap-1 text-[10px] text-amber-300"><Settings2 size={11} /> Definir meta</Link><Variacao valor={variacao} /></div>}</div>
}

export function RelatoriosPage({ relatorio }: { relatorio: RelatorioGerencial }) {
  const maiorReceita = Math.max(1, ...relatorio.dre.map((item) => item.receita))
  const funilTotal = Math.max(1, relatorio.funil.rascunhos + relatorio.funil.enviados + relatorio.funil.aprovados + relatorio.funil.recusados + relatorio.funil.expirados)
  const etapas = [
    ['Rascunhos', relatorio.funil.rascunhos, 'bg-slate-400'],
    ['Enviados', relatorio.funil.enviados, 'bg-blue-400'],
    ['Aprovados', relatorio.funil.aprovados, 'bg-[#d8f45a]'],
    ['Recusados', relatorio.funil.recusados, 'bg-red-400'],
    ['Expirados', relatorio.funil.expirados, 'bg-amber-400'],
  ] as const

  return <>
    <div className="mb-8"><p className="mb-3 text-xs text-white/35">Gestão / Relatórios</p><h1 className="text-3xl font-semibold">Desempenho da Salge 3D</h1><p className="mt-2 text-sm text-white/40">Resultado mensal, metas, conversão comercial e oportunidades de recompra.</p></div>

    <section className="mb-8 grid gap-4 md:grid-cols-3">
      <MetaCard titulo="Meta de faturamento" {...relatorio.metas.faturamento} formato="moeda" variacao={relatorio.comparacao.receita} />
      <MetaCard titulo="Meta de resultado" {...relatorio.metas.lucro} formato="moeda" variacao={relatorio.comparacao.resultado} />
      <MetaCard titulo="Meta de pedidos" {...relatorio.metas.pedidos} formato="numero" variacao={relatorio.comparacao.pedidos} />
    </section>

    <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#15171b]">
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5"><div className="flex size-9 items-center justify-center rounded-lg bg-[#d8f45a]/10 text-[#d8f45a]"><TrendingUp size={18} /></div><div><h2 className="text-sm font-semibold">DRE gerencial · 12 meses</h2><p className="mt-0.5 text-xs text-white/35">Resultado dos pedidos menos despesas administrativas; compras de estoque e equipamentos aparecem separadas.</p></div></div>
      <div className="overflow-x-auto p-6">
        <div className="mb-6 flex h-32 min-w-[720px] items-end gap-2 border-b border-white/[0.06] pb-1">{relatorio.dre.map((item) => <div key={item.competencia} className="group flex flex-1 flex-col items-center justify-end gap-1"><span className="invisible text-[9px] text-white/40 group-hover:visible">{moeda(item.receita)}</span><div className="w-full max-w-10 rounded-t bg-[#d8f45a]/70" style={{ height: `${Math.max(2, item.receita / maiorReceita * 90)}px` }} /><span className="text-[9px] text-white/25">{mes(item.competencia)}</span></div>)}</div>
        <table className="min-w-[900px] w-full text-xs"><thead><tr className="border-b border-white/[0.06] text-left text-[10px] uppercase text-white/25">{['Mês', 'Pedidos', 'Receita', 'Custos dos pedidos', 'Lucro dos pedidos', 'Desp. administrativas', 'Compras/invest.', 'Resultado', 'Margem'].map((item) => <th key={item} className="px-3 py-3 first:pl-0 last:pr-0 last:text-right">{item}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.04]">{[...relatorio.dre].reverse().map((item) => <tr key={item.competencia}><td className="py-3 pl-0 pr-3 font-medium">{mes(item.competencia)}</td><td className="px-3 py-3">{item.pedidos}</td><td className="px-3 py-3 font-mono">{moeda(item.receita)}</td><td className="px-3 py-3 font-mono text-white/50">{moeda(item.custosPedidos)}</td><td className="px-3 py-3 font-mono text-white/70">{moeda(item.lucroPedidos)}</td><td className="px-3 py-3 font-mono text-white/50">{moeda(item.despesasAdministrativas)}</td><td className="px-3 py-3 font-mono text-white/35">{moeda(item.comprasInvestimentos)}</td><td className={`px-3 py-3 font-mono font-semibold ${item.resultadoGerencial >= 0 ? 'text-[#d8f45a]' : 'text-red-300'}`}>{moeda(item.resultadoGerencial)}</td><td className={`py-3 pl-3 pr-0 text-right font-mono ${item.margem >= 0 ? 'text-white/65' : 'text-red-300'}`}>{item.margem.toLocaleString('pt-BR')}%</td></tr>)}</tbody></table>
      </div>
    </section>

    <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300"><BarChart3 size={18} /></div><div><h2 className="text-sm font-semibold">Funil de orçamentos · 12 meses</h2><p className="mt-0.5 text-xs text-white/35">Conversão considera apenas propostas já decididas.</p></div></div><div className="text-right"><p className="text-2xl font-semibold text-[#d8f45a]">{relatorio.funil.conversao.toLocaleString('pt-BR')}%</p><p className="text-[10px] text-white/30">taxa de aprovação</p></div></div>
      <div className="grid gap-3 sm:grid-cols-5">{etapas.map(([nome, valor, cor]) => <div key={nome} className="rounded-xl bg-[#101114] p-4"><div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full ${cor}`} style={{ width: `${valor / funilTotal * 100}%` }} /></div><p className="text-xl font-semibold">{valor}</p><p className="mt-1 text-[10px] text-white/35">{nome}</p></div>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.06] p-4"><p className="text-xs text-white/35">Valor ainda em negociação</p><p className="mt-2 font-mono text-lg text-blue-300">{moeda(relatorio.funil.valorAberto)}</p></div><div className="rounded-xl border border-white/[0.06] p-4"><p className="text-xs text-white/35">Valor recusado ou expirado</p><p className="mt-2 font-mono text-lg text-amber-300">{moeda(relatorio.funil.valorPerdido)}</p></div></div>
    </section>

    <section className="rounded-2xl border border-white/[0.08] bg-[#15171b]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300"><Users size={18} /></div><div><h2 className="text-sm font-semibold">Oportunidades de reativação</h2><p className="mt-0.5 text-xs text-white/35">Clientes sem compra aprovada há {relatorio.diasClienteInativo} dias ou mais.</p></div></div><Link href="/configuracoes" className="text-[10px] text-white/30 hover:text-[#d8f45a]">Alterar período</Link></div>
      {relatorio.clientesInativos.length === 0 ? <div className="flex items-center gap-3 px-6 py-8 text-sm text-white/35"><CheckCircle2 size={17} className="text-emerald-400" /> Nenhum cliente dentro desse critério.</div> : <div className="divide-y divide-white/[0.05]">{relatorio.clientesInativos.map((cliente) => <div key={cliente.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"><div><Link href={`/clientes/${cliente.id}`} className="text-sm font-medium text-white/75 hover:text-[#d8f45a]">{cliente.nome}</Link><p className="mt-1 text-[10px] text-white/30">Última compra {new Date(`${cliente.ultima_compra}T12:00:00`).toLocaleDateString('pt-BR')} · {cliente.dias_sem_comprar} dias · {cliente.pedidos} pedido(s) · {moeda(cliente.total_vendido)}</p></div>{cliente.whatsapp_url ? <a href={cliente.whatsapp_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><MessageCircle size={14} /> Reativar no WhatsApp</a> : <span className="text-[10px] text-white/25">Telefone não cadastrado</span>}</div>)}</div>}
    </section>
  </>
}
