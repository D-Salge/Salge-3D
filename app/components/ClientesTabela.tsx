'use client'

import { useState, useTransition } from 'react'
import { AtSign, MapPin, Pencil, Phone, Plus, Trash2, Users, X } from 'lucide-react'
import { salvarCliente, deletarCliente, type Cliente } from '@/app/actions/clientes'

const ORIGEM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-500/15 text-pink-400',
  Indicacao: 'bg-purple-500/15 text-purple-400',
  Google: 'bg-blue-500/15 text-blue-400',
  WhatsApp: 'bg-emerald-500/15 text-emerald-400',
  Presencial: 'bg-amber-500/15 text-amber-400',
  Outro: 'bg-white/[0.06] text-white/40',
}

const ORIGENS = ['', 'Instagram', 'Indicacao', 'Google', 'WhatsApp', 'Presencial', 'Outro'] as const

type FormState = {
  id: number | null
  nome: string
  telefone: string
  instagram: string
  cidade: string
  origem: string
}

export function ClientesTabela({ clientes }: { clientes: Cliente[] }) {
  const [isPending, startTransition] = useTransition()
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>({
    id: null, nome: '', telefone: '', instagram: '', cidade: '', origem: ''
  })
  const [errorMsg, setErrorMsg] = useState('')

  function openNew() {
    setForm({ id: null, nome: '', telefone: '', instagram: '', cidade: '', origem: '' })
    setErrorMsg('')
    setModalOpen(true)
  }

  function openEdit(c: Cliente) {
    setForm({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone || '',
      instagram: c.instagram || '',
      cidade: c.cidade || '',
      origem: c.origem || '',
    })
    setErrorMsg('')
    setModalOpen(true)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    startTransition(async () => {
      const res = await salvarCliente(form.id, form.nome, form.telefone, form.instagram, form.cidade, form.origem)
      if (res.success) {
        setModalOpen(false)
      } else {
        setErrorMsg(res.message)
      }
    })
  }

  function handleDelete(id: number) {
    if (!confirm('Deseja realmente excluir este cliente?')) return
    startTransition(async () => {
      const res = await deletarCliente(id)
      if (!res.success) alert(res.message)
    })
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end shrink-0">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-white/65">Clientes</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">
            Clientes
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Gerencie o cadastro de clientes do seu estúdio.
          </p>
        </div>
        
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] transition hover:bg-[#e4ff76] sm:self-auto"
        >
          <Plus size={14} />
          Novo cliente
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5 sm:px-8">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-[#d8f45a]">
            <Users size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Lista de Clientes</h2>
            <p className="mt-0.5 text-xs text-white/35">{clientes.length} cadastrados</p>
          </div>
        </div>

        <div className="overflow-x-auto p-6 sm:p-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['ID', 'Nome', 'Telefone', 'Origem', 'Orçamentos', 'Ações'].map((h) => (
                  <th key={h} className="pb-3.5 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 first:pl-0 last:pr-0 last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-white/30">Nenhum cliente cadastrado.</td>
                </tr>
              )}
              {clientes.map((c) => (
                <tr key={c.id} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 pl-0 pr-3 font-mono text-white/20 text-xs">#{c.id}</td>
                  <td className="py-4 px-3 font-medium text-white/90">{c.nome}</td>
                  <td className="py-4 px-3 text-white/50">{c.telefone || '—'}</td>
                  <td className="py-4 px-3">
                    {c.origem ? (
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium ${ORIGEM_COLORS[c.origem] ?? ORIGEM_COLORS['Outro']}`}>
                        {c.origem}
                      </span>
                    ) : (
                      <span className="text-white/20">—</span>
                    )}
                  </td>
                  <td className="py-4 px-3 text-white/40">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-xs">
                      {c.total_pedidos}
                    </span>
                  </td>
                  <td className="py-4 pl-3 pr-0 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(c)} className="rounded-md p-1.5 text-white/30 hover:bg-white/[0.06] hover:text-white transition">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="rounded-md p-1.5 text-red-400/50 hover:bg-red-500/10 hover:text-red-400 transition">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{form.id ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-white/40 hover:text-white"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-white/55">Nome completo</span>
                <input
                  autoFocus
                  required
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#d8f45a]/60"
                  placeholder="Ex: João da Silva"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-white/55">Telefone</span>
                <div className="relative">
                  <input
                    value={form.telefone}
                    onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 pl-9 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#d8f45a]/60"
                    placeholder="(11) 99999-9999"
                  />
                  <Phone size={14} className="absolute left-3 top-3.5 text-white/30" />
                </div>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-white/55">Instagram</span>
                  <div className="relative">
                    <input
                      value={form.instagram}
                      onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 pl-9 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#d8f45a]/60"
                      placeholder="@usuario"
                    />
                    <AtSign size={14} className="absolute left-3 top-3.5 text-white/30" />
                  </div>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-white/55">Cidade</span>
                  <div className="relative">
                    <input
                      value={form.cidade}
                      onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 pl-9 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#d8f45a]/60"
                      placeholder="São Paulo"
                    />
                    <MapPin size={14} className="absolute left-3 top-3.5 text-white/30" />
                  </div>
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-white/55">Como nos conheceu?</span>
                <select
                  value={form.origem}
                  onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60 appearance-none"
                >
                  {ORIGENS.map(o => (
                    <option key={o} value={o} className="bg-[#101114]">
                      {o === '' ? 'Selecione...' : o}
                    </option>
                  ))}
                </select>
              </label>

              {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

              <div className="mt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs text-white/50 hover:text-white">
                  Cancelar
                </button>
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
