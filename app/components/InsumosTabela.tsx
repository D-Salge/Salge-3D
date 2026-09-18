'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, Package, X, AlertTriangle } from 'lucide-react'
import { salvarInsumo, deletarInsumo, type Insumo } from '@/app/actions/insumos'

const UNIDADES = ['unid', 'g', 'ml', 'cm', 'm']

export function InsumosTabela({ insumos }: { insumos: Insumo[] }) {
  const [isPending, startTransition] = useTransition()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<Insumo>({
    id: 0, nome: '', unidade: 'unid', custo_unitario: 0, estoque_atual: 0, estoque_minimo: 0
  })
  const [errorMsg, setErrorMsg] = useState('')

  function openNew() {
    setForm({ id: 0, nome: '', unidade: 'unid', custo_unitario: 0, estoque_atual: 0, estoque_minimo: 0 })
    setErrorMsg('')
    setModalOpen(true)
  }

  function openEdit(i: Insumo) { setForm({ ...i }); setErrorMsg(''); setModalOpen(true) }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    startTransition(async () => {
      const res = await salvarInsumo(form.id || null, {
        nome: form.nome, unidade: form.unidade,
        custo_unitario: Number(form.custo_unitario),
        estoque_atual: Number(form.estoque_atual),
        estoque_minimo: Number(form.estoque_minimo),
      })
      if (res.success) setModalOpen(false)
      else setErrorMsg(res.message)
    })
  }

  function handleDelete(id: number) {
    if (!confirm('Deseja realmente excluir este insumo?')) return
    startTransition(async () => {
      const res = await deletarInsumo(id)
      if (!res.success) alert(res.message)
    })
  }

  const fmtBRL = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')

  function estoqueBar(atual: number, minimo: number) {
    if (minimo === 0) return { color: 'bg-emerald-400', pct: 100, alert: false }
    const pct = Math.min((atual / (minimo * 3)) * 100, 100)
    if (atual <= minimo) return { color: 'bg-red-500', pct: Math.max(pct, 3), alert: true }
    if (atual <= minimo * 2) return { color: 'bg-amber-400', pct, alert: false }
    return { color: 'bg-emerald-400', pct, alert: false }
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
            <span>Estoque</span><span>/</span><span className="text-white/65">Insumos</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">Insumos</h1>
          <p className="mt-2 text-sm text-white/40">Materiais extras: suporte, cola, lixa, embalagem, etc.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 self-start rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] transition hover:bg-[#e4ff76] sm:self-auto">
          <Plus size={14} /> Novo insumo
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5 sm:px-8">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-[#d8f45a]"><Package size={18} /></div>
          <div>
            <h2 className="text-sm font-semibold">Inventario de Insumos</h2>
            <p className="mt-0.5 text-xs text-white/35">{insumos.length} cadastrados</p>
          </div>
        </div>
        <div className="overflow-x-auto p-6 sm:p-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['#', 'Nome', 'Unidade', 'Custo Unit.', 'Estoque', 'Minimo', ''].map((h, i) => (
                  <th key={i} className="pb-3.5 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 first:pl-0 last:pr-0 last:text-right">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {insumos.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-xs text-white/30">Nenhum insumo cadastrado. Clique em Novo insumo para comecar.</td></tr>
              )}
              {insumos.map((ins) => {
                const bar = estoqueBar(ins.estoque_atual, ins.estoque_minimo)
                return (
                  <tr key={ins.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 pl-0 pr-3 font-mono text-white/20 text-xs">#{ins.id}</td>
                    <td className="py-4 px-3 font-medium text-white/90">{ins.nome}</td>
                    <td className="py-4 px-3">
                      <span className="rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50 uppercase">{ins.unidade}</span>
                    </td>
                    <td className="py-4 px-3 font-mono text-[#d8f45a]">{fmtBRL(ins.custo_unitario)}</td>
                    <td className="py-4 px-3">
                      <div className="flex flex-col gap-1.5 w-28">
                        <span className="flex items-center gap-1 text-xs font-medium text-white/70">
                          {bar.alert && <AlertTriangle size={11} className="text-red-400" />}
                          {ins.estoque_atual}
                        </span>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                          <div className={"h-full rounded-full " + bar.color} style={{ width: bar.pct + '%' }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-white/40 text-xs">{ins.estoque_minimo}</td>
                    <td className="py-4 pl-3 pr-0 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(ins)} className="rounded-md p-1.5 text-white/30 hover:bg-white/[0.06] hover:text-white transition"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(ins.id)} className="rounded-md p-1.5 text-red-400/50 hover:bg-red-500/10 hover:text-red-400 transition"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{form.id ? 'Editar Insumo' : 'Novo Insumo'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-white/55">Nome</span>
                <input autoFocus required value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60"
                  placeholder="Ex: Suporte de impressao, Lixa 400" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-white/55">Unidade</span>
                  <select value={form.unidade} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60">
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-white/55">Custo Unit. (R$)</span>
                  <input required type="number" step="0.01" min="0" value={form.custo_unitario}
                    onChange={e => setForm(f => ({ ...f, custo_unitario: Number(e.target.value) }))}
                    className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60" />
                </label>
              </div>
              <div className="h-px w-full bg-white/[0.08]" />
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-[#d8f45a]">Estoque Atual</span>
                  <input required type="number" step="0.1" min="0" value={form.estoque_atual}
                    onChange={e => setForm(f => ({ ...f, estoque_atual: Number(e.target.value) }))}
                    className="h-11 w-full rounded-lg border border-[#d8f45a]/30 bg-[#d8f45a]/[0.04] px-3 text-sm text-white outline-none focus:border-[#d8f45a]" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-white/55">Estoque Minimo</span>
                  <input required type="number" step="0.1" min="0" value={form.estoque_minimo}
                    onChange={e => setForm(f => ({ ...f, estoque_minimo: Number(e.target.value) }))}
                    className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60" />
                </label>
              </div>
              {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
              <div className="mt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs text-white/50 hover:text-white">Cancelar</button>
                <button type="submit" disabled={isPending} className="rounded-lg bg-[#d8f45a] px-5 py-2 text-xs font-semibold text-[#15180d] hover:bg-[#e4ff76] disabled:opacity-50">
                  {isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
