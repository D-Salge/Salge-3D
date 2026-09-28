'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Download, ShieldAlert } from 'lucide-react'
import { anonimizarCliente } from '@/app/actions/clientes'

export function PrivacidadeCliente({ clienteId, saldoPendente }: { clienteId: number; saldoPendente: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  function anonimizar() {
    if (!confirm('Remover definitivamente nome, telefone, e-mail, Instagram, cidade e observações deste cliente? O histórico financeiro será mantido de forma anônima.')) return
    startTransition(async () => {
      const result = await anonimizarCliente(clienteId)
      setMensagem(result.message)
      if (result.success) { router.push('/clientes'); router.refresh() }
    })
  }
  return <section className="rounded-2xl border border-red-400/10 bg-red-500/[0.025] p-5 sm:p-6"><h2 className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} className="text-red-300" /> Privacidade dos dados</h2><p className="mt-2 text-xs leading-5 text-white/35">Exporte os dados do cliente ou remova seus dados pessoais, preservando valores e documentos da operação.</p><div className="mt-4 flex flex-wrap gap-2"><a href={`/api/clientes/${clienteId}/dados`} className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-white/65"><Download size={13} /> Exportar dados</a><button disabled={isPending || saldoPendente > 0.009} onClick={anonimizar} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 disabled:cursor-not-allowed disabled:opacity-35">Anonimizar cliente</button></div>{saldoPendente > 0.009 && <p className="mt-3 text-[10px] text-amber-300/70">A anonimização será liberada após quitar o saldo pendente.</p>}{mensagem && <p className="mt-3 text-xs text-white/55">{mensagem}</p>}</section>
}
