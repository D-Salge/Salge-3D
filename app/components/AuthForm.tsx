'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Box, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react'
import { configurarPrimeiroAcesso, entrar } from '@/app/actions/auth'

export function AuthForm({ modo }: { modo: 'login' | 'setup' }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState({ nome: 'Daniel', email: 'daniel@salge3d.com', senha: '', confirmarSenha: '' })

  function enviar(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = modo === 'setup'
        ? await configurarPrimeiroAcesso(form)
        : await entrar({ email: form.email, senha: form.senha })
      setMensagem(result.message)
      if (result.success) { router.push('/'); router.refresh() }
    })
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#0d0e10] px-4 py-10 text-white">
    <div className="w-full max-w-md">
      <div className="mb-7 flex items-center justify-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-[#d8f45a] text-[#16180f]"><Box size={21} /></div><div><p className="text-lg font-semibold">Salge<span className="text-[#d8f45a]">3D</span></p><p className="text-[10px] uppercase tracking-[0.18em] text-white/35">ERP seguro</p></div></div>
      <form onSubmit={enviar} className="rounded-3xl border border-white/[0.09] bg-[#15171b] p-7 shadow-2xl sm:p-8">
        <div className="mb-6 text-center"><div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-[#d8f45a]/10 text-[#d8f45a]">{modo === 'setup' ? <ShieldCheck size={19} /> : <LockKeyhole size={19} />}</div><h1 className="text-xl font-semibold">{modo === 'setup' ? 'Proteger o ERP' : 'Entrar no ERP'}</h1><p className="mt-2 text-xs leading-5 text-white/40">{modo === 'setup' ? 'Crie o primeiro acesso administrativo. Seus dados atuais serão preservados.' : 'Use seu e-mail e senha para continuar.'}</p></div>
        <div className="space-y-4">{modo === 'setup' && <label className="block text-xs text-white/50">Seu nome<input required maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm outline-none focus:border-[#d8f45a]/50" /></label>}<label className="block text-xs text-white/50">E-mail<input required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm outline-none focus:border-[#d8f45a]/50" /></label><label className="block text-xs text-white/50">Senha<input required type="password" minLength={8} maxLength={128} autoComplete={modo === 'setup' ? 'new-password' : 'current-password'} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm outline-none focus:border-[#d8f45a]/50" />{modo === 'setup' && <span className="mt-1 block text-[10px] text-white/25">Mínimo de 8 caracteres, com letra e número.</span>}</label>{modo === 'setup' && <label className="block text-xs text-white/50">Confirmar senha<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={form.confirmarSenha} onChange={(e) => setForm({ ...form, confirmarSenha: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm outline-none focus:border-[#d8f45a]/50" /></label>}</div>
        {mensagem && <p className="mt-4 rounded-lg bg-white/[0.04] p-3 text-center text-xs text-white/60">{mensagem}</p>}
        <button disabled={isPending} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#d8f45a] text-sm font-semibold text-[#15180d] disabled:opacity-50"><LogIn size={16} /> {isPending ? 'Aguarde...' : modo === 'setup' ? 'Criar acesso e entrar' : 'Entrar'}</button>
      </form>
    </div>
  </main>
}
