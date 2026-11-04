'use client'

import { useMemo, useState, useTransition } from 'react'
import { Search, TrendingUp, TrendingDown, DollarSign, Wallet } from 'lucide-react'
import type { RecebimentoResumo } from '@/app/actions/recebimentos'
import { alterarPagamentoDespesa, type Despesa, type DespesaRecorrente, type FluxoCapital } from '@/app/actions/despesas'
import { RecebimentoModal } from './RecebimentoModal'
import { DespesaModal } from './DespesaModal'
import { FluxoCapitalModal } from './FluxoCapitalModal'
import { ProjecaoFluxoCaixa } from './ProjecaoFluxoCaixa'
import type { ProjecaoFluxoCaixa as Projecao } from '@/app/actions/financeiro'
import { DespesasRecorrentes } from './DespesasRecorrentes'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { ContasFinanceiras } from './ContasFinanceiras'
import type { ContaFinanceira, TransferenciaFinanceira } from '@/app/actions/contas-financeiras'

export function FinanceiroPage({ 
  pendentes, 
  resumoRecebimentos, 
  despesas, 
  despesasRecorrentes,
  resumoDespesas, 
  fluxo,
  projecao,
  contas,
  transferencias,
}: { 
  pendentes: RecebimentoResumo[],
  resumoRecebimentos: {
    totalRecebidoMes: number,
    totalRecebido: number,
    totalPendente: number,
    totalVencido: number,
    receitaCompetenciaMes: number,
  },
  despesas: Despesa[],
  despesasRecorrentes: DespesaRecorrente[],
  resumoDespesas: {
    totalDespesasMes: number,
    totalDespesasPagas: number,
    totalDespesasCompetenciaMes: number,
    totalDespesasPendentes: number,
    totalAportes: number,
    totalRetiradas: number,
  },
  fluxo: FluxoCapital[],
  projecao: Projecao,
  contas: ContaFinanceira[],
  transferencias: TransferenciaFinanceira[],
}) {
  const [isPending, startTransition] = useTransition()
  const [recModal, setRecModal] = useState<number | null>(null)
  const [despesaModal, setDespesaModal] = useState<Despesa | 'new' | null>(null)
  const [fluxoModal, setFluxoModal] = useState<FluxoCapital | 'new' | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [buscaDespesa, setBuscaDespesa] = useState('')
  const [statusDespesa, setStatusDespesa] = useState<'Todas' | 'Pendentes' | 'Pagas'>('Todas')
  const [ordemDespesa, setOrdemDespesa] = useState<'Recentes' | 'Vencimento'>('Recentes')

  const fmtBRL = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
  // O caixa real é a soma das contas. A fórmula antiga ignorava saldos iniciais
  // e ajustes de conciliação, fazendo o painel divergir dos bancos.
  const saldoCaixa = contas.reduce((total, conta) => total + conta.saldo_atual, 0)
  const saldoProjetado = saldoCaixa + resumoRecebimentos.totalPendente - resumoDespesas.totalDespesasPendentes
  const despesasVisiveis = useMemo(() => {
    const termo = buscaDespesa.trim().toLocaleLowerCase('pt-BR')
    return despesas
      .filter((despesa) => statusDespesa === 'Todas' || (statusDespesa === 'Pagas' ? Boolean(despesa.pago_em) : !despesa.pago_em))
      .filter((despesa) => !termo || [despesa.descricao, despesa.categoria, despesa.conta_financeira_nome, despesa.forma_pagamento]
        .some((valor) => valor?.toLocaleLowerCase('pt-BR').includes(termo)))
      .sort((a, b) => ordemDespesa === 'Recentes'
        ? b.id - a.id
        : Number(Boolean(a.pago_em)) - Number(Boolean(b.pago_em)) || a.vencimento_em.localeCompare(b.vencimento_em))
  }, [buscaDespesa, despesas, ordemDespesa, statusDespesa])

  function alternarPagamento(event: React.MouseEvent, despesa: Despesa) {
    event.stopPropagation()
    const hoje = new Date().toISOString().substring(0, 10)
    startTransition(async () => {
      const result = await alterarPagamentoDespesa(despesa.id, despesa.pago_em ? null : hoje)
      setMensagem(result.message)
    })
  }

  return (
    <>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Sistema</span><span>/</span><span className="text-secondary-foreground">Financeiro</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">Financeiro</h1>
        </div>
        <Link href="/financeiro/conciliacao" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-500/10 px-4 text-xs font-medium text-info transition hover:bg-blue-500/15 sm:w-auto"><Landmark size={15} /> Conciliar banco</Link>
      </div>

      <ContasFinanceiras contas={contas} transferencias={transferencias} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {/* Recebido */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-success">
              <TrendingUp size={18} />
            </div>
            <span className="text-xs font-medium text-secondary-foreground">Recebido (mês)</span>
          </div>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight text-foreground 2xl:text-2xl">{fmtBRL(resumoRecebimentos.totalRecebidoMes)}</p>
        </div>

        {/* Despesas */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-red-500/10 text-destructive">
              <TrendingDown size={18} />
            </div>
            <span className="text-xs font-medium text-secondary-foreground">Despesas (mês)</span>
          </div>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight text-foreground 2xl:text-2xl">{fmtBRL(resumoDespesas.totalDespesasMes)}</p>
        </div>

        {/* Saldo Operacional */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-info">
              <Wallet size={18} />
            </div>
            <span className="text-xs font-medium text-secondary-foreground">Saldo em caixa</span>
          </div>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight text-foreground 2xl:text-2xl">{fmtBRL(saldoCaixa)}</p>
        </div>

        {/* Inadimplência */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-warning">
              <DollarSign size={18} />
            </div>
            <span className="text-xs font-medium text-secondary-foreground">Em atraso</span>
          </div>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight text-warning 2xl:text-2xl">{fmtBRL(resumoRecebimentos.totalVencido)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent"><TrendingUp size={18} /></div><span className="text-xs font-medium text-secondary-foreground">Saldo projetado</span></div>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight text-accent 2xl:text-2xl">{fmtBRL(saldoProjetado)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-accent"><DollarSign size={18} /></div><span className="text-xs font-medium text-secondary-foreground">Receita por competência</span></div>
          <p className="whitespace-nowrap text-xl font-bold tracking-tight text-foreground 2xl:text-2xl">{fmtBRL(resumoRecebimentos.receitaCompetenciaMes)}</p>
        </div>
      </div>

      {mensagem && <div className="mb-5 rounded-xl border border-border bg-subtle p-3 text-sm text-secondary-foreground">{mensagem}</div>}

      <DespesasRecorrentes itens={despesasRecorrentes} />

      <ProjecaoFluxoCaixa projecao={projecao} />

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
        {/* Pagamentos Pendentes */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div><h2 className="text-sm font-semibold text-foreground">Pagamentos pendentes</h2><p className="mt-1 text-xs text-muted-foreground">Valores que ainda precisam ser recebidos.</p></div>
            <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] text-warning">{pendentes.length}</span>
          </div>
          <div className="erp-table-scroll erp-table-fit flex-1">
            <table className="w-full table-fixed text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="px-3 py-3">Pedido</th><th className="w-[98px] px-2 py-3">Saldo</th><th className="w-[86px] px-3 py-3 text-right">Ação</th></tr></thead>
              <tbody className="divide-y divide-border">
                {pendentes.length === 0 && (
                  <tr><td colSpan={3} className="py-8 text-center text-xs text-muted-foreground">Nenhum pagamento pendente!</td></tr>
                )}
                {pendentes.map(p => (
                  <tr key={p.parcela_id} className="group hover:bg-subtle">
                    <td className="px-3 py-3">
                      <p className="line-clamp-2 text-[13px] font-medium leading-[18px] text-foreground" title={p.nome_da_peca}>{p.nome_da_peca}</p>
                      <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground" title={`${p.cliente_nome} · parcela ${p.numero_parcela}/${p.total_parcelas} · ${p.situacao}${p.vencimento_em ? ` · vence ${p.vencimento_em.split('-').reverse().join('/')}` : ''}`}>{p.cliente_nome} · parcela {p.numero_parcela}/{p.total_parcelas} · {p.situacao}{p.vencimento_em ? ` · vence ${p.vencimento_em.split('-').reverse().join('/')}` : ''}</p>
                    </td>
                    <td className="px-2 py-3 font-mono text-xs text-accent whitespace-nowrap">{fmtBRL(p.saldo_pendente)}</td>
                    <td className="px-3 py-3 text-right">
                      <button 
                        onClick={() => setRecModal(p.pedido_id)}
                        className="w-full rounded bg-emerald-500/10 px-2 py-1.5 text-xs font-medium text-success hover:bg-emerald-500/20"
                      >
                        Receber
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Despesas */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div><h2 className="text-sm font-semibold text-foreground">Despesas e contas a pagar</h2><p className="mt-1 text-xs text-muted-foreground">{despesasVisiveis.length} de {despesas.length} lançamento(s)</p></div>
            <button onClick={() => setDespesaModal('new')} className="rounded bg-subtle px-3 py-1.5 text-xs font-medium text-foreground hover:bg-subtle">
              Nova Despesa
            </button>
          </div>
          <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-[minmax(0,1fr)_130px_140px]">
            <label className="relative"><Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input aria-label="Buscar despesa" value={buscaDespesa} onChange={(event) => setBuscaDespesa(event.target.value)} placeholder="Buscar despesa" className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-accent/40" /></label>
            <select aria-label="Filtrar despesas por status" value={statusDespesa} onChange={(event) => setStatusDespesa(event.target.value as typeof statusDespesa)} className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-secondary-foreground"><option>Todas</option><option>Pendentes</option><option>Pagas</option></select>
            <select aria-label="Ordenar despesas" value={ordemDespesa} onChange={(event) => setOrdemDespesa(event.target.value as typeof ordemDespesa)} className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-secondary-foreground"><option>Recentes</option><option>Vencimento</option></select>
          </div>
          <div className="erp-table-scroll erp-table-fit flex-1">
            <table className="w-full table-fixed text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="px-3 py-3">Despesa</th><th className="w-[94px] px-2 py-3">Vencimento</th><th className="w-[98px] px-2 py-3 text-right">Valor</th><th className="w-[86px] px-3 py-3 text-right">Ação</th></tr></thead>
              <tbody className="divide-y divide-border">
                {despesasVisiveis.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">Nenhuma despesa corresponde aos filtros.</td></tr>
                )}
                {despesasVisiveis.map(d => (
                  <tr key={d.id} className="group hover:bg-subtle cursor-pointer" onClick={() => setDespesaModal(d)}>
                    <td className="px-3 py-3">
                      <p className="line-clamp-2 text-[13px] font-medium leading-[18px] text-foreground" title={d.descricao}>{d.descricao}</p>
                      <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground" title={`${d.total_parcelas > 1 ? `Parcela ${d.numero_parcela}/${d.total_parcelas} · ` : ''}vence ${d.vencimento_em.split('-').reverse().join('/')}${d.forma_pagamento ? ` · ${d.forma_pagamento}` : ''}${d.conta_financeira_nome ? ` · ${d.conta_financeira_nome}` : ''}`}>
                        {d.total_parcelas > 1 ? `Parcela ${d.numero_parcela}/${d.total_parcelas} · ` : ''}
                        vence {d.vencimento_em.split('-').reverse().join('/')}
                        {d.forma_pagamento ? ` · ${d.forma_pagamento}` : ''}
                        {d.conta_financeira_nome ? ` · ${d.conta_financeira_nome}` : ''}
                      </p>
                      <div className="mt-1 flex min-w-0 gap-1"><span className="truncate rounded bg-subtle px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{d.categoria}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${d.pago_em ? 'bg-emerald-500/10 text-success' : 'bg-amber-500/10 text-warning'}`}>{d.pago_em ? 'Paga' : 'Pendente'}</span></div>
                    </td>
                    <td className="px-2 py-3 font-mono text-[11px] text-secondary-foreground whitespace-nowrap">{d.vencimento_em.split('-').reverse().join('/')}</td>
                    <td className="px-2 py-3 text-right font-mono text-xs text-destructive whitespace-nowrap">{fmtBRL(d.valor)}</td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" disabled={isPending} onClick={(event) => alternarPagamento(event, d)}
                        className={`w-full rounded px-2 py-1.5 text-[11px] font-medium disabled:opacity-50 ${d.pago_em ? 'bg-subtle text-muted-foreground hover:bg-subtle' : 'bg-emerald-500/10 text-success hover:bg-emerald-500/20'}`}>
                        {d.pago_em ? 'Reabrir' : 'Dar baixa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* Fluxo Capital */}
      <div className="mt-6 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div><h2 className="text-sm font-semibold text-foreground">Aportes & retiradas</h2><p className="mt-1 text-xs text-muted-foreground">{fluxo.length} movimentação(ões) de capital</p></div>
          <button onClick={() => setFluxoModal('new')} className="rounded bg-subtle px-3 py-1.5 text-xs font-medium text-foreground hover:bg-subtle">
            Nova Movimentação
          </button>
        </div>
        <div className="erp-table-scroll">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-3">Movimentação</th><th className="px-4 py-3">Data</th><th className="px-4 py-3 text-right">Valor</th></tr></thead>
              <tbody className="divide-y divide-border">
                {fluxo.length === 0 && (
                  <tr><td colSpan={3} className="py-8 text-center text-xs text-muted-foreground">Nenhuma movimentação.</td></tr>
                )}
                {fluxo.map(f => (
                  <tr key={f.id} className="group hover:bg-subtle cursor-pointer" onClick={() => setFluxoModal(f)}>
                    <td className="p-4">
                      <span className={`inline-block mb-1 rounded px-2 py-0.5 text-[10px] uppercase ${f.tipo==='Aporte' ? 'bg-emerald-500/10 text-success' : 'bg-amber-500/10 text-warning'}`}>{f.tipo}</span>
                      <p className="font-medium text-foreground">{f.descricao || f.tipo}</p>
                      {f.conta_financeira_nome && <p className="mt-1 text-xs text-muted-foreground">{f.conta_financeira_nome}</p>}
                    </td>
                    <td className="p-4 font-mono text-secondary-foreground">{f.data_movimentacao.substring(0,10)}</td>
                    <td className="p-4 text-right font-mono text-foreground">{fmtBRL(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      {recModal && <RecebimentoModal pedidoId={recModal} contas={contas} onClose={() => setRecModal(null)} />}
      {despesaModal && <DespesaModal despesa={despesaModal === 'new' ? null : despesaModal} contas={contas} onClose={() => setDespesaModal(null)} />}
      {fluxoModal && <FluxoCapitalModal fluxo={fluxoModal === 'new' ? null : fluxoModal} contas={contas} onClose={() => setFluxoModal(null)} />}
    </>
  )
}
