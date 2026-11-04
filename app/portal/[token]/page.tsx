import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Box, Calendar, CreditCard, PackageCheck, Truck } from 'lucide-react'
import { getOrcamentoPortal } from '@/app/actions/portal'
import { PortalResposta } from '@/app/components/PortalResposta'

export const metadata: Metadata = { title: 'Orçamento · Salge 3D', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (valor: string | null) => valor ? new Date(`${valor.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'A combinar'

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const pedido = await getOrcamentoPortal(token)
  if (!pedido) notFound()
  const entregue = pedido.entregas.reduce((total, item) => total + item.quantidade, 0)
  return <main className="min-h-screen bg-card px-4 py-10 text-foreground">
    <div className="mx-auto max-w-2xl">
      <header className="mb-7 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Box size={20} /></div><div><p className="font-semibold">Salge<span className="text-accent">3D</span></p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Portal do cliente</p></div></header>
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border p-6 sm:p-8"><p className="text-xs font-medium text-accent">{pedido.numero_orcamento}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{pedido.nome_da_peca}</h1><p className="mt-2 text-sm text-muted-foreground">Preparado para {pedido.cliente_nome}</p></div>
        <div className="space-y-6 p-6 sm:p-8">
          {pedido.descricao && <p className="text-sm leading-6 text-secondary-foreground">{pedido.descricao}</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Quantidade", pedido.quantidade], ["Preço unitário", moeda(pedido.preco_unitario)], ["Entrega", data(pedido.data_entrega)], ["Validade", data(pedido.validade_orcamento)]].map(([rotulo, valor]) => <div key={String(rotulo)} className="rounded-xl bg-subtle p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p><p className="mt-2 text-sm font-medium">{valor}</p></div>)}</div>
          <div className="flex items-end justify-between border-t border-border pt-5"><div><p className="text-xs text-muted-foreground">Total do orçamento</p>{pedido.frete_cobrado > 0 && <p className="mt-1 text-[10px] text-muted-foreground">Inclui {moeda(pedido.frete_cobrado)} de frete</p>}</div><p className="text-3xl font-bold text-accent">{moeda(pedido.valor_total_cobrado)}</p></div>
          {pedido.sinal_percentual > 0 && <div className="rounded-xl border border-accent/20 bg-accent/[0.05] p-4 text-sm"><div className="flex justify-between text-secondary-foreground"><span>Sinal para iniciar ({pedido.sinal_percentual.toLocaleString('pt-BR')}%)</span><b className="text-accent">{moeda(Math.round(pedido.valor_total_cobrado * pedido.sinal_percentual) / 100)}</b></div>{pedido.sinal_recebido > 0 && <div className="mt-2 flex justify-between text-muted-foreground"><span>Sinal recebido</span><b className="text-success">{moeda(pedido.sinal_recebido)}</b></div>}<div className="mt-2 flex justify-between text-muted-foreground"><span>Saldo atual do pedido</span><b>{moeda(pedido.saldo_pendente)}</b></div></div>}
          {pedido.orcamento_status === 'Aprovado' && pedido.saldo_pendente > 0.009 && pedido.link_pagamento && <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-info"><CreditCard size={16} /> Pagamento online</h2><p className="mt-1 text-xs text-muted-foreground">Saldo pendente: {moeda(pedido.saldo_pendente)}</p></div><a href={pedido.link_pagamento} target="_blank" rel="noreferrer" className="rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground">Pagar com Mercado Pago</a></div></div>}
          {pedido.orcamento_status === 'Aprovado' && <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.04] p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-success"><PackageCheck size={16} /> Acompanhamento do pedido</h2><p className="mt-2 text-xs text-muted-foreground">{entregue} de {pedido.quantidade} unidade(s) entregues.</p>{pedido.expedicao && <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Truck size={14} className="mt-0.5" /><span>{pedido.expedicao.modalidade} · {pedido.expedicao.status}{pedido.expedicao.previsao_entrega ? ` · previsão ${data(pedido.expedicao.previsao_entrega)}` : ''}{pedido.expedicao.url_rastreio && <a href={pedido.expedicao.url_rastreio} target="_blank" rel="noreferrer" className="ml-2 text-info underline">Rastrear</a>}</span></div>}</div>}
          <PortalResposta token={token} status={pedido.orcamento_status} respondido={Boolean(pedido.respondido_em)} />
        </div>
      </section>
      <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-muted-foreground"><Calendar size={11} /> Link seguro com validade limitada. Não compartilhe publicamente.</p>
    </div>
  </main>
}
