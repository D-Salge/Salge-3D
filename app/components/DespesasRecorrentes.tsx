'use client'

import { useState, useTransition } from 'react'
import { CalendarClock, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  arquivarDespesaRecorrente,
  salvarDespesaRecorrente,
  type DespesaRecorrente,
  type DespesaRecorrenteInput,
} from '@/app/actions/despesas'

const categorias = ['Filamentos', 'Insumos', 'Equipamento', 'Energia', 'Marketing', 'Software', 'Manutencao', 'Embalagens', 'Frete', 'Outros']
const formas = ['Cartão de Crédito', 'Pix', 'Dinheiro', 'Cartão de Débito', 'Transferência', 'Boleto', 'Outro']

function hojeLocal() {
  const agora = new Date()
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function vazio(): DespesaRecorrenteInput {
  return { categoria: 'Software', descricao: '', valor: 0, dia_vencimento: 10, forma_pagamento: 'Cartão de Crédito', paga_automaticamente: false, inicia_em: hojeLocal(), termina_em: null }
}

export function DespesasRecorrentes({ itens }: { itens: DespesaRecorrente[] }) {
  const [isPending, startTransition] = useTransition()
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)
  const [form, setForm] = useState<DespesaRecorrenteInput>(vazio)
  const [erro, setErro] = useState('')

  function abrir(item?: DespesaRecorrente) {
    setErro('')
    setEditando(item?.id ?? null)
    setForm(item ? {
      categoria: item.categoria, descricao: item.descricao, valor: item.valor,
      dia_vencimento: item.dia_vencimento, forma_pagamento: item.forma_pagamento,
      paga_automaticamente: item.paga_automaticamente === 1,
      inicia_em: item.inicia_em.slice(0, 10), termina_em: item.termina_em?.slice(0, 10) ?? null,
    } : vazio())
    setModal(true)
  }

  function salvar(event: React.FormEvent) {
    event.preventDefault()
    setErro('')
    startTransition(async () => {
      const result = await salvarDespesaRecorrente(editando, { ...form, valor: Number(form.valor), dia_vencimento: Number(form.dia_vencimento) })
      if (result.success) setModal(false)
      else setErro(result.message)
    })
  }

  function arquivar(item: DespesaRecorrente) {
    if (!confirm(`Encerrar a recorrência “${item.descricao}”? As despesas já geradas serão mantidas.`)) return
    startTransition(async () => {
      const result = await arquivarDespesaRecorrente(item.id)
      if (!result.success) alert(result.message)
    })
  }

  return (
    <>
      <section className="mb-6 rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-5">
          <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><CalendarClock size={18} /></div><div><h2 className="text-sm font-semibold">Despesas recorrentes</h2><p className="mt-0.5 text-xs text-white/35">Contas mensais geradas automaticamente, sem duplicidade</p></div></div>
          <button onClick={() => abrir()} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.1]"><Plus size={13} /> Nova recorrência</button>
        </div>
        {itens.length === 0 ? <p className="px-6 py-7 text-sm text-white/35">Nenhuma despesa recorrente cadastrada.</p> : <div className="divide-y divide-white/[0.05]">{itens.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4"><div><p className="text-sm font-medium text-white/75">{item.descricao}</p><p className="mt-1 text-[10px] text-white/30">{item.categoria} · vence todo dia {item.dia_vencimento} · {item.forma_pagamento}{item.paga_automaticamente ? ' · baixa automática' : ''}</p></div><div className="flex items-center gap-3"><span className="font-mono text-sm text-red-300">{item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês</span><button aria-label="Editar recorrência" onClick={() => abrir(item)} className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><Pencil size={14} /></button><button aria-label="Encerrar recorrência" disabled={isPending} onClick={() => arquivar(item)} className="rounded-lg p-2 text-red-400/50 hover:bg-red-500/10"><Trash2 size={14} /></button></div></div>)}</div>}
      </section>

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"><form onSubmit={salvar} className="my-6 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="mb-6 flex items-center justify-between"><div><h3 className="font-semibold">{editando ? 'Editar recorrência' : 'Nova despesa recorrente'}</h3><p className="mt-1 text-xs text-white/35">As alterações valem para novos lançamentos.</p></div><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div><div className="space-y-4">
        <label className="block text-xs text-white/55">Descrição<input required maxLength={160} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Internet da oficina" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
        <div className="grid grid-cols-2 gap-4"><label className="text-xs text-white/55">Valor mensal<input required type="number" min="0.01" step="0.01" value={form.valor || ''} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/55">Dia do vencimento<input required type="number" min="1" max="31" value={form.dia_vencimento} onChange={(e) => setForm({ ...form, dia_vencimento: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label></div>
        <div className="grid grid-cols-2 gap-4"><label className="text-xs text-white/55">Categoria<select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{categorias.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-xs text-white/55">Forma de pagamento<select value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{formas.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <div className="grid grid-cols-2 gap-4"><label className="text-xs text-white/55">Início<input required type="date" value={form.inicia_em} onChange={(e) => setForm({ ...form, inicia_em: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/55">Término opcional<input type="date" value={form.termina_em ?? ''} onChange={(e) => setForm({ ...form, termina_em: e.target.value || null })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label></div>
        <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/55"><input type="checkbox" checked={form.paga_automaticamente} onChange={(e) => setForm({ ...form, paga_automaticamente: e.target.checked })} className="mt-0.5 accent-[#d8f45a]" /><span>Considerar paga automaticamente no vencimento. Use apenas para débito automático ou cobrança automática no cartão.</span></label>
        {erro && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{erro}</p>}
        <button disabled={isPending} className="w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50">{isPending ? 'Salvando...' : 'Salvar recorrência'}</button>
      </div></form></div>}
    </>
  )
}
