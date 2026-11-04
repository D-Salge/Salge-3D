'use client'
import { useState, useEffect, useTransition } from 'react'
import { X } from 'lucide-react'
import { getContextoRecebimentoPedido, getRecebimentosPorPedido, registrarRecebimento, deletarRecebimento, type ContextoRecebimentoPedido, type Recebimento } from '@/app/actions/recebimentos'
import { getContasFinanceiras, type ContaFinanceira } from '@/app/actions/contas-financeiras'

export function RecebimentoModal({ pedidoId, onClose, contas = [] }: {
  pedidoId: number
  onClose: () => void
  contas?: ContaFinanceira[]
}) {
  const [isPending, startTransition] = useTransition()
  const [historico, setHistorico] = useState<Recebimento[]>([])
  const [contexto, setContexto] = useState<ContextoRecebimentoPedido | null>(null)
  const [contasDisponiveis, setContasDisponiveis] = useState(contas)
  const [contaId, setContaId] = useState<number | null>(
    contas.find((conta) => conta.padrao_recebimento)?.id ?? contas[0]?.id ?? null,
  )
  
  const [valor, setValor] = useState('')
  const [tipoRecebimento, setTipoRecebimento] = useState<'Sinal' | 'Parcial' | 'Quitacao'>('Parcial')
  const [forma, setForma] = useState('Pix')
  const [obs, setObs] = useState('')
  const [dataRecebimento, setDataRecebimento] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    Promise.all([getRecebimentosPorPedido(pedidoId), getContextoRecebimentoPedido(pedidoId)]).then(([pagamentos, resumo]) => {
      setHistorico(pagamentos)
      setContexto(resumo)
      if (!resumo) return
      if (resumo.sinal_pendente > 0.009) {
        setTipoRecebimento('Sinal')
        setValor(resumo.sinal_pendente.toFixed(2))
      } else {
        setTipoRecebimento('Quitacao')
        setValor(resumo.saldo_pendente.toFixed(2))
      }
    })
  }, [pedidoId])

  useEffect(() => {
    if (contasDisponiveis.length > 0) return
    getContasFinanceiras().then((itens) => {
      setContasDisponiveis(itens)
      setContaId((atual) => atual ?? itens.find((conta) => conta.padrao_recebimento)?.id ?? itens[0]?.id ?? null)
    })
  }, [contasDisponiveis.length])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await registrarRecebimento({
        pedido_id: pedidoId,
        valor: Number(valor),
        forma_pagamento: forma,
        observacao: obs,
        data_recebimento: dataRecebimento,
        conta_financeira_id: contaId,
        tipo_recebimento: tipoRecebimento,
      })
      if(res.success) {
        onClose()
      } else {
        alert(res.message)
      }
    })
  }

  function alterarTipo(tipo: 'Sinal' | 'Parcial' | 'Quitacao') {
    setTipoRecebimento(tipo)
    if (tipo === 'Sinal' && contexto?.sinal_pendente) setValor(contexto.sinal_pendente.toFixed(2))
    else if (tipo === 'Quitacao' && contexto) setValor(contexto.saldo_pendente.toFixed(2))
    else setValor('')
  }

  const moeda = (numero: number) => numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  function handleDel(id: number) {
    if(!confirm('Estornar este pagamento? O histórico será preservado.')) return
    startTransition(async () => {
      await deletarRecebimento(id)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-6 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Registrar Pagamento</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20}/></button>
        </div>

        {contexto && <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-border bg-subtle p-4 text-xs">
          <div><span className="text-muted-foreground">Total</span><p className="mt-1 font-mono text-secondary-foreground">{moeda(contexto.valor_total)}</p></div>
          <div><span className="text-muted-foreground">Saldo pendente</span><p className="mt-1 font-mono text-warning">{moeda(contexto.saldo_pendente)}</p></div>
          {contexto.sinal_percentual > 0 && <><div><span className="text-muted-foreground">Sinal combinado</span><p className="mt-1 font-mono text-accent">{contexto.sinal_percentual.toLocaleString('pt-BR')}% · {moeda(contexto.valor_sinal)}</p></div><div><span className="text-muted-foreground">Sinal já recebido</span><p className="mt-1 font-mono text-success">{moeda(contexto.sinal_recebido)}</p></div></>}
        </div>}

        {historico.length > 0 && (
          <div className="mb-6 rounded-lg bg-subtle p-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Histórico de Pagamentos</h4>
            <div className="space-y-2">
              {historico.map(h => (
                <div key={h.id} className="flex justify-between items-center text-sm">
                  <span className="text-secondary-foreground"><b>{h.tipo_recebimento === 'Quitacao' ? 'Quitação' : h.tipo_recebimento}{h.tipo_recebimento === 'Sinal' ? ` de ${h.percentual_pedido.toLocaleString('pt-BR')}%` : ''}</b><small className="block text-[10px] text-muted-foreground">{h.forma_pagamento}{h.conta_financeira_nome ? ` · ${h.conta_financeira_nome}` : ''}</small></span>
                  <div className="flex items-center gap-3">
                    <span className="text-accent font-mono">R$ {h.valor.toFixed(2)}</span>
                    <button onClick={() => handleDel(h.id)} className="text-destructive hover:text-destructive text-xs">Estornar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-secondary-foreground">Tipo do recebimento</span>
            <select value={tipoRecebimento} onChange={e => alterarTipo(e.target.value as 'Sinal' | 'Parcial' | 'Quitacao')}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60">
              <option value="Sinal">Sinal para iniciar a produção</option>
              <option value="Parcial">Pagamento parcial</option>
              <option value="Quitacao">Quitação do saldo</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-secondary-foreground">Valor (R$)</span>
            <input required type="number" step="0.01" min="0.01" value={valor} onChange={e=>setValor(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60" />
            {tipoRecebimento === 'Sinal' && contexto?.sinal_percentual === 0 && <span className="text-[10px] text-warning">Este pedido não tinha percentual de sinal definido; o percentual será calculado pelo valor recebido.</span>}
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-secondary-foreground">Conta de entrada</span>
            <select required value={contaId ?? ''} onChange={e => setContaId(Number(e.target.value))}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60">
              <option value="" disabled>Selecione a conta</option>
              {contasDisponiveis.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-secondary-foreground">Observação</span>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent/60"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-secondary-foreground">Data do recebimento</span>
            <input required type="date" value={dataRecebimento} onChange={e => setDataRecebimento(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-secondary-foreground">Forma de Pagamento</span>
            <select value={forma} onChange={e=>setForma(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm focus:border-accent/60">
              {['Pix', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Transferência', 'Outro'].map(f=><option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-muted-foreground">Cancelar</button>
            <button type="submit" disabled={isPending || contaId === null} className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-accent-foreground disabled:opacity-50">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
