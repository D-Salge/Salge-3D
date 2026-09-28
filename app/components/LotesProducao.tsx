'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Boxes, Check, Play, Plus } from 'lucide-react'
import { atualizarLoteProducao, criarLoteProducao, type LoteProducao, type PedidoParaLote } from '@/app/actions/lotes-producao'

type ImpressoraOpcao = { id: number; nome: string }

export function LotesProducao({ lotes, pedidos, impressoras }: {
  lotes: LoteProducao[]
  pedidos: PedidoParaLote[]
  impressoras: ImpressoraOpcao[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [aberto, setAberto] = useState(false)
  const [progresso, setProgresso] = useState<Record<number, string>>(() => Object.fromEntries(lotes.map((item) => [item.id, String(item.quantidade_produzida)])))
  const [form, setForm] = useState({ pedidoId: pedidos[0]?.id ?? 0, quantidade: 1, impressoraId: '', placaReferencia: '', observacoes: '' })
  const pedido = useMemo(() => pedidos.find((item) => item.id === form.pedidoId), [pedidos, form.pedidoId])
  const disponivel = pedido ? Math.max(0, pedido.quantidade - pedido.quantidade_planejada) : 0

  function criar(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await criarLoteProducao({
        ...form, impressoraId: form.impressoraId ? Number(form.impressoraId) : null,
      })
      setMensagem(result.message)
      if (result.success) { setAberto(false); router.refresh() }
    })
  }

  function atualizar(lote: LoteProducao, status: string, produzido: number) {
    startTransition(async () => {
      const result = await atualizarLoteProducao({ loteId: lote.id, status, quantidadeProduzida: produzido, tempoRealHoras: lote.tempo_real_horas })
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  return <section className="mb-7 rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold"><Boxes size={17} className="text-blue-400" /> Lotes e placas</h2><p className="mt-1 text-xs text-white/35">Divida pedidos grandes por placa, impressora ou remessa e acompanhe o realizado.</p></div>
      <button type="button" onClick={() => setAberto((valor) => !valor)} disabled={pedidos.length === 0} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-500/15 px-4 text-xs font-medium text-blue-300 disabled:opacity-40"><Plus size={14} /> Novo lote</button>
    </div>
    {mensagem && <p className="mt-4 rounded-lg bg-white/[0.04] p-3 text-xs text-white/60">{mensagem}</p>}
    {aberto && <form onSubmit={criar} className="mt-5 grid gap-3 rounded-xl border border-blue-400/15 bg-blue-400/[0.03] p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-xs text-white/45 lg:col-span-2">Pedido<select required value={form.pedidoId} onChange={(e) => setForm({ ...form, pedidoId: Number(e.target.value), quantidade: 1 })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3"><option value={0}>Selecione</option>{pedidos.map((item) => <option key={item.id} value={item.id}>{item.numero_orcamento} · {item.nome_da_peca} · livre {Math.max(0, item.quantidade - item.quantidade_planejada)}</option>)}</select></label>
      <label className="text-xs text-white/45">Quantidade<input required type="number" min="0.001" max={disponivel} step="0.001" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
      <label className="text-xs text-white/45">Impressora<select value={form.impressoraId} onChange={(e) => setForm({ ...form, impressoraId: e.target.value })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3"><option value="">Definir depois</option>{impressoras.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label className="text-xs text-white/45">Placa/arquivo<input maxLength={100} value={form.placaReferencia} onChange={(e) => setForm({ ...form, placaReferencia: e.target.value })} placeholder="Placa 01 / 3MF" className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
      <label className="text-xs text-white/45 sm:col-span-2 lg:col-span-4">Observações<input maxLength={500} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
      <button disabled={isPending || disponivel <= 0} className="mt-auto h-10 rounded-lg bg-blue-400 px-3 text-xs font-semibold text-[#0d1117] disabled:opacity-40">Criar lote</button>
    </form>}
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      {lotes.filter((item) => item.status !== 'Cancelado').slice(0, 12).map((lote) => <div key={lote.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{lote.codigo} · {lote.nome_da_peca}</p><p className="mt-1 text-[10px] text-white/35">{lote.cliente_nome} · {lote.impressora_nome ?? 'sem impressora'}{lote.placa_referencia ? ` · ${lote.placa_referencia}` : ''}</p></div><span className={`rounded px-2 py-1 text-[10px] ${lote.status === 'Concluído' ? 'bg-emerald-500/10 text-emerald-300' : lote.status === 'Imprimindo' ? 'bg-blue-500/10 text-blue-300' : 'bg-white/[0.05] text-white/45'}`}>{lote.status}</span></div>
        <div className="mt-3"><div className="flex justify-between text-[10px] text-white/35"><span>Produzido</span><span>{lote.quantidade_produzida}/{lote.quantidade_planejada}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-blue-400" style={{ width: `${Math.min(100, lote.quantidade_planejada ? lote.quantidade_produzida / lote.quantidade_planejada * 100 : 0)}%` }} /></div></div>
        {lote.status === 'Planejado' && <button disabled={isPending} onClick={() => atualizar(lote, 'Imprimindo', lote.quantidade_produzida)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-300"><Play size={12} /> Iniciar</button>}
        {lote.status === 'Imprimindo' && <div className="mt-3 flex flex-wrap items-center gap-2"><input aria-label={`Quantidade produzida do ${lote.codigo}`} type="number" min={lote.quantidade_produzida} max={lote.quantidade_planejada} step="0.001" value={progresso[lote.id] ?? ''} onChange={(e) => setProgresso({ ...progresso, [lote.id]: e.target.value })} className="h-9 w-24 rounded-lg border border-white/10 bg-[#101114] px-2 text-xs" /><button disabled={isPending} onClick={() => atualizar(lote, 'Imprimindo', Number(progresso[lote.id]))} className="h-9 rounded-lg bg-blue-500/10 px-3 text-xs text-blue-300">Salvar avanço</button><button disabled={isPending} onClick={() => atualizar(lote, 'Concluído', lote.quantidade_planejada)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500/10 px-3 text-xs text-emerald-300"><Check size={12} /> Concluir lote</button></div>}
      </div>)}
      {lotes.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/30 lg:col-span-2">Nenhum lote criado. Pedidos pequenos podem continuar pelo fluxo normal.</p>}
    </div>
  </section>
}
