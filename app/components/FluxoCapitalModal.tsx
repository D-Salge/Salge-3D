'use client'
import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { salvarFluxoCapital, type FluxoCapital } from '@/app/actions/despesas'
import { getContasFinanceiras, type ContaFinanceira } from '@/app/actions/contas-financeiras'

export function FluxoCapitalModal({ fluxo, onClose, contas = [] }: {
  fluxo: FluxoCapital | null
  onClose: () => void
  contas?: ContaFinanceira[]
}) {
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [contasDisponiveis, setContasDisponiveis] = useState(contas)
  const [form, setForm] = useState<Omit<FluxoCapital, 'id' | 'conta_financeira_nome'>>(
    fluxo
      ? {
          tipo: fluxo.tipo,
          descricao: fluxo.descricao,
          valor: fluxo.valor,
          data_movimentacao: fluxo.data_movimentacao,
          conta_financeira_id: fluxo.conta_financeira_id,
        }
      : {
          tipo: 'Aporte',
          descricao: '',
          valor: 0,
          data_movimentacao: new Date().toISOString().substring(0, 10),
          conta_financeira_id: contas.find((conta) => conta.padrao_pagamento)?.id ?? contas[0]?.id ?? null,
        },
  )

  useEffect(() => {
    if (contasDisponiveis.length > 0) return
    getContasFinanceiras().then((itens) => {
      setContasDisponiveis(itens)
      setForm((atual) => ({
        ...atual,
        conta_financeira_id: atual.conta_financeira_id ?? itens.find((conta) => conta.padrao_pagamento)?.id ?? itens[0]?.id ?? null,
      }))
    })
  }, [contasDisponiveis.length])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const resultado = await salvarFluxoCapital({ ...form, valor: Number(form.valor) })
      if (resultado.success) onClose()
      else setMensagem(resultado.message)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{fluxo ? 'Visualizar' : 'Nova'} Movimentação</h3>
          <button onClick={onClose} className="text-white/40"><X size={20}/></button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <select value={form.tipo} onChange={e=>setForm({...form, tipo: e.target.value as FluxoCapital['tipo']})}
            className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" disabled={!!fluxo}>
            <option>Aporte</option><option>Retirada</option>
          </select>
          <input required placeholder="Descrição (Opcional)" value={form.descricao || ''} onChange={e=>setForm({...form, descricao: e.target.value})}
            className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" disabled={!!fluxo}/>
          <input required type="number" step="0.01" placeholder="Valor (R$)" value={form.valor || ''} onChange={e=>setForm({...form, valor: Number(e.target.value)})}
            className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" disabled={!!fluxo}/>
          <label className="flex flex-col gap-2 text-xs text-white/55">Conta
            <select required value={form.conta_financeira_id ?? ''} onChange={e => setForm({...form, conta_financeira_id: Number(e.target.value)})}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm" disabled={!!fluxo}>
              <option value="" disabled>Selecione a conta</option>
              {contasDisponiveis.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
            </select>
          </label>
          {mensagem && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{mensagem}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-white/50">Fechar</button>
            {!fluxo && <button type="submit" disabled={isPending || form.conta_financeira_id === null} className="rounded-lg bg-[#d8f45a] px-5 py-2 text-xs font-semibold text-[#15180d] disabled:opacity-50">Salvar</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
