'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, MessageCircle, X } from 'lucide-react'
import {
  criarMensagemWhatsApp,
  criarUrlWhatsApp,
  normalizarTelefoneWhatsApp,
  ROTULOS_MENSAGEM_WHATSAPP,
  sugerirTipoMensagemWhatsApp,
} from '@/lib/whatsapp.mjs'
import {
  registrarContatoWhatsApp,
  type PedidoWhatsApp,
  type TipoMensagemWhatsApp,
} from '@/app/actions/whatsapp'

const TIPOS: TipoMensagemWhatsApp[] = ['orcamento', 'cobranca', 'producao', 'pronto']

function dadosMensagem(pedido: PedidoWhatsApp) {
  return {
    clienteNome: pedido.cliente_nome,
    numeroOrcamento: pedido.numero_orcamento,
    nomeDaPeca: pedido.nome_da_peca,
    valorTotal: pedido.valor_total_cobrado,
    saldoPendente: pedido.saldo_pendente,
    status: pedido.status,
    vencimentoEm: pedido.vencimento_em,
  }
}

export function WhatsAppModal({
  pedido,
  tipoInicial,
  onClose,
}: {
  pedido: PedidoWhatsApp
  tipoInicial?: TipoMensagemWhatsApp
  onClose: () => void
}) {
  const sugerido = tipoInicial ?? sugerirTipoMensagemWhatsApp({
    orcamentoStatus: pedido.orcamento_status,
    status: pedido.status,
    saldoPendente: pedido.saldo_pendente,
    vencimentoEm: pedido.vencimento_em,
  }) as TipoMensagemWhatsApp
  const [tipo, setTipo] = useState<TipoMensagemWhatsApp>(sugerido)
  const [mensagem, setMensagem] = useState(() => criarMensagemWhatsApp(sugerido, dadosMensagem(pedido)))
  const [retorno, setRetorno] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const numeroValido = useMemo(
    () => normalizarTelefoneWhatsApp(pedido.cliente_telefone),
    [pedido.cliente_telefone],
  )

  function trocarTipo(novoTipo: TipoMensagemWhatsApp) {
    setTipo(novoTipo)
    setMensagem(criarMensagemWhatsApp(novoTipo, dadosMensagem(pedido)))
    setRetorno('')
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1_500)
    } catch {
      setRetorno('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.')
    }
  }

  function abrirWhatsApp() {
    const url = criarUrlWhatsApp(pedido.cliente_telefone || '', mensagem)
    if (!url) {
      setRetorno('Cadastre um telefone brasileiro válido para este cliente.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    startTransition(async () => {
      const resultado = await registrarContatoWhatsApp({ pedidoId: pedido.id, tipo, mensagem })
      setRetorno(resultado.message)
      if (resultado.success) router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Mensagem pelo WhatsApp">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#15171b] p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400"><MessageCircle size={18} /><h2 className="font-semibold text-white">WhatsApp</h2></div>
            <p className="mt-1 text-xs text-white/40">{pedido.cliente_nome} · {pedido.numero_orcamento || `#${pedido.id}`}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white" aria-label="Fechar"><X size={18} /></button>
        </div>

        <label className="block text-xs text-white/50">
          Tipo de mensagem
          <select value={tipo} onChange={(event) => trocarTipo(event.target.value as TipoMensagemWhatsApp)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm text-white outline-none focus:border-emerald-400/50">
            {TIPOS.map((item) => <option key={item} value={item}>{ROTULOS_MENSAGEM_WHATSAPP[item]}</option>)}
          </select>
        </label>

        <label className="mt-4 block text-xs text-white/50">
          Mensagem — você pode editar antes de abrir
          <textarea autoFocus maxLength={2000} rows={7} value={mensagem} onChange={(event) => setMensagem(event.target.value)} className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-[#101114] p-3 text-sm leading-6 text-white outline-none focus:border-emerald-400/50" />
        </label>

        <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
          <span className={numeroValido ? 'text-white/35' : 'text-red-300'}>
            {numeroValido ? `Destino: +${numeroValido}` : 'Telefone ausente ou inválido'}
          </span>
          <span className="text-white/25">{mensagem.length}/2.000</span>
        </div>

        {retorno && <p className="mt-4 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/60">{retorno}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={copiarMensagem} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-4 text-xs font-medium text-white/70 hover:bg-white/[0.1]">
            {copiado ? <Check size={14} /> : <Copy size={14} />}{copiado ? 'Copiado' : 'Copiar mensagem'}
          </button>
          <button type="button" disabled={!numeroValido || !mensagem.trim() || isPending} onClick={abrirWhatsApp} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-xs font-semibold text-[#07140d] hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45">
            <ExternalLink size={14} />{isPending ? 'Registrando...' : 'Abrir WhatsApp'}
          </button>
        </div>
        <p className="mt-3 text-center text-[10px] text-white/25">O ERP registra que a conversa foi aberta; o envio é confirmado por você no WhatsApp.</p>
      </div>
    </div>
  )
}
