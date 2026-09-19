'use client'
import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { salvarDespesa, deletarDespesa, type Despesa } from '@/app/actions/despesas'

export function DespesaModal({ despesa, onClose }: { despesa: Despesa | null, onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const hoje = new Date().toISOString().substring(0, 10)
  const [form, setForm] = useState<Omit<Despesa, 'id'>>(despesa || {
    categoria: 'Outros', descricao: '', valor: 0, data_despesa: hoje,
    competencia_em: hoje, vencimento_em: hoje, pago_em: hoje,
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      await salvarDespesa(despesa?.id || null, { ...form, valor: Number(form.valor) })
      onClose()
    })
  }

  function handleDel() {
    if(!despesa || !confirm('Estornar esta despesa? O histórico será preservado.')) return
    startTransition(async () => {
      await deletarDespesa(despesa.id)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{despesa ? 'Editar' : 'Nova'} Despesa</h3>
          <button onClick={onClose} className="text-white/40"><X size={20}/></button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <input required placeholder="Descrição" value={form.descricao} onChange={e=>setForm({...form, descricao: e.target.value})}
            className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" />
          <div className="grid grid-cols-2 gap-4">
            <input required type="number" step="0.01" placeholder="Valor (R$)" value={form.valor || ''} onChange={e=>setForm({...form, valor: Number(e.target.value)})}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" />
            <select value={form.categoria} onChange={e=>setForm({...form, categoria: e.target.value})}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60">
              {[
                ['Filamentos', 'Filamentos'], ['Insumos', 'Insumos'], ['Equipamento', 'Equipamento'],
                ['Energia', 'Energia'], ['Marketing', 'Marketing'], ['Software', 'Software'],
                ['Manutencao', 'Manutenção'], ['Embalagens', 'Embalagens'], ['Frete', 'Frete'], ['Outros', 'Outros'],
              ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <input required type="date" value={form.data_despesa} onChange={e=>setForm({...form, data_despesa: e.target.value})}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" />
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-white/55">Competência
              <input required type="date" value={form.competencia_em} onChange={e=>setForm({...form, competencia_em: e.target.value})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-2 text-xs text-white/55">Vencimento
              <input required type="date" value={form.vencimento_em} onChange={e=>setForm({...form, vencimento_em: e.target.value})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white" />
            </label>
          </div>
          <label className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 text-xs text-white/60">
            <input type="checkbox" checked={form.pago_em !== null}
              onChange={e => setForm({...form, pago_em: e.target.checked ? hoje : null})} />
            Despesa já foi paga
          </label>
          {form.pago_em !== null && <label className="flex flex-col gap-2 text-xs text-white/55">Data do pagamento
            <input required type="date" value={form.pago_em ?? ''} onChange={e=>setForm({...form, pago_em: e.target.value})}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white" />
          </label>}
          
          <div className="mt-4 flex justify-between">
            {despesa ? <button type="button" onClick={handleDel} className="text-red-400 text-xs">Estornar</button> : <div/>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-white/50">Cancelar</button>
              <button type="submit" disabled={isPending} className="rounded-lg bg-[#d8f45a] px-5 py-2 text-xs font-semibold text-[#15180d]">Salvar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
