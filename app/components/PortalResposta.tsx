'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { responderOrcamentoPortal } from '@/app/actions/portal'

export function PortalResposta({ token, status, respondido }: { token: string; status: string; respondido: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')

  function responder(resposta: 'Aprovado' | 'Recusado') {
    if (resposta === 'Recusado' && !confirm('Confirma que deseja recusar este orçamento?')) return
    startTransition(async () => {
      const result = await responderOrcamentoPortal(token, resposta)
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  if (respondido || !['Rascunho', 'Enviado'].includes(status)) return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm text-white/60">Resposta registrada: <b className="text-white">{status}</b></div>
  return <div>
    <p className="mb-3 text-center text-xs text-white/40">Revise os dados acima e registre sua decisão.</p>
    <div className="grid grid-cols-2 gap-3"><button disabled={isPending} onClick={() => responder('Recusado')} className="flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/[0.06] py-3 text-sm text-red-300 disabled:opacity-50"><XCircle size={17} /> Recusar</button><button disabled={isPending} onClick={() => responder('Aprovado')} className="flex items-center justify-center gap-2 rounded-xl bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50"><CheckCircle2 size={17} /> Aprovar</button></div>
    {mensagem && <p className="mt-3 text-center text-xs text-white/55">{mensagem}</p>}
  </div>
}
