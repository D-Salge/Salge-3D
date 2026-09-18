'use client'

import { useState, useTransition } from 'react'
import { Plus, Printer, Pencil, Trash2, X } from 'lucide-react'
import { arquivarImpressora, salvarImpressora, type Impressora } from '@/app/actions/operacao'

const statusOptions: Impressora['status'][] = ['Disponivel', 'Em uso', 'Manutencao', 'Inativa']

export function ImpressorasPage({ impressoras }: { impressoras: Impressora[] }) {
  const [isPending, startTransition] = useTransition()
  const [modal, setModal] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState<Impressora>({
    id: 0, nome: '', modelo: '', potencia_w: 0, custo_hora: 0, status: 'Disponivel',
  })

  function abrir(impressora?: Impressora) {
    setErro('')
    setForm(impressora ? { ...impressora } : {
      id: 0, nome: '', modelo: '', potencia_w: 0, custo_hora: 0, status: 'Disponivel',
    })
    setModal(true)
  }

  function salvar(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await salvarImpressora(form.id || null, {
        nome: form.nome, modelo: form.modelo, potencia_w: Number(form.potencia_w),
        custo_hora: Number(form.custo_hora), status: form.status,
      })
      if (result.success) setModal(false)
      else setErro(result.message)
    })
  }

  function arquivar(id: number) {
    if (!confirm('Arquivar esta impressora?')) return
    startTransition(async () => {
      const result = await arquivarImpressora(id)
      if (!result.success) alert(result.message)
    })
  }

  return (
    <>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div><p className="mb-3 text-xs text-white/35">Produção / Equipamentos</p><h1 className="text-3xl font-semibold">Impressoras</h1><p className="mt-2 text-sm text-white/40">Capacidade, custos e fila por máquina.</p></div>
        <button onClick={() => abrir()} className="flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d]"><Plus size={14} /> Nova impressora</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {impressoras.map((impressora) => (
          <div key={impressora.id} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
            <div className="flex items-start justify-between">
              <div className="flex gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-[#d8f45a]/10 text-[#d8f45a]"><Printer size={19} /></div><div><h2 className="font-semibold">{impressora.nome}</h2><p className="text-xs text-white/40">{impressora.modelo || 'Modelo não informado'}</p></div></div>
              <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/55">{impressora.status}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Fila ativa</p><p className="mt-1 text-xl font-semibold">{impressora.pedidos_ativos ?? 0}</p></div>
              <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Horas planejadas</p><p className="mt-1 text-xl font-semibold">{impressora.horas_planejadas ?? 0}h</p></div>
              <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Potência</p><p className="mt-1 font-mono">{impressora.potencia_w} W</p></div>
              <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Custo/hora</p><p className="mt-1 font-mono">R$ {impressora.custo_hora.toFixed(2).replace('.', ',')}</p></div>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button onClick={() => abrir(impressora)} className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06] hover:text-white"><Pencil size={15} /></button><button onClick={() => arquivar(impressora.id)} className="rounded-lg p-2 text-red-400/60 hover:bg-red-500/10"><Trash2 size={15} /></button></div>
          </div>
        ))}
      </div>

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={salvar} className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="mb-6 flex items-center justify-between"><h2 className="font-semibold">{form.id ? 'Editar impressora' : 'Nova impressora'}</h2><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div><div className="space-y-4">
        <label className="block text-xs text-white/55">Nome<input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
        <label className="block text-xs text-white/55">Modelo<input value={form.modelo ?? ''} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
        <div className="grid grid-cols-2 gap-4"><label className="text-xs text-white/55">Potência (W)<input type="number" min="0" value={form.potencia_w} onChange={(e) => setForm({ ...form, potencia_w: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/55">Custo/hora<input type="number" step="0.01" min="0" value={form.custo_hora} onChange={(e) => setForm({ ...form, custo_hora: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label></div>
        <label className="block text-xs text-white/55">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Impressora['status'] })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <button disabled={isPending} className="w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50">{isPending ? 'Salvando...' : 'Salvar'}</button>
      </div></form></div>}
    </>
  )
}
