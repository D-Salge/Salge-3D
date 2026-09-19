'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import {
  registrarLoteFilamento,
  registrarPerdaFilamento,
  type LoteFilamento,
} from '@/app/actions/estoque'

interface FilamentoOption {
  id: number
  nome: string
  peso_rolo_gramas: number
  preco_rolo: number
}

export function LotesFilamento({
  lotes,
  filamentos,
}: {
  lotes: LoteFilamento[]
  filamentos: FilamentoOption[]
}) {
  const [isPending, startTransition] = useTransition()
  const [novoLote, setNovoLote] = useState(false)
  const [lotePerda, setLotePerda] = useState<LoteFilamento | null>(null)
  const [mensagem, setMensagem] = useState('')
  const hoje = new Date().toISOString().slice(0, 10)
  const primeiro = filamentos[0]
  const [form, setForm] = useState({
    filamentoId: primeiro?.id ?? 0,
    codigo: '',
    pesoInicialGramas: primeiro?.peso_rolo_gramas ?? 1000,
    precoCompra: primeiro?.preco_rolo ?? 0,
    abertoEm: hoje,
  })
  const [perda, setPerda] = useState({ quantidade: '', motivo: '' })

  function selecionarFilamento(id: number) {
    const item = filamentos.find((filamento) => filamento.id === id)
    setForm((atual) => ({
      ...atual,
      filamentoId: id,
      pesoInicialGramas: item?.peso_rolo_gramas ?? atual.pesoInicialGramas,
      precoCompra: item?.preco_rolo ?? atual.precoCompra,
    }))
  }

  function salvarLote(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await registrarLoteFilamento(form)
      setMensagem(result.message)
      if (result.success) {
        setNovoLote(false)
        setForm((atual) => ({ ...atual, codigo: '' }))
      }
    })
  }

  function salvarPerda(event: React.FormEvent) {
    event.preventDefault()
    if (!lotePerda) return
    startTransition(async () => {
      const result = await registrarPerdaFilamento({
        loteId: lotePerda.id,
        quantidade: Number(perda.quantidade),
        motivo: perda.motivo,
      })
      setMensagem(result.message)
      if (result.success) {
        setLotePerda(null)
        setPerda({ quantidade: '', motivo: '' })
      }
    })
  }

  return (
    <>
      <div className="mb-6 rounded-2xl border border-white/[0.08] bg-[#15171b]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
          <div>
            <h2 className="text-sm font-semibold">Rolos e lotes de filamento</h2>
            <p className="mt-1 text-xs text-white/35">Cada entrada mantém peso, custo e perdas separados.</p>
          </div>
          <button disabled={filamentos.length === 0} onClick={() => setNovoLote(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2 text-xs font-semibold text-[#15180d] disabled:opacity-40">
            <Plus size={14} /> Novo rolo
          </button>
        </div>
        {mensagem && <p className="mx-6 mt-4 rounded-lg bg-white/[0.04] p-3 text-xs text-white/65">{mensagem}</p>}
        <div className="overflow-x-auto p-6">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-left text-[10px] uppercase text-white/25">
              <th className="pb-3">Lote</th><th className="pb-3">Filamento</th><th className="pb-3">Saldo</th>
              <th className="pb-3">Custo</th><th className="pb-3">Abertura</th><th className="pb-3 text-right">Ação</th>
            </tr></thead>
            <tbody className="divide-y divide-white/[0.04]">
              {lotes.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-xs text-white/35">Nenhum rolo registrado.</td></tr>}
              {lotes.map((lote) => <tr key={lote.id}>
                <td className="py-3 font-mono text-xs">{lote.codigo}</td>
                <td className="py-3">{lote.filamento_nome}</td>
                <td className="py-3"><span className={lote.saldo_gramas <= 100 ? 'text-amber-400' : 'text-white/70'}>{lote.saldo_gramas}g</span><span className="text-white/25"> / {lote.peso_inicial_gramas}g</span></td>
                <td className="py-3 text-white/55">{lote.preco_compra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="py-3 text-xs text-white/40">{lote.aberto_em ? lote.aberto_em.split('-').reverse().join('/') : 'Fechado'}</td>
                <td className="py-3 text-right"><button disabled={lote.saldo_gramas <= 0} onClick={() => setLotePerda(lote)} className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 disabled:opacity-30"><AlertTriangle size={12} /> Registrar perda</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {novoLote && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15171b] p-6">
        <div className="mb-5 flex items-center justify-between"><h3 className="font-semibold">Registrar novo rolo</h3><button onClick={() => setNovoLote(false)}><X size={18} /></button></div>
        <form onSubmit={salvarLote} className="space-y-4">
          <label className="block text-xs text-white/55">Filamento<select required value={form.filamentoId} onChange={e => selecionarFilamento(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3">{filamentos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
          <label className="block text-xs text-white/55">Código do lote<input required value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} placeholder="Ex.: PLA-PRETO-2026-01" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs text-white/55">Peso (g)<input required type="number" min="1" step="0.1" value={form.pesoInicialGramas} onChange={e => setForm({...form, pesoInicialGramas: Number(e.target.value)})} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="text-xs text-white/55">Custo (R$)<input required type="number" min="0" step="0.01" value={form.precoCompra} onChange={e => setForm({...form, precoCompra: Number(e.target.value)})} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label></div>
          <label className="block text-xs text-white/55">Data de abertura<input type="date" value={form.abertoEm} onChange={e => setForm({...form, abertoEm: e.target.value})} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setNovoLote(false)} className="px-4 py-2 text-xs text-white/50">Cancelar</button><button disabled={isPending} className="rounded-lg bg-[#d8f45a] px-4 py-2 text-xs font-semibold text-[#15180d]">Registrar entrada</button></div>
        </form>
      </div></div>}

      {lotePerda && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15171b] p-6">
        <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Registrar perda</h3><button onClick={() => setLotePerda(null)}><X size={18} /></button></div>
        <p className="mb-5 text-xs text-white/40">{lotePerda.codigo} · saldo {lotePerda.saldo_gramas}g</p>
        <form onSubmit={salvarPerda} className="space-y-4">
          <label className="block text-xs text-white/55">Quantidade perdida (g)<input required type="number" min="0.1" max={lotePerda.saldo_gramas} step="0.1" value={perda.quantidade} onChange={e => setPerda({...perda, quantidade: e.target.value})} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
          <label className="block text-xs text-white/55">Motivo<textarea required value={perda.motivo} onChange={e => setPerda({...perda, motivo: e.target.value})} placeholder="Ex.: umidade, emenda ou falha de impressão" className="mt-2 min-h-20 w-full rounded-lg border border-white/10 bg-[#101114] p-3" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setLotePerda(null)} className="px-4 py-2 text-xs text-white/50">Cancelar</button><button disabled={isPending} className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-black">Confirmar perda</button></div>
        </form>
      </div></div>}
    </>
  )
}
