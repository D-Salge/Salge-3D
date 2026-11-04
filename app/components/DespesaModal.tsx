'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { salvarDespesa, deletarDespesa, type Despesa, type DespesaInput } from '@/app/actions/despesas'
import { gerarParcelas } from '@/lib/financeiro.mjs'
import { getContasFinanceiras, type ContaFinanceira } from '@/app/actions/contas-financeiras'

const FORMAS_PAGAMENTO = [
  'Cartão de Crédito', 'Pix', 'Dinheiro', 'Cartão de Débito', 'Transferência', 'Boleto', 'Outro',
]

export function DespesaModal({ despesa, onClose, contas = [] }: {
  despesa: Despesa | null
  onClose: () => void
  contas?: ContaFinanceira[]
}) {
  const [isPending, startTransition] = useTransition()
  const hoje = new Date().toISOString().substring(0, 10)
  const [mensagem, setMensagem] = useState('')
  const [contasDisponiveis, setContasDisponiveis] = useState(contas)
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
    conta_financeira_id: despesa.conta_financeira_id,
  } : {
    categoria: 'Outros', descricao: '', valor: 0, data_despesa: hoje,
    competencia_em: hoje, vencimento_em: hoje, pago_em: null,
    forma_pagamento: 'Cartão de Crédito', parcelas: 1,
    conta_financeira_id: contas.find((conta) => conta.padrao_pagamento)?.id ?? contas[0]?.id ?? null,
  })

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
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{despesa ? 'Editar parcela' : 'Nova despesa'}</h3>
            {despesa && despesa.total_parcelas > 1 && <p className="mt-1 text-xs text-muted-foreground">Parcela {despesa.numero_parcela}/{despesa.total_parcelas}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground"><X size={20}/></button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <input required placeholder="Descrição" value={form.descricao} onChange={e=>setForm({...form, descricao: e.target.value})}
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60" />
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-secondary-foreground">{despesa ? 'Valor da parcela' : 'Valor total'}
              <input required type="number" min="0.01" step="0.01" value={form.valor || ''} onChange={e=>setForm({...form, valor: Number(e.target.value)})}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60" />
            </label>
            <label className="flex flex-col gap-2 text-xs text-secondary-foreground">Categoria
              <select value={form.categoria} onChange={e=>setForm({...form, categoria: e.target.value})}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60">
                {[
                  ['Filamentos', 'Filamentos'], ['Insumos', 'Insumos'], ['Equipamento', 'Equipamento'],
                  ['Energia', 'Energia'], ['Marketing', 'Marketing'], ['Software', 'Software'],
                  ['Manutencao', 'Manutenção'], ['Embalagens', 'Embalagens'], ['Frete', 'Frete'], ['Outros', 'Outros'],
                ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-2 text-xs text-secondary-foreground">Conta de pagamento
            <select required value={form.conta_financeira_id ?? ''} onChange={e => setForm({...form, conta_financeira_id: Number(e.target.value)})}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
              <option value="" disabled>Selecione a conta</option>
              {contasDisponiveis.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-secondary-foreground">Forma de pagamento
              <select value={form.forma_pagamento} onChange={e=>setForm({...form, forma_pagamento: e.target.value})}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
                {FORMAS_PAGAMENTO.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-xs text-secondary-foreground">Parcelas
              <input required disabled={Boolean(despesa)} type="number" min="1" max="120" step="1" value={form.parcelas}
                onChange={e=>setForm({...form, parcelas: Number(e.target.value)})}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:opacity-50" />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-xs text-secondary-foreground">Data da compra
            <input required type="date" value={form.data_despesa} onChange={e=>setForm({...form, data_despesa: e.target.value, competencia_em: e.target.value})}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-xs text-secondary-foreground">Competência
              <input required type="date" value={form.competencia_em} onChange={e=>setForm({...form, competencia_em: e.target.value})}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="flex flex-col gap-2 text-xs text-secondary-foreground">{despesa ? 'Vencimento' : 'Primeiro vencimento'}
              <input required type="date" value={form.vencimento_em} onChange={e=>setForm({...form, vencimento_em: e.target.value})}
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
            </label>
          </div>

          {previa.length > 1 && <div className="rounded-xl border border-border bg-black/20 p-4">
            <p className="mb-3 text-xs font-medium text-secondary-foreground">Prévia das parcelas</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {previa.map(item => <div key={item.numero} className="flex justify-between text-xs text-muted-foreground">
                <span>{item.numero}/{previa.length} · {item.vencimentoEm.split('-').reverse().join('/')}</span>
                <b className="text-secondary-foreground">R$ {item.valor.toFixed(2).replace('.', ',')}</b>
              </div>)}
            </div>
          </div>}

          <label className="flex items-center gap-3 rounded-lg bg-subtle p-3 text-xs text-secondary-foreground">
            <input type="checkbox" checked={form.pago_em !== null}
              onChange={e => setForm({...form, pago_em: e.target.checked ? hoje : null})} />
            {despesa ? 'Esta parcela já foi paga' : form.parcelas > 1 ? 'Todas as parcelas já foram pagas' : 'Despesa já foi paga'}
          </label>
          {form.pago_em !== null && <label className="flex flex-col gap-2 text-xs text-secondary-foreground">Data do pagamento
            <input required type="date" value={form.pago_em ?? ''} onChange={e=>setForm({...form, pago_em: e.target.value})}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
          </label>}

          {mensagem && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-destructive">{mensagem}</p>}

          <div className="mt-4 flex justify-between">
            {despesa ? <button type="button" onClick={handleDel} className="text-xs text-destructive">Estornar parcela</button> : <div/>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-muted-foreground">Cancelar</button>
              <button type="submit" disabled={isPending || form.conta_financeira_id === null} className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50">
                {isPending ? 'Salvando...' : despesa ? 'Salvar parcela' : form.parcelas > 1 ? `Criar ${form.parcelas} parcelas` : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
