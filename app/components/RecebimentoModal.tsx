'use client'
import { useState, useEffect, useTransition } from 'react'
import { X } from 'lucide-react'
import { getRecebimentosPorPedido, registrarRecebimento, deletarRecebimento, type Recebimento } from '@/app/actions/recebimentos'

export function RecebimentoModal({ pedidoId, onClose }: { pedidoId: number, onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [historico, setHistorico] = useState<Recebimento[]>([])
  
  const [valor, setValor] = useState('')
  const [forma, setForma] = useState('Pix')
  const [obs, setObs] = useState('')

  useEffect(() => {
    getRecebimentosPorPedido(pedidoId).then(setHistorico)
  }, [pedidoId])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await registrarRecebimento({ pedido_id: pedidoId, valor: Number(valor), forma_pagamento: forma, observacao: obs })
      if(res.success) {
        onClose()
      } else {
        alert(res.message)
      }
    })
  }

  function handleDel(id: number) {
    if(!confirm('Estornar este pagamento? O histórico será preservado.')) return
    startTransition(async () => {
      await deletarRecebimento(id)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Registrar Pagamento</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={20}/></button>
        </div>

        {historico.length > 0 && (
          <div className="mb-6 rounded-lg bg-white/[0.03] p-4">
            <h4 className="text-xs font-medium text-white/50 mb-2">Histórico de Pagamentos</h4>
            <div className="space-y-2">
              {historico.map(h => (
                <div key={h.id} className="flex justify-between items-center text-sm">
                  <span className="text-white/70">{h.forma_pagamento}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[#d8f45a] font-mono">R$ {h.valor.toFixed(2)}</span>
                    <button onClick={() => handleDel(h.id)} className="text-red-400 hover:text-red-300 text-xs">Estornar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-white/55">Valor (R$)</span>
            <input required type="number" step="0.01" min="0.01" value={valor} onChange={e=>setValor(e.target.value)}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-white/55">Observação</span>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              className="min-h-20 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 py-2 text-sm focus:border-[#d8f45a]/60"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-white/55">Forma de Pagamento</span>
            <select value={forma} onChange={e=>setForma(e.target.value)}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60">
              {['Pix', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Transferência', 'Outro'].map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-white/50">Cancelar</button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-[#d8f45a] px-5 py-2 text-xs font-semibold text-[#15180d]">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
