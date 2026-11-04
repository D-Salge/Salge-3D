'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Box, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react'
import { configurarPrimeiroAcesso, entrar } from '@/app/actions/auth'

export function AuthForm({ modo }: { modo: 'login' | 'setup' }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirmarSenha: '' })

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

  return <main className="flex min-h-screen items-center justify-center bg-card px-4 py-10 text-foreground">
    <div className="w-full max-w-md">
      <div className="mb-7 flex items-center justify-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Box size={21} /></div><div><p className="text-lg font-semibold">Salge<span className="text-accent">3D</span></p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">ERP seguro</p></div></div>
      <form onSubmit={enviar} className="rounded-3xl border border-border bg-card p-7 shadow-2xl sm:p-8">
        <div className="mb-6 text-center"><div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-accent/10 text-accent">{modo === 'setup' ? <ShieldCheck size={19} /> : <LockKeyhole size={19} />}</div><h1 className="text-xl font-semibold">{modo === 'setup' ? 'Proteger o ERP' : 'Entrar no ERP'}</h1><p className="mt-2 text-xs leading-5 text-muted-foreground">{modo === 'setup' ? 'Crie o primeiro acesso administrativo. Seus dados atuais serão preservados.' : 'Use seu e-mail e senha para continuar.'}</p></div>
        <div className="space-y-4">{modo === 'setup' && <label className="block text-xs text-muted-foreground">Seu nome<input required maxLength={120} placeholder="Seu nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent/50" /></label>}<label className="block text-xs text-muted-foreground">E-mail<input required type="email" autoComplete="email" placeholder="seu@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent/50" /></label><label className="block text-xs text-muted-foreground">Senha<input required type="password" minLength={8} maxLength={128} autoComplete={modo === 'setup' ? 'new-password' : 'current-password'} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent/50" />{modo === 'setup' && <span className="mt-1 block text-[10px] text-muted-foreground">Mínimo de 8 caracteres, com letra e número.</span>}</label>{modo === 'setup' && <label className="block text-xs text-muted-foreground">Confirmar senha<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={form.confirmarSenha} onChange={(e) => setForm({ ...form, confirmarSenha: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent/50" /></label>}</div>
        {mensagem && <p className="mt-4 rounded-lg bg-subtle p-3 text-center text-xs text-secondary-foreground">{mensagem}</p>}
        <button disabled={isPending} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"><LogIn size={16} /> {isPending ? 'Aguarde...' : modo === 'setup' ? 'Criar acesso e entrar' : 'Entrar'}</button>
      </form>
    </div>
  </main>
}
