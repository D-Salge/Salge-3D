'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, CircleDollarSign, FileUp, Link2, ReceiptText, UserRound, X } from 'lucide-react'
import {
  classificarLancamento,
  conciliarLancamento,
  ignorarLancamento,
  importarExtrato,
  type CandidatoConciliacao,
  type LancamentoExtrato,
} from '@/app/actions/conciliacao'
import type { ContaFinanceira } from '@/app/actions/contas-financeiras'

const moeda = (valor: number) => Math.abs(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const categoriasDespesa = [
  'Filamentos', 'Insumos', 'Equipamento', 'Energia', 'Marketing',
  'Software', 'Manutencao', 'Embalagens', 'Frete', 'Outros',
] as const
type CategoriaDespesa = typeof categoriasDespesa[number]

export function ConciliacaoBancaria({ lancamentos, candidatos, contas }: {
  lancamentos: LancamentoExtrato[]
  candidatos: CandidatoConciliacao[]
  contas: ContaFinanceira[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [selecoes, setSelecoes] = useState<Record<number, number[]>>(() => Object.fromEntries(
    lancamentos.filter((item) => item.sugestao)
      .map((item) => [item.id, [item.sugestao!.id]]),
  ))
  const [categorias, setCategorias] = useState<Record<number, CategoriaDespesa>>({})

  function importar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    startTransition(async () => {
      const result = await importarExtrato(new FormData(form))
      setMensagem(result.message)
      if (result.success) { form.reset(); router.refresh() }
    })
  }

  function conciliar(item: LancamentoExtrato) {
    const ids = selecoes[item.id] ?? []
    if (!ids.length) { setMensagem('Selecione ao menos um registro financeiro.'); return }
    const tipo = item.valor > 0 ? 'Recebimento' : 'Despesa'
    startTransition(async () => {
      const result = await conciliarLancamento(item.id, tipo, ids)
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  function alternarSelecao(lancamentoId: number, entidadeId: number) {
    setSelecoes((atuais) => {
      const selecionados = atuais[lancamentoId] ?? []
      return {
        ...atuais,
        [lancamentoId]: selecionados.includes(entidadeId)
          ? selecionados.filter((id) => id !== entidadeId)
          : [...selecionados, entidadeId],
      }
    })
  }

  function classificar(item: LancamentoExtrato, tipo: 'Aporte' | 'Despesa' | 'Pessoal') {
    startTransition(async () => {
      const result = await classificarLancamento(item.id, tipo, {
        categoria: categorias[item.id] ?? 'Outros',
      })
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  function ignorar(id: number) {
    if (!confirm('Ignorar este lançamento? Ele não será contabilizado no saldo do ERP.')) return
    startTransition(async () => {
      const result = await ignorarLancamento(id)
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  const pendentes = lancamentos.filter((item) => item.status === 'Pendente')
  const reconhecidos = lancamentos.filter((item) => item.classificacao === 'Transferencia').length

  return <>
    <form onSubmit={importar} className="mb-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[260px] flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FileUp size={16} className="text-[#d8f45a]" /> Importar extrato</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-white/35">Aceita o XLSX original do Mercado Pago, além de OFX ou CSV. Reservas e retiradas do Cofrinho Salge 3D são reconhecidas como transferências internas.</p>
          <input required name="arquivo" type="file" accept=".xlsx,.csv,.ofx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/x-ofx" className="mt-4 block w-full text-xs text-white/55 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.07] file:px-3 file:py-2 file:text-xs file:text-white" />
        </div>
        <label className="min-w-[190px] text-xs text-white/45">Conta do extrato
          <select required name="conta_financeira_id" defaultValue={contas.find((conta) => conta.padrao_recebimento)?.id ?? contas[0]?.id} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-xs">
            {contas.filter((conta) => conta.tipo !== 'Reserva').map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}
          </select>
        </label>
        <button disabled={isPending || contas.length === 0} className="h-10 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d] disabled:opacity-50">{isPending ? 'Processando...' : 'Importar'}</button>
      </div>
    </form>

    {mensagem && <p className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">{mensagem}</p>}

    <section className="rounded-2xl border border-white/[0.08] bg-[#15171b]">
      <div className="border-b border-white/[0.07] px-6 py-5">
        <h2 className="text-sm font-semibold">Lançamentos a conferir</h2>
        <p className="mt-1 text-xs text-white/35">{pendentes.length} pendente(s){reconhecidos ? ` · ${reconhecidos} transferência(s) do cofrinho reconhecida(s)` : ''}. Concilie vendas e despesas já registradas ou classifique o lançamento abaixo.</p>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {pendentes.length === 0 && <p className="p-10 text-center text-xs text-white/35">Nenhum lançamento pendente.</p>}
        {pendentes.map((item) => {
          const tipo = item.valor > 0 ? 'Recebimento' : 'Despesa'
          const opcoes = candidatos.filter((candidato) => candidato.tipo === tipo &&
            candidato.conta_financeira_id === item.conta_financeira_id)
            .sort((a, b) => Math.abs(new Date(`${a.data}T12:00:00`).getTime() - new Date(`${item.data_lancamento}T12:00:00`).getTime()) -
              Math.abs(new Date(`${b.data}T12:00:00`).getTime() - new Date(`${item.data_lancamento}T12:00:00`).getTime()))
          const idsSelecionados = selecoes[item.id] ?? []
          const selecionados = opcoes.filter((opcao) => idsSelecionados.includes(opcao.id))
          const totalSelecionado = selecionados.reduce((total, opcao) => total + opcao.valor, 0)
          const valorFecha = Math.round(totalSelecionado * 100) === Math.round(Math.abs(item.valor) * 100)
          return <div key={item.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className={`font-mono text-sm font-semibold ${item.valor > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.valor > 0 ? '+' : '−'} {moeda(item.valor)}</span>{item.sugestao && <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[9px] uppercase text-blue-300">sugestão</span>}</div>
                <p className="mt-1 text-xs text-white/60">{item.descricao}</p>
                <p className="mt-1 text-[10px] text-white/25">{item.data_lancamento.split('-').reverse().join('/')} · {item.conta_financeira_nome} · {item.nome_arquivo}</p>
              </div>
              <button disabled={isPending} onClick={() => ignorar(item.id)} title="Não contabilizar este lançamento" className="rounded-lg bg-white/[0.04] p-2 text-white/30 hover:text-red-300"><X size={13} /></button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
              <div>
                <p className="text-[10px] uppercase text-white/30">{item.valor > 0 ? 'Recebimentos dos pedidos' : 'Despesas já registradas'}</p>
                <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-white/10 bg-[#101114] p-2">
                  {!opcoes.length && <p className="px-2 py-3 text-xs text-white/30">Nenhum registro disponível nesta conta.</p>}
                  {opcoes.map((opcao) => <label key={`${opcao.tipo}-${opcao.id}`} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-xs hover:bg-white/[0.04]">
                    <input type="checkbox" checked={idsSelecionados.includes(opcao.id)} onChange={() => alternarSelecao(item.id, opcao.id)} className="mt-0.5 accent-[#d8f45a]" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-white/65">{opcao.descricao}</span><span className="mt-0.5 block text-[10px] text-white/30">{opcao.data.split('-').reverse().join('/')} · {moeda(opcao.valor)}</span></span>
                  </label>)}
                </div>
                <p className={`mt-2 text-[10px] ${valorFecha ? 'text-emerald-300' : 'text-white/35'}`}>Selecionado: {moeda(totalSelecionado)} de {moeda(item.valor)}{idsSelecionados.length > 1 ? ` · ${idsSelecionados.length} registros` : ''}</p>
              </div>
              <button disabled={isPending || !valorFecha} onClick={() => conciliar(item)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-500/10 px-3 text-xs text-emerald-300 disabled:opacity-40"><Link2 size={12} /> Conciliar {idsSelecionados.length > 1 ? `${idsSelecionados.length} registros` : item.valor > 0 ? 'venda' : 'despesa'}</button>
            </div>

            {item.valor > 0 ? <div className="flex flex-wrap gap-2">
              <button disabled={isPending} onClick={() => classificar(item, 'Aporte')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-500/10 px-3 text-xs text-blue-300"><CircleDollarSign size={13} /> Registrar aporte</button>
              <button disabled={isPending} onClick={() => classificar(item, 'Pessoal')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-500/10 px-3 text-xs text-violet-300"><UserRound size={13} /> Entrada pessoal</button>
            </div> : <div className="grid gap-3 sm:grid-cols-[minmax(180px,260px)_auto_auto] sm:items-end">
              <label className="text-[10px] uppercase text-white/30">Categoria da nova despesa
                <select value={categorias[item.id] ?? 'Outros'} onChange={(event) => setCategorias({ ...categorias, [item.id]: event.target.value as CategoriaDespesa })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-[#101114] px-2 text-xs">
                  {categoriasDespesa.map((categoria) => <option key={categoria} value={categoria}>{categoria === 'Manutencao' ? 'Manutenção' : categoria}</option>)}
                </select>
              </label>
              <button disabled={isPending} onClick={() => classificar(item, 'Despesa')} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-500/10 px-3 text-xs text-amber-300"><ReceiptText size={13} /> Criar despesa</button>
              <button disabled={isPending} onClick={() => classificar(item, 'Pessoal')} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-violet-500/10 px-3 text-xs text-violet-300"><UserRound size={13} /> Retirada pessoal</button>
            </div>}
          </div>
        })}
      </div>
    </section>

    {lancamentos.some((item) => item.status !== 'Pendente') && <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Check size={15} className="text-emerald-400" /> Histórico recente</h2>
      <div className="space-y-2">{lancamentos.filter((item) => item.status !== 'Pendente').slice(0, 30).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3 text-xs"><span className="min-w-0 truncate text-white/55">{item.data_lancamento.split('-').reverse().join('/')} · {item.descricao}</span><span className={item.status === 'Conciliado' ? 'text-emerald-300' : 'text-white/30'}>{item.classificacao ?? item.status} · {moeda(item.valor)}</span></div>)}</div>
    </section>}
  </>
}
