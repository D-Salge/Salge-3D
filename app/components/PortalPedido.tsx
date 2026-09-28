'use client'

import { useState, useTransition } from 'react'
import { Check, Link2 } from 'lucide-react'
import { gerarLinkPortal } from '@/app/actions/portal'

export function PortalPedido({ pedidoId }: { pedidoId: number }) {
  const [isPending, startTransition] = useTransition()
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')

  function copiar() {
    startTransition(async () => {
      setErro('')
      const result = await gerarLinkPortal(pedidoId)
      if (!result.success || !result.caminho) { setErro(result.message); return }
      await navigator.clipboard.writeText(`${window.location.origin}${result.caminho}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    })
  }

  return <div className="relative">
    <button type="button" onClick={copiar} disabled={isPending} className="flex items-center gap-2 rounded-lg bg-cyan-500/10 px-4 py-2.5 text-xs font-medium text-cyan-300 disabled:opacity-50">
      {copiado ? <Check size={14} /> : <Link2 size={14} />}{copiado ? 'Link copiado' : isPending ? 'Gerando...' : 'Portal do cliente'}
    </button>
    {erro && <p className="absolute right-0 top-full z-10 mt-2 w-64 rounded-lg bg-red-950 p-2 text-[10px] text-red-200">{erro}</p>}
  </div>
}
