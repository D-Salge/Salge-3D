'use client'

import { useState, useTransition } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Wallet } from 'lucide-react'
import type { RecebimentoResumo } from '@/app/actions/recebimentos'
import { alterarPagamentoDespesa, type Despesa, type DespesaRecorrente, type FluxoCapital } from '@/app/actions/despesas'
import { RecebimentoModal } from './RecebimentoModal'
import { DespesaModal } from './DespesaModal'
import { FluxoCapitalModal } from './FluxoCapitalModal'
import { ProjecaoFluxoCaixa } from './ProjecaoFluxoCaixa'
import type { ProjecaoFluxoCaixa as Projecao } from '@/app/actions/financeiro'
import { DespesasRecorrentes } from './DespesasRecorrentes'

export function FinanceiroPage({ 
  pendentes, 
  resumoRecebimentos, 
  despesas, 
  despesasRecorrentes,
  resumoDespesas, 
  fluxo,
  projecao,
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
}) {
  const [isPending, startTransition] = useTransition()
  const [recModal, setRecModal] = useState<number | null>(null)
  const [despesaModal, setDespesaModal] = useState<Despesa | 'new' | null>(null)
  const [fluxoModal, setFluxoModal] = useState<FluxoCapital | 'new' | null>(null)
  const [mensagem, setMensagem] = useState('')

  const fmtBRL = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
  const saldoCaixa = resumoRecebimentos.totalRecebido - resumoDespesas.totalDespesasPagas + resumoDespesas.totalAportes - resumoDespesas.totalRetiradas
  const saldoProjetado = saldoCaixa + resumoRecebimentos.totalPendente - resumoDespesas.totalDespesasPendentes

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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
            <span>Sistema</span><span>/</span><span className="text-white/65">Financeiro</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">Financeiro</h1>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-6">
        {/* Recebido */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp size={18} />
            </div>
            <span className="text-xs font-medium text-white/55">Recebido (mês)</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">{fmtBRL(resumoRecebimentos.totalRecebidoMes)}</p>
        </div>

        {/* Despesas */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
              <TrendingDown size={18} />
            </div>
            <span className="text-xs font-medium text-white/55">Despesas (mês)</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">{fmtBRL(resumoDespesas.totalDespesasMes)}</p>
        </div>

        {/* Saldo Operacional */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Wallet size={18} />
            </div>
            <span className="text-xs font-medium text-white/55">Saldo em caixa</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">{fmtBRL(saldoCaixa)}</p>
        </div>

        {/* Inadimplência */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <DollarSign size={18} />
            </div>
            <span className="text-xs font-medium text-white/55">Em atraso</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-amber-400">{fmtBRL(resumoRecebimentos.totalVencido)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-[#d8f45a]/10 text-[#d8f45a]"><TrendingUp size={18} /></div><span className="text-xs font-medium text-white/55">Saldo projetado</span></div>
          <p className="text-2xl font-bold tracking-tight text-[#d8f45a]">{fmtBRL(saldoProjetado)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400"><DollarSign size={18} /></div><span className="text-xs font-medium text-white/55">Receita por competência</span></div>
          <p className="text-2xl font-bold tracking-tight text-white">{fmtBRL(resumoRecebimentos.receitaCompetenciaMes)}</p>
        </div>
      </div>

      {mensagem && <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">{mensagem}</div>}

      <DespesasRecorrentes itens={despesasRecorrentes} />

      <ProjecaoFluxoCaixa projecao={projecao} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pagamentos Pendentes */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5">
            <h2 className="text-sm font-semibold text-white">Pagamentos Pendentes</h2>
          </div>
          <div className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.04]">
                {pendentes.length === 0 && (
                  <tr><td className="py-8 text-center text-xs text-white/40">Nenhum pagamento pendente!</td></tr>
                )}
                {pendentes.map(p => (
                  <tr key={p.parcela_id} className="group hover:bg-white/[0.02]">
                    <td className="p-4">
                      <p className="font-medium text-white">{p.nome_da_peca}</p>
                      <p className="text-xs text-white/50">{p.cliente_nome} · parcela {p.numero_parcela}/{p.total_parcelas} · {p.situacao}{p.vencimento_em ? ` · vence ${p.vencimento_em.split('-').reverse().join('/')}` : ''}</p>
                    </td>
                    <td className="p-4 font-mono text-[#d8f45a]">{fmtBRL(p.saldo_pendente)}</td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => setRecModal(p.pedido_id)}
                        className="rounded bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
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
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
            <h2 className="text-sm font-semibold text-white">Despesas e contas a pagar</h2>
            <button onClick={() => setDespesaModal('new')} className="rounded bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1]">
              Nova Despesa
            </button>
          </div>
          <div className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.04]">
                {despesas.length === 0 && (
                  <tr><td className="py-8 text-center text-xs text-white/40">Nenhuma despesa registrada.</td></tr>
                )}
                {despesas.map(d => (
                  <tr key={d.id} className="group hover:bg-white/[0.02] cursor-pointer" onClick={() => setDespesaModal(d)}>
                    <td className="p-4">
                      <p className="font-medium text-white">{d.descricao}</p>
                      <p className="mt-1 text-xs text-white/40">
                        {d.total_parcelas > 1 ? `Parcela ${d.numero_parcela}/${d.total_parcelas} · ` : ''}
                        vence {d.vencimento_em.split('-').reverse().join('/')}
                        {d.forma_pagamento ? ` · ${d.forma_pagamento}` : ''}
                      </p>
                      <span className="inline-block mt-1 rounded bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase text-white/50">{d.categoria}</span>
                      <span className={`ml-2 inline-block rounded px-2 py-0.5 text-[10px] ${d.pago_em ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{d.pago_em ? 'Paga' : 'Pendente'}</span>
                    </td>
                    <td className="p-4 font-mono text-white/80">{d.vencimento_em.split('-').reverse().join('/')}</td>
                    <td className="p-4 text-right font-mono text-red-400">{fmtBRL(d.valor)}</td>
                    <td className="p-4 text-right">
                      <button type="button" disabled={isPending} onClick={(event) => alternarPagamento(event, d)}
                        className={`rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${d.pago_em ? 'bg-white/[0.05] text-white/50 hover:bg-white/[0.1]' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}>
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
      <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
          <h2 className="text-sm font-semibold text-white">Aportes & Retiradas</h2>
          <button onClick={() => setFluxoModal('new')} className="rounded bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1]">
            Nova Movimentação
          </button>
        </div>
        <div className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.04]">
                {fluxo.length === 0 && (
                  <tr><td className="py-8 text-center text-xs text-white/40">Nenhuma movimentação.</td></tr>
                )}
                {fluxo.map(f => (
                  <tr key={f.id} className="group hover:bg-white/[0.02] cursor-pointer" onClick={() => setFluxoModal(f)}>
                    <td className="p-4">
                      <span className={`inline-block mb-1 rounded px-2 py-0.5 text-[10px] uppercase ${f.tipo==='Aporte' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{f.tipo}</span>
                      <p className="font-medium text-white">{f.descricao || f.tipo}</p>
                    </td>
                    <td className="p-4 font-mono text-white/80">{f.data_movimentacao.substring(0,10)}</td>
                    <td className="p-4 text-right font-mono text-white">{fmtBRL(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      {recModal && <RecebimentoModal pedidoId={recModal} onClose={() => setRecModal(null)} />}
      {despesaModal && <DespesaModal despesa={despesaModal === 'new' ? null : despesaModal} onClose={() => setDespesaModal(null)} />}
      {fluxoModal && <FluxoCapitalModal fluxo={fluxoModal === 'new' ? null : fluxoModal} onClose={() => setFluxoModal(null)} />}
    </>
  )
}
