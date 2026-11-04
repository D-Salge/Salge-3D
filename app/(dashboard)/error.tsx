'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard-error]', error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full rounded-2xl border border-red-500/20 bg-card p-6 text-center shadow-2xl sm:p-9">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-red-500/10 text-destructive"><AlertTriangle size={22} /></div>
        <h1 className="mt-5 text-xl font-semibold">Não foi possível carregar esta área</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Se foi uma falha momentânea, tente novamente. Seus dados já gravados não foram apagados.</p>
        {error.digest && <p className="mt-3 font-mono text-[10px] text-muted-foreground">Código: {error.digest}</p>}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"><RefreshCw size={14} /> Tentar novamente</button>
          <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-lg bg-subtle px-4 py-2.5 text-xs text-secondary-foreground hover:bg-subtle"><Home size={14} /> Voltar ao início</Link>
        </div>
      </div>
    </div>
  )
}

