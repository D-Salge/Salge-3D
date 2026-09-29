'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, CreditCard, ExternalLink, RefreshCw } from 'lucide-react'
import {
  gerarCobrancaMercadoPago,
  sincronizarCobrancaMercadoPago,
} from '@/app/actions/mercado-pago'

type Cobranca = {
  valor: number
  status: string
  init_point: string
  pagamento_id: string | null
  forma_pagamento: string | null
  pago_em: string | null
  criado_em: string
} | null

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MercadoPagoCobranca({
  pedidoId,
  saldo,
  cobranca,
  modoTeste,
}: {
  pedidoId: number
  saldo: number
  cobranca: Cobranca
  modoTeste: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [mensagem, setMensagem] = useState('')
  const [url, setUrl] = useState(cobranca?.status === 'Pendente' ? cobranca.init_point : '')
  const [copiado, setCopiado] = useState(false)
  const [operacao, setOperacao] = useState<'gerar' | 'sincronizar' | null>(null)

  function gerar() {
    startTransition(async () => {
      setOperacao('gerar')
      try {
        const resultado = await gerarCobrancaMercadoPago(pedidoId)
        setMensagem(resultado.message)
        if (resultado.url) {
          setUrl(resultado.url)
          router.refresh()
        }
      } finally {
        setOperacao(null)
      }
    })
  }
  async function copiar() {
    await navigator.clipboard.writeText(url)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 1500)
  }
  function sincronizar() {
    startTransition(async () => {
      setOperacao('sincronizar')
      try {
        const resultado = await sincronizarCobrancaMercadoPago(pedidoId)
        setMensagem(resultado.message)
        if (resultado.success) router.refresh()
      } finally {
        setOperacao(null)
      }
    })
  }

  if (saldo < 0.01 && cobranca?.status !== 'Aprovado') return null
  return <div className="mt-5 rounded-xl border border-blue-400/15 bg-blue-500/[0.04] p-4">
    <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-xs font-semibold text-blue-200"><CreditCard size={14} /> Mercado Pago</h3><p className="mt-1 text-[11px] text-white/40">{cobranca ? `Última cobrança: ${cobranca.status} · ${moeda(cobranca.valor)}` : 'Gere um link para o saldo atual.'}</p>{cobranca?.pagamento_id && <p className="mt-1 text-[10px] text-white/25">Pagamento {cobranca.pagamento_id}{cobranca.forma_pagamento ? ` · ${cobranca.forma_pagamento}` : ''}</p>}</div>{cobranca && <span className={`rounded px-2 py-1 text-[10px] ${cobranca.status === 'Aprovado' ? 'bg-emerald-500/10 text-emerald-300' : cobranca.status === 'Pendente' ? 'bg-amber-500/10 text-amber-300' : 'bg-white/[0.06] text-white/50'}`}>{cobranca.status}</span>}</div>
    {modoTeste && <p className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.05] p-2.5 text-[10px] leading-4 text-amber-100/65">Modo de teste: depois de pagar pelo link, clique em “Sincronizar”. O sandbox do Mercado Pago não envia a confirmação automática.</p>}
    {!modoTeste && cobranca?.status === 'Pendente' && <p className="mt-3 text-[10px] leading-4 text-white/35">A confirmação é automática. Use “Sincronizar” apenas se o pagamento já foi feito e o status estiver atrasado.</p>}
    {mensagem && <p className="mt-3 text-[11px] text-white/55">{mensagem}</p>}
    {saldo > 0.009 && <div className="mt-3 flex flex-wrap gap-2">{url && <><a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-2 text-[11px] text-blue-200"><ExternalLink size={12} /> Abrir cobrança</a><button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-2 text-[11px] text-white/60">{copiado ? <Check size={12} /> : <Copy size={12} />}{copiado ? 'Copiado' : 'Copiar link'}</button></>}<button type="button" disabled={isPending} onClick={gerar} className="inline-flex items-center gap-1.5 rounded-lg bg-[#d8f45a] px-3 py-2 text-[11px] font-semibold text-[#15180d] disabled:opacity-50">{url ? <RefreshCw size={12} /> : <CreditCard size={12} />}{isPending && operacao === 'gerar' ? 'Gerando...' : url ? 'Gerar novo link' : `Cobrar ${moeda(saldo)}`}</button>{cobranca && cobranca.status !== 'Aprovado' && <button type="button" disabled={isPending} onClick={sincronizar} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-[11px] text-white/65 disabled:opacity-50"><RefreshCw size={12} /> {isPending && operacao === 'sincronizar' ? 'Consultando...' : 'Sincronizar'}</button>}</div>}
  </div>
}
