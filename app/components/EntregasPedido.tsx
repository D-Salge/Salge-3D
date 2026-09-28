'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, FileDown, PackageCheck, Truck, Undo2, X } from 'lucide-react'
import {
  atualizarQuantidadeProduzida, estornarEntregaPedido, registrarEntregaParcial,
} from '@/app/actions/entregas'
import type { PedidoDetalhes } from '@/app/actions/operacao'
import { calcularValorProporcional } from '@/lib/entregas.mjs'

function hojeLocal() {
  const agora = new Date()
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function EntregasPedido({ pedido }: { pedido: PedidoDetalhes }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [modal, setModal] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [produzida, setProduzida] = useState(String(pedido.quantidade_produzida))
  const [form, setForm] = useState({
    quantidade: Math.max(1, pedido.quantidade - pedido.quantidade_entregue),
    entregueEm: hojeLocal(), observacao: '', registrarPagamento: true,
    valorRecebido: Math.max(0, pedido.valor_total_cobrado - pedido.total_recebido), formaPagamento: 'Pix',
  })
  const restanteProduzir = Math.max(0, pedido.quantidade - pedido.quantidade_produzida)
  const restanteEntregar = Math.max(0, pedido.quantidade - pedido.quantidade_entregue)
  const percentualProduzido = Math.min(100, (pedido.quantidade_produzida / pedido.quantidade) * 100)
  const percentualEntregue = Math.min(100, (pedido.quantidade_entregue / pedido.quantidade) * 100)

  function alterarQuantidade(quantidade: number) {
    const valor = quantidade > 0 && quantidade <= pedido.quantidade
      ? calcularValorProporcional(pedido.valor_total_cobrado, pedido.quantidade, quantidade)
      : 0
    setForm((atual) => ({ ...atual, quantidade, valorRecebido: valor }))
  }

  function salvarProducao() {
    setMensagem('')
    startTransition(async () => {
      const resultado = await atualizarQuantidadeProduzida(pedido.id, Number(produzida))
      setMensagem(resultado.message)
      if (resultado.success) router.refresh()
    })
  }

  function registrar(event: React.FormEvent) {
    event.preventDefault()
    setMensagem('')
    startTransition(async () => {
      const resultado = await registrarEntregaParcial({ pedidoId: pedido.id, ...form })
      setMensagem(resultado.message)
      if (resultado.success) {
        setModal(false)
        router.refresh()
      }
    })
  }

  function estornar(id: number) {
    if (!confirm('Estornar esta entrega? Se houver pagamento vinculado, ele também será estornado.')) return
    startTransition(async () => {
      const resultado = await estornarEntregaPedido(id)
      setMensagem(resultado.message)
      if (resultado.success) router.refresh()
    })
  }

  return <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-semibold"><Truck size={16} /> Produção e entregas em lotes</h2><p className="mt-1 text-xs text-white/35">Avance as unidades sem precisar finalizar o pedido inteiro.</p></div>{restanteEntregar > 0 && pedido.status !== 'Cancelado' && <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]"><PackageCheck size={14} /> Registrar entrega</button>}</div>

    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-white/[0.03] p-4"><div className="flex justify-between text-xs"><span className="text-white/45">Produzido</span><b>{pedido.quantidade_produzida} de {pedido.quantidade}</b></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-blue-400" style={{ width: `${percentualProduzido}%` }} /></div><p className="mt-2 text-[10px] text-white/30">Restam {restanteProduzir} unidade(s) para produzir.</p></div>
      <div className="rounded-xl bg-white/[0.03] p-4"><div className="flex justify-between text-xs"><span className="text-white/45">Entregue</span><b>{pedido.quantidade_entregue} de {pedido.quantidade}</b></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#d8f45a]" style={{ width: `${percentualEntregue}%` }} /></div><p className="mt-2 text-[10px] text-white/30">Restam {restanteEntregar} unidade(s) para entregar.</p></div>
    </div>

    {!['Finalizado', 'Cancelado'].includes(pedido.status) && <div className="mt-4 flex flex-wrap items-end gap-2"><label className="text-xs text-white/45">Total já produzido<input type="number" step="1" min={pedido.quantidade_entregue} max={pedido.quantidade} value={produzida} onChange={(e) => setProduzida(e.target.value)} className="mt-2 h-10 w-32 rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><button disabled={isPending} onClick={salvarProducao} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-500/10 px-3 text-xs text-blue-300"><Check size={13} /> Atualizar produção</button></div>}
    {mensagem && <p className="mt-4 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/60">{mensagem}</p>}

    <div className="mt-6 border-t border-white/[0.06] pt-5"><h3 className="text-xs font-semibold uppercase tracking-wider text-white/35">Histórico de entregas</h3>{pedido.entregas.length === 0 ? <p className="mt-4 text-xs text-white/30">Nenhuma entrega registrada.</p> : <div className="mt-3 space-y-2">{pedido.entregas.map((entrega) => <div key={entrega.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.03] p-3"><div><p className="text-sm font-medium">{entrega.quantidade} unidade(s) · {new Date(`${entrega.entregue_em}T12:00:00`).toLocaleDateString('pt-BR')}</p><p className="mt-1 text-[10px] text-white/35">Referência {moeda(entrega.valor_referente)}{entrega.valor_recebido !== null ? ` · recebido ${moeda(entrega.valor_recebido)} via ${entrega.forma_pagamento}` : ' · sem pagamento vinculado'}</p>{entrega.observacao && <p className="mt-1 text-[10px] text-white/30">{entrega.observacao}</p>}</div><div className="flex gap-2"><a href={`/api/entregas/${entrega.id}/pdf`} target="_blank" className="rounded-lg bg-white/[0.05] p-2 text-white/50" aria-label="Baixar comprovante"><FileDown size={14} /></a><button disabled={isPending} onClick={() => estornar(entrega.id)} className="rounded-lg bg-red-500/10 p-2 text-red-300" aria-label="Estornar entrega"><Undo2 size={14} /></button></div></div>)}</div>}</div>

    {modal && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/75 p-4"><form onSubmit={registrar} className="my-6 w-full max-w-lg rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Registrar entrega parcial</h2><p className="mt-1 text-xs text-white/35">O pedido continuará em {pedido.status} após esta entrega.</p></div><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div><div className="space-y-4"><div className="grid grid-cols-2 gap-4"><label className="text-xs text-white/50">Quantidade<input required type="number" min="1" max={restanteEntregar} step="1" value={form.quantidade} onChange={(e) => alterarQuantidade(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Data da entrega<input required type="date" value={form.entregueEm} onChange={(e) => setForm({ ...form, entregueEm: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label></div><div className="rounded-xl border border-[#d8f45a]/15 bg-[#d8f45a]/[0.04] p-3 text-xs text-white/55">Valor proporcional sugerido: <b className="text-[#d8f45a]">{form.quantidade > 0 && form.quantidade <= pedido.quantidade ? moeda(calcularValorProporcional(pedido.valor_total_cobrado, pedido.quantidade, form.quantidade)) : moeda(0)}</b></div><label className="flex items-start gap-3 rounded-xl border border-white/[0.06] p-3 text-xs text-white/55"><input type="checkbox" checked={form.registrarPagamento} onChange={(e) => setForm({ ...form, registrarPagamento: e.target.checked })} className="mt-0.5 accent-[#d8f45a]" /><span>Registrar também o pagamento desta entrega.</span></label>{form.registrarPagamento && <div className="grid grid-cols-2 gap-4"><label className="text-xs text-white/50">Valor recebido<input required type="number" min="0.01" max={pedido.saldo_pendente} step="0.01" value={form.valorRecebido} onChange={(e) => setForm({ ...form, valorRecebido: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Forma<select value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{['Pix', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Transferência', 'Outro'].map((item) => <option key={item}>{item}</option>)}</select></label></div>}<label className="block text-xs text-white/50">Observação<textarea maxLength={500} rows={3} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Ex.: Primeira remessa de ímãs" className="mt-2 w-full rounded-lg border border-white/10 bg-[#101114] p-3 text-sm" /></label><button disabled={isPending} className="w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50">{isPending ? 'Registrando...' : 'Confirmar entrega parcial'}</button></div></form></div>}
  </section>
}
