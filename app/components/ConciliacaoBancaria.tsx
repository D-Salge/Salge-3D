'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, FileUp, Link2, X } from 'lucide-react'
import { conciliarLancamento, ignorarLancamento, importarExtrato, type CandidatoConciliacao, type LancamentoExtrato } from '@/app/actions/conciliacao'
import type { ContaFinanceira } from '@/app/actions/contas-financeiras'

const moeda = (valor: number) => Math.abs(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ConciliacaoBancaria({ lancamentos, candidatos, contas }: { lancamentos: LancamentoExtrato[]; candidatos: CandidatoConciliacao[]; contas: ContaFinanceira[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [selecoes, setSelecoes] = useState<Record<number, string>>(() => Object.fromEntries(lancamentos.filter((item) => item.sugestao).map((item) => [item.id, `${item.sugestao!.tipo}:${item.sugestao!.id}`])))

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
    const [tipo, id] = (selecoes[item.id] ?? '').split(':')
    if (!tipo || !id) { setMensagem('Selecione o registro financeiro correspondente.'); return }
    startTransition(async () => {
      const result = await conciliarLancamento(item.id, tipo as 'Recebimento' | 'Despesa', Number(id))
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  function ignorar(id: number) {
    startTransition(async () => {
      const result = await ignorarLancamento(id)
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  const pendentes = lancamentos.filter((item) => item.status === 'Pendente')
  return <>
    <form onSubmit={importar} className="mb-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
      <div className="flex flex-wrap items-end gap-4"><div className="min-w-[260px] flex-1"><h2 className="flex items-center gap-2 text-sm font-semibold"><FileUp size={16} className="text-[#d8f45a]" /> Importar extrato</h2><p className="mt-1 text-xs text-white/35">OFX ou CSV com as colunas Data, Descrição e Valor. O mesmo arquivo não entra duas vezes.</p><input required name="arquivo" type="file" accept=".csv,.ofx,text/csv,application/x-ofx" className="mt-4 block w-full text-xs text-white/55 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.07] file:px-3 file:py-2 file:text-xs file:text-white" /></div><label className="min-w-[190px] text-xs text-white/45">Conta do extrato<select required name="conta_financeira_id" defaultValue={contas.find((conta) => conta.padrao_recebimento)?.id ?? contas[0]?.id} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-xs">{contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}</select></label><button disabled={isPending || contas.length === 0} className="h-10 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d] disabled:opacity-50">Importar</button></div>
    </form>
    {mensagem && <p className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">{mensagem}</p>}
    <section className="rounded-2xl border border-white/[0.08] bg-[#15171b]">
      <div className="border-b border-white/[0.07] px-6 py-5"><h2 className="text-sm font-semibold">Lançamentos a conferir</h2><p className="mt-1 text-xs text-white/35">{pendentes.length} pendente(s). Sugestões exigem mesmo valor e até sete dias de diferença.</p></div>
      <div className="divide-y divide-white/[0.05]">
        {pendentes.length === 0 && <p className="p-10 text-center text-xs text-white/35">Nenhum lançamento pendente.</p>}
        {pendentes.map((item) => {
          const tipo = item.valor > 0 ? 'Recebimento' : 'Despesa'
          const opcoes = candidatos.filter((candidato) => candidato.tipo === tipo && candidato.conta_financeira_id === item.conta_financeira_id && Math.abs(candidato.valor - Math.abs(item.valor)) < 0.01)
          return <div key={item.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1.4fr_auto] lg:items-center">
            <div><div className="flex items-center gap-2"><span className={`font-mono text-sm font-semibold ${item.valor > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.valor > 0 ? '+' : '−'} {moeda(item.valor)}</span>{item.sugestao && <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[9px] uppercase text-blue-300">sugestão</span>}</div><p className="mt-1 text-xs text-white/60">{item.descricao}</p><p className="mt-1 text-[10px] text-white/25">{item.data_lancamento.split('-').reverse().join('/')} · {item.conta_financeira_nome} · {item.nome_arquivo}</p></div>
            <select value={selecoes[item.id] ?? ''} onChange={(e) => setSelecoes({ ...selecoes, [item.id]: e.target.value })} className="h-10 min-w-0 rounded-lg border border-white/10 bg-[#101114] px-3 text-xs"><option value="">Selecione um {tipo.toLowerCase()}</option>{opcoes.map((opcao) => <option key={`${opcao.tipo}-${opcao.id}`} value={`${opcao.tipo}:${opcao.id}`}>{opcao.data.split('-').reverse().join('/')} · {opcao.descricao} · {moeda(opcao.valor)}</option>)}</select>
            <div className="flex gap-2"><button disabled={isPending || !selecoes[item.id]} onClick={() => conciliar(item)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500/10 px-3 text-xs text-emerald-300 disabled:opacity-40"><Link2 size={12} /> Conciliar</button><button disabled={isPending} onClick={() => ignorar(item.id)} aria-label="Ignorar lançamento" className="h-9 rounded-lg bg-white/[0.05] px-3 text-white/35"><X size={13} /></button></div>
          </div>
        })}
      </div>
    </section>
    {lancamentos.some((item) => item.status !== 'Pendente') && <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Check size={15} className="text-emerald-400" /> Histórico recente</h2><div className="space-y-2">{lancamentos.filter((item) => item.status !== 'Pendente').slice(0, 20).map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg bg-white/[0.025] p-3 text-xs"><span className="truncate text-white/55">{item.data_lancamento} · {item.descricao}</span><span className={item.status === 'Conciliado' ? 'text-emerald-300' : 'text-white/30'}>{item.status} · {moeda(item.valor)}</span></div>)}</div></section>}
  </>
}
