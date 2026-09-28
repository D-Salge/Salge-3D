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
    <div className="mb-6 flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-semibold"><Shield size={17} className="text-[#d8f45a]" /> Usuários e permissões</h2><p className="mt-1 text-xs text-white/35">Administrador configura; operador trabalha; visualizador apenas consulta.</p></div><button onClick={() => editar()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d]"><Plus size={14} /> Novo usuário</button></div>
    {mensagem && <p className="mb-4 rounded-lg bg-white/[0.04] p-3 text-xs text-white/60">{mensagem}</p>}
    <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#15171b]"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-white/[0.07] text-left text-[10px] uppercase tracking-wider text-white/25"><th className="p-4">Usuário</th><th className="p-4">Perfil</th><th className="p-4">Status</th><th className="p-4">Último acesso</th><th className="p-4 text-right">Ação</th></tr></thead><tbody className="divide-y divide-white/[0.04]">{usuarios.map((usuario) => <tr key={usuario.id}><td className="p-4"><p className="font-medium">{usuario.nome}</p><p className="mt-1 text-xs text-white/35">{usuario.email}</p></td><td className="p-4"><span className="rounded bg-white/[0.05] px-2 py-1 text-xs text-white/60">{usuario.perfil}</span></td><td className={`p-4 text-xs ${usuario.ativo ? 'text-emerald-300' : 'text-red-300'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</td><td className="p-4 text-xs text-white/35">{usuario.ultimo_acesso_em ? new Date(usuario.ultimo_acesso_em).toLocaleString('pt-BR') : 'Nunca entrou'}</td><td className="p-4 text-right"><button onClick={() => editar(usuario)} className="rounded-lg bg-white/[0.05] p-2 text-white/50"><Pencil size={14} /></button></td></tr>)}</tbody></table></div>
    {modal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"><form onSubmit={salvar} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">{form.id ? 'Editar usuário' : 'Novo usuário'}</h2><p className="mt-1 text-xs text-white/35">{form.id ? 'Senha vazia mantém a senha atual.' : 'Informe uma senha temporária segura.'}</p></div><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div><div className="space-y-4"><label className="block text-xs text-white/50">Nome<input required maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="block text-xs text-white/50">E-mail<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="block text-xs text-white/50">Perfil<select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as PerfilUsuario })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3"><option value="admin">Administrador</option><option value="operador">Operador</option><option value="visualizador">Visualizador</option></select></label><label className="block text-xs text-white/50">{form.id ? 'Nova senha (opcional)' : 'Senha temporária'}<input required={!form.id} type="password" minLength={8} maxLength={128} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 text-xs text-white/55"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="accent-[#d8f45a]" /> Usuário ativo</label></div><button disabled={isPending} className="mt-5 w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50">{isPending ? 'Salvando...' : 'Salvar usuário'}</button></form></div>}
  </>
}
