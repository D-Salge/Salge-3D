'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus, Shield, X } from 'lucide-react'
import { salvarUsuario, type UsuarioSistema } from '@/app/actions/usuarios'
import type { PerfilUsuario } from '@/lib/session'

const vazio = { id: null as number | null, nome: '', email: '', perfil: 'operador' as PerfilUsuario, senha: '', ativo: true }

export function UsuariosSistema({ usuarios }: { usuarios: UsuarioSistema[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [modal, setModal] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState(vazio)

  function editar(usuario?: UsuarioSistema) {
    setMensagem('')
    setForm(usuario ? { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, senha: '', ativo: usuario.ativo === 1 } : vazio)
    setModal(true)
  }
  function salvar(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await salvarUsuario(form)
      setMensagem(result.message)
      if (result.success) { setModal(false); router.refresh() }
    })
  }
  return <>
    <div className="mb-6 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-semibold"><Shield size={17} className="text-accent" /> Usuários e permissões</h2><p className="mt-1 text-xs text-muted-foreground">Administrador configura; operador trabalha; visualizador apenas consulta.</p></div><button onClick={() => editar()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-accent-foreground"><Plus size={14} /> Novo usuário</button></div>
    {mensagem && <p className="mb-4 rounded-lg bg-subtle p-3 text-xs text-secondary-foreground">{mensagem}</p>}
    <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="p-4">Usuário</th><th className="p-4">Perfil</th><th className="p-4">Status</th><th className="p-4">Último acesso</th><th className="p-4 text-right">Ação</th></tr></thead><tbody className="divide-y divide-border">{usuarios.map((usuario) => <tr key={usuario.id}><td className="p-4"><p className="font-medium">{usuario.nome}</p><p className="mt-1 text-xs text-muted-foreground">{usuario.email}</p></td><td className="p-4"><span className="rounded bg-subtle px-2 py-1 text-xs text-secondary-foreground">{usuario.perfil}</span></td><td className={`p-4 text-xs ${usuario.ativo ? 'text-success' : 'text-destructive'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</td><td className="p-4 text-xs text-muted-foreground">{usuario.ultimo_acesso_em ? new Date(usuario.ultimo_acesso_em).toLocaleString('pt-BR') : 'Nunca entrou'}</td><td className="p-4 text-right"><button onClick={() => editar(usuario)} className="rounded-lg bg-subtle p-2 text-muted-foreground"><Pencil size={14} /></button></td></tr>)}</tbody></table></div>
    {modal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"><form onSubmit={salvar} className="w-full max-w-lg rounded-2xl border border-border bg-card p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">{form.id ? 'Editar usuário' : 'Novo usuário'}</h2><p className="mt-1 text-xs text-muted-foreground">{form.id ? 'Senha vazia mantém a senha atual.' : 'Informe uma senha temporária segura.'}</p></div><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div><div className="space-y-4"><label className="block text-xs text-muted-foreground">Nome<input required maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3" /></label><label className="block text-xs text-muted-foreground">E-mail<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3" /></label><label className="block text-xs text-muted-foreground">Perfil<select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as PerfilUsuario })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3"><option value="admin">Administrador</option><option value="operador">Operador</option><option value="visualizador">Visualizador</option></select></label><label className="block text-xs text-muted-foreground">{form.id ? 'Nova senha (opcional)' : 'Senha temporária'}<input required={!form.id} type="password" minLength={8} maxLength={128} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3" /></label><label className="flex items-center gap-3 rounded-lg bg-subtle p-3 text-xs text-secondary-foreground"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="accent-[#d8f45a]" /> Usuário ativo</label></div><button disabled={isPending} className="mt-5 w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-50">{isPending ? 'Salvando...' : 'Salvar usuário'}</button></form></div>}
  </>
}
