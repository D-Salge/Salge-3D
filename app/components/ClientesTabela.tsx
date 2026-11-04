'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AtSign, Eye, Mail, MapPin, Pencil, Phone, Plus, Trash2, Users, X } from 'lucide-react'
import { salvarCliente, deletarCliente, type Cliente } from '@/app/actions/clientes'

const ORIGEM_COLORS: Record<string, string> = {
  Instagram: 'bg-pink-500/15 text-pink-400',
  Indicacao: 'bg-purple-500/15 text-accent',
  Google: 'bg-blue-500/15 text-info',
  WhatsApp: 'bg-emerald-500/15 text-success',
  Presencial: 'bg-amber-500/15 text-warning',
  Outro: 'bg-subtle text-muted-foreground',
}

const ORIGENS = ['', 'Instagram', 'Indicacao', 'Google', 'WhatsApp', 'Presencial', 'Outro'] as const

type FormState = {
  id: number | null
  nome: string
  telefone: string
  email: string
  instagram: string
  cidade: string
  origem: string
  tipoCliente: string
  observacoes: string
}

export function ClientesTabela({ clientes }: { clientes: Cliente[] }) {
  const [isPending, startTransition] = useTransition()
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>({
    id: null, nome: '', telefone: '', email: '', instagram: '', cidade: '', origem: '', tipoCliente: '', observacoes: ''
  })
  const [errorMsg, setErrorMsg] = useState('')

  function openNew() {
    setForm({ id: null, nome: '', telefone: '', email: '', instagram: '', cidade: '', origem: '', tipoCliente: '', observacoes: '' })
    setErrorMsg('')
    setModalOpen(true)
  }

  function openEdit(c: Cliente) {
    setForm({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone || '',
      email: c.email || '',
      instagram: c.instagram || '',
      cidade: c.cidade || '',
      origem: c.origem || '',
      tipoCliente: c.tipo_cliente || '',
      observacoes: c.observacoes || '',
    })
    setErrorMsg('')
    setModalOpen(true)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    startTransition(async () => {
      const res = await salvarCliente(form)
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

  const fmtBRL = (valor: number | undefined) => (valor ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end shrink-0">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-secondary-foreground">Clientes</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">
            Clientes
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gerencie o cadastro de clientes do seu estúdio.
          </p>
        </div>
        
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 self-start rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover sm:self-auto"
        >
          <Plus size={14} />
          Novo cliente
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-black/10">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5 sm:px-8">
          <div className="flex size-9 items-center justify-center rounded-lg bg-subtle text-accent">
            <Users size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Lista de Clientes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{clientes.length} cadastrados</p>
          </div>
        </div>

        <div className="erp-table-scroll p-6 sm:p-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['ID', 'Nome', 'Telefone', 'Origem', 'Vendido', 'A receber', 'Pedidos', 'Ações'].map((h) => (
                  <th key={h} className="pb-3.5 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground first:pl-0 last:pr-0 last:text-right">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">Nenhum cliente cadastrado.</td>
                </tr>
              )}
              {clientes.map((c) => (
                <tr key={c.id} className="group hover:bg-subtle transition-colors">
                  <td className="py-4 pl-0 pr-3 font-mono text-muted-foreground text-xs">#{c.id}</td>
                  <td className="py-4 px-3 font-medium text-foreground">{c.nome}</td>
                  <td className="py-4 px-3 text-muted-foreground">{c.telefone || '—'}</td>
                  <td className="py-4 px-3">
                    {c.origem ? (
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium ${ORIGEM_COLORS[c.origem] ?? ORIGEM_COLORS['Outro']}`}>
                        {c.origem}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-4 px-3 font-mono text-xs text-accent">{fmtBRL(c.total_vendido)}</td>
                  <td className={`whitespace-nowrap py-4 px-3 font-mono text-xs ${(c.saldo_pendente ?? 0) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{fmtBRL(c.saldo_pendente)}</td>
                  <td className="py-4 px-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-subtle px-2 py-1 text-xs">
                      {c.total_pedidos}
                    </span>
                  </td>
                  <td className="py-4 pl-3 pr-0 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/clientes/${c.id}`} title="Abrir ficha do cliente" className="rounded-md p-1.5 text-accent/70 transition hover:bg-accent/10 hover:text-accent">
                        <Eye size={15} />
                      </Link>
                      <button onClick={() => openEdit(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-subtle hover:text-foreground transition">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="rounded-md p-1.5 text-destructive hover:bg-red-500/10 hover:text-destructive transition">
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
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{form.id ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-secondary-foreground">Nome completo</span>
                <input
                  autoFocus
                  required
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                  placeholder="Ex: João da Silva"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-secondary-foreground">Telefone</span>
                <div className="relative">
                  <input
                    value={form.telefone}
                    onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                    placeholder="(11) 99999-9999"
                  />
                  <Phone size={14} className="absolute left-3 top-3.5 text-muted-foreground" />
                </div>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-secondary-foreground">E-mail</span>
                <div className="relative">
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                    placeholder="cliente@email.com"
                  />
                  <Mail size={14} className="absolute left-3 top-3.5 text-muted-foreground" />
                </div>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">Instagram</span>
                  <div className="relative">
                    <input
                      value={form.instagram}
                      onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-border bg-background px-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                      placeholder="@usuario"
                    />
                    <AtSign size={14} className="absolute left-3 top-3.5 text-muted-foreground" />
                  </div>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">Cidade</span>
                  <div className="relative">
                    <input
                      value={form.cidade}
                      onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-border bg-background px-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                      placeholder="São Paulo"
                    />
                    <MapPin size={14} className="absolute left-3 top-3.5 text-muted-foreground" />
                  </div>
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-secondary-foreground">Como nos conheceu?</span>
                <select
                  value={form.origem}
                  onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/60 appearance-none"
                >
                  {ORIGENS.map(o => (
                    <option key={o} value={o} className="bg-background">
                      {o === '' ? 'Selecione...' : o}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-secondary-foreground">Tipo de cliente</span>
                <select
                  value={form.tipoCliente}
                  onChange={e => setForm(f => ({ ...f, tipoCliente: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/60"
                >
                  <option value="">Não informado</option>
                  <option value="Pessoa fisica">Pessoa física</option>
                  <option value="Empresa">Empresa</option>
                  <option value="Revenda">Revenda</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-secondary-foreground">Observações</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                  placeholder="Preferências, endereço, condições combinadas..."
                />
              </label>

              {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}

              <div className="mt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground">
                  Cancelar
                </button>
                <button type="submit" disabled={isPending} className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50">
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
