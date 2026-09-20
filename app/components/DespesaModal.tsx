'use client'

import { useMemo, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { salvarDespesa, deletarDespesa, type Despesa, type DespesaInput } from '@/app/actions/despesas'
import { gerarParcelas } from '@/lib/financeiro.mjs'

const FORMAS_PAGAMENTO = [
  'Cartão de Crédito', 'Pix', 'Dinheiro', 'Cartão de Débito', 'Transferência', 'Boleto', 'Outro',
]

export function DespesaModal({ despesa, onClose }: { despesa: Despesa | null, onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const hoje = new Date().toISOString().substring(0, 10)
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState<DespesaInput>(despesa ? {
    categoria: despesa.categoria,
    descricao: despesa.descricao,
    valor: despesa.valor,
    data_despesa: despesa.data_despesa.substring(0, 10),
    competencia_em: despesa.competencia_em.substring(0, 10),
    vencimento_em: despesa.vencimento_em.substring(0, 10),
    pago_em: despesa.pago_em?.substring(0, 10) ?? null,
    forma_pagamento: despesa.forma_pagamento ?? 'Cartão de Crédito',
    parcelas: despesa.total_parcelas,
  } : {
    categoria: 'Outros', descricao: '', valor: 0, data_despesa: hoje,
    competencia_em: hoje, vencimento_em: hoje, pago_em: null,
    forma_pagamento: 'Cartão de Crédito', parcelas: 1,
  })

  const previa = useMemo(() => {
    if (despesa || form.valor <= 0 || !form.vencimento_em || form.parcelas < 1) return []
    try { return gerarParcelas(form.valor, form.parcelas, form.vencimento_em) }
    catch { return [] }
  }, [despesa, form.valor, form.parcelas, form.vencimento_em])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setMensagem('')
    startTransition(async () => {
      const result = await salvarDespesa(despesa?.id || null, { ...form, valor: Number(form.valor), parcelas: Number(form.parcelas) })
      if (result.success) onClose()
      else setMensagem(result.message)
    })
  }

  function handleDel() {
    if (!despesa || !confirm('Estornar esta parcela? O histórico será preservado.')) return
    setMensagem('')
    startTransition(async () => {
      const result = await deletarDespesa(despesa.id)
      if (result.success) onClose()
      else setMensagem(result.message)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{despesa ? 'Editar parcela' : 'Nova despesa'}</h3>
            {despesa && despesa.total_parcelas > 1 && <p className="mt-1 text-xs text-white/40">Parcela {despesa.numero_parcela}/{despesa.total_parcelas}</p>}
          </div>
          <button onClick={onClose} className="text-white/40"><X size={20}/></button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <input required placeholder="Descrição" value={form.descricao} onChange={e=>setForm({...form, descricao: e.target.value})}
            className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" />
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-white/55">{despesa ? 'Valor da parcela' : 'Valor total'}
              <input required type="number" min="0.01" step="0.01" value={form.valor || ''} onChange={e=>setForm({...form, valor: Number(e.target.value)})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" />
            </label>
            <label className="flex flex-col gap-2 text-xs text-white/55">Categoria
              <select value={form.categoria} onChange={e=>setForm({...form, categoria: e.target.value})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60">
                {[
                  ['Filamentos', 'Filamentos'], ['Insumos', 'Insumos'], ['Equipamento', 'Equipamento'],
                  ['Energia', 'Energia'], ['Marketing', 'Marketing'], ['Software', 'Software'],
                  ['Manutencao', 'Manutenção'], ['Embalagens', 'Embalagens'], ['Frete', 'Frete'], ['Outros', 'Outros'],
                ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-white/55">Forma de pagamento
              <select value={form.forma_pagamento} onChange={e=>setForm({...form, forma_pagamento: e.target.value})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white">
                {FORMAS_PAGAMENTO.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs text-white/55">Parcelas
              <input required disabled={Boolean(despesa)} type="number" min="1" max="120" step="1" value={form.parcelas}
                onChange={e=>setForm({...form, parcelas: Number(e.target.value)})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white disabled:opacity-50" />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-xs text-white/55">Data da compra
            <input required type="date" value={form.data_despesa} onChange={e=>setForm({...form, data_despesa: e.target.value, competencia_em: e.target.value})}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm focus:border-[#d8f45a]/60" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-white/55">Competência
              <input required type="date" value={form.competencia_em} onChange={e=>setForm({...form, competencia_em: e.target.value})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-2 text-xs text-white/55">{despesa ? 'Vencimento' : 'Primeiro vencimento'}
              <input required type="date" value={form.vencimento_em} onChange={e=>setForm({...form, vencimento_em: e.target.value})}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white" />
            </label>
          </div>

          {previa.length > 1 && <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <p className="mb-3 text-xs font-medium text-white/60">Prévia das parcelas</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {previa.map(item => <div key={item.numero} className="flex justify-between text-xs text-white/45">
                <span>{item.numero}/{previa.length} · {item.vencimentoEm.split('-').reverse().join('/')}</span>
                <b className="text-white/75">R$ {item.valor.toFixed(2).replace('.', ',')}</b>
              </div>)}
            </div>
          </div>}

          <label className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-3 text-xs text-white/60">
            <input type="checkbox" checked={form.pago_em !== null}
              onChange={e => setForm({...form, pago_em: e.target.checked ? hoje : null})} />
            {despesa ? 'Esta parcela já foi paga' : form.parcelas > 1 ? 'Todas as parcelas já foram pagas' : 'Despesa já foi paga'}
          </label>
          {form.pago_em !== null && <label className="flex flex-col gap-2 text-xs text-white/55">Data do pagamento
            <input required type="date" value={form.pago_em ?? ''} onChange={e=>setForm({...form, pago_em: e.target.value})}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white" />
          </label>}

          {mensagem && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{mensagem}</p>}

          <div className="mt-4 flex justify-between">
            {despesa ? <button type="button" onClick={handleDel} className="text-xs text-red-400">Estornar parcela</button> : <div/>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-white/50">Cancelar</button>
              <button type="submit" disabled={isPending} className="rounded-lg bg-[#d8f45a] px-5 py-2 text-xs font-semibold text-[#15180d] disabled:opacity-50">
                {isPending ? 'Salvando...' : despesa ? 'Salvar parcela' : form.parcelas > 1 ? `Criar ${form.parcelas} parcelas` : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
