'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Wallet } from 'lucide-react'
import type { RecebimentoResumo } from '@/app/actions/recebimentos'
import type { Despesa, FluxoCapital } from '@/app/actions/despesas'
import { RecebimentoModal } from './RecebimentoModal'
import { DespesaModal } from './DespesaModal'
import { FluxoCapitalModal } from './FluxoCapitalModal'

export function FinanceiroPage({ 
  pendentes, 
  resumoRecebimentos, 
  despesas, 
  resumoDespesas, 
  fluxo 
}: { 
  pendentes: RecebimentoResumo[],
  resumoRecebimentos: { totalRecebidoMes: number, totalPendente: number },
  despesas: Despesa[],
  resumoDespesas: { totalDespesasMes: number, totalAportes: number, totalRetiradas: number },
  fluxo: FluxoCapital[]
}) {
  const [recModal, setRecModal] = useState<number | null>(null)
  const [despesaModal, setDespesaModal] = useState<Despesa | 'new' | null>(null)
  const [fluxoModal, setFluxoModal] = useState<FluxoCapital | 'new' | null>(null)

  const fmtBRL = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
  const saldoOperacional = resumoRecebimentos.totalRecebidoMes - resumoDespesas.totalDespesasMes

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

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            <span className="text-xs font-medium text-white/55">Saldo Operacional</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-white">{fmtBRL(saldoOperacional)}</p>
        </div>

        {/* Inadimplência */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <DollarSign size={18} />
            </div>
            <span className="text-xs font-medium text-white/55">Inadimplência</span>
          </div>
          <p className="text-2xl font-bold tracking-tight text-amber-400">{fmtBRL(resumoRecebimentos.totalPendente)}</p>
        </div>
      </div>

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
                  <tr key={p.pedido_id} className="group hover:bg-white/[0.02]">
                    <td className="p-4">
                      <p className="font-medium text-white">{p.nome_da_peca}</p>
                      <p className="text-xs text-white/50">{p.cliente_nome}</p>
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
            <h2 className="text-sm font-semibold text-white">Despesas do Mês</h2>
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
                      <span className="inline-block mt-1 rounded bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase text-white/50">{d.categoria}</span>
                    </td>
                    <td className="p-4 font-mono text-white/80">{d.data_despesa.substring(0,10)}</td>
                    <td className="p-4 text-right font-mono text-red-400">{fmtBRL(d.valor)}</td>
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
