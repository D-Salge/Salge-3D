/**
 * app/(dashboard)/page.tsx
 * Visão Geral — página inicial do dashboard.   URL: /
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  getDashboardStats,
  getPedidosRecentes,
  type PedidoResumo,
} from '@/app/actions/pedidos'
import {
  TrendingUp,
  ReceiptText,
  DollarSign,
  Wrench,
  Plus,
  ArrowRight,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Visão Geral · Salge 3D',
  description: 'Painel de métricas e histórico de orçamentos.',
}

// ── Formatador ────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Card de métrica ───────────────────────────────────────────────────────────
function MetricCard({
  icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl shadow-black/10">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-white/30">
          {label}
        </span>
        <div
          className={`flex size-9 items-center justify-center rounded-lg ${
            accent
              ? 'bg-[#d8f45a]/10 text-[#d8f45a]'
              : 'bg-white/[0.05] text-white/35'
          }`}
        >
          {icon}
        </div>
      </div>
      <p
        className={`text-3xl font-semibold tracking-[-0.04em] ${
          accent ? 'text-[#d8f45a]' : 'text-white'
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-white/30">{sub}</p>
    </div>
  )
}

// ── Badge de status ───────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  'Fila':        { label: 'Fila',       dot: 'bg-amber-400',  text: 'text-amber-400/80' },
  'Imprimindo':  { label: 'Imprimindo', dot: 'bg-blue-400',   text: 'text-blue-400/80' },
  'Acabamento':  { label: 'Acabamento', dot: 'bg-violet-400', text: 'text-violet-400/80' },
  'Finalizado':  { label: 'Finalizado', dot: 'bg-[#d8f45a]',  text: 'text-[#d8f45a]/80' },
  'Cancelado':   { label: 'Cancelado',  dot: 'bg-red-400',    text: 'text-red-400/80' },
}

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, dot: 'bg-slate-400', text: 'text-slate-400/80' }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      <span className={`text-xs ${cfg.text}`}>{cfg.label}</span>
    </span>
  )
}

// ── Tabela de histórico ───────────────────────────────────────────────────────
function TabelaHistorico({ pedidos }: { pedidos: PedidoResumo[] }) {
  if (pedidos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-white/[0.04] text-3xl">
          📋
        </div>
        <p className="text-sm font-medium text-white/50">Nenhum orçamento ainda</p>
        <p className="mt-1 text-xs text-white/25">
          Crie o primeiro em{' '}
          <Link href="/orcamentos" className="text-[#d8f45a] hover:underline">
            Orçamentos
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {['#', 'Peça', 'Cliente', 'Materiais', 'Status', 'Data', 'Valor'].map((h) => (
              <th
                key={h}
                className="pb-3.5 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 first:pl-0 last:pr-0 last:text-right"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {pedidos.map((p) => (
            <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
              <td className="py-4 pl-0 pr-3 font-mono text-white/20 text-xs">
                #{p.id}
              </td>
              <td className="py-4 px-3 font-medium text-white/90 max-w-[160px] truncate">
                {p.nome_da_peca}
              </td>
              <td className="py-4 px-3 text-white/50">{p.cliente_nome}</td>
              <td className="py-4 px-3 text-white/30 text-xs max-w-[180px] truncate">
                {p.materiais}
              </td>
              <td className="py-4 px-3">
                <StatusDot status={p.status} />
              </td>
              <td className="py-4 px-3 text-white/25 text-xs whitespace-nowrap">
                {new Date(p.data_pedido).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                })}
              </td>
              <td className="py-4 pl-3 pr-0 text-right font-mono font-semibold text-[#d8f45a] whitespace-nowrap">
                {fmtBRL(p.valor_total_cobrado)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default async function VisaoGeralPage() {
  const [stats, pedidos] = await Promise.all([
    getDashboardStats(),
    getPedidosRecentes(10),
  ])

  return (
    <div className="mx-auto max-w-[1320px] px-6 py-9 lg:px-10">

      {/* ── Cabeçalho da página ─────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-white/65">Visão geral</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">
            Visão geral
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Métricas do mês atual e histórico recente.
          </p>
        </div>

        <Link
          href="/orcamentos"
          className="inline-flex items-center gap-2 self-start rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] transition hover:bg-[#e4ff76] sm:self-auto"
        >
          <Plus size={14} />
          Novo orçamento
        </Link>
      </div>

      {/* ── Cards de métricas ───────────────────────────────────────────────── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={<ReceiptText size={17} />}
          label="Pedidos do mês"
          value={String(stats.pedidosMes)}
          sub={`${stats.pedidosTotal} no total histórico`}
        />
        <MetricCard
          icon={<DollarSign size={17} />}
          label="Faturamento bruto"
          value={fmtBRL(stats.faturamentoBruto)}
          sub="Pedidos finalizados neste mês"
          accent
        />
        <MetricCard
          icon={<Wrench size={17} />}
          label="Custos totais"
          value={fmtBRL(stats.custosTotais)}
          sub="Material + máquina dos finalizados"
        />
      </div>

      {/* ── Tabela de histórico ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">

        {/* Header do card */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-[#d8f45a]">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Orçamentos recentes</h2>
              <p className="mt-0.5 text-xs text-white/35">
                Últimos {pedidos.length} registros
              </p>
            </div>
          </div>

          {pedidos.length > 0 && (
            <Link
              href="/orcamentos"
              className="flex items-center gap-1.5 text-xs text-white/35 transition hover:text-[#d8f45a]"
            >
              Ver todos
              <ArrowRight size={13} />
            </Link>
          )}
        </div>

        {/* Tabela */}
        <div className="p-6 sm:p-8">
          <TabelaHistorico pedidos={pedidos} />
        </div>

        {/* Footer com mini-stat */}
        {pedidos.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4 sm:px-8">
            <p className="text-xs text-white/25">
              Margem aparente:{' '}
              <span className="text-white/50 font-medium">
                {stats.faturamentoBruto > 0 && stats.custosTotais > 0
                  ? `${Math.round(((stats.faturamentoBruto - stats.custosTotais) / stats.faturamentoBruto) * 100)}%`
                  : '—'}
              </span>
            </p>
            <p className="text-xs text-white/25">
              Ticket médio:{' '}
              <span className="text-white/50 font-medium">
                {stats.pedidosFinalizadosMes > 0
                  ? fmtBRL(stats.faturamentoBruto / stats.pedidosFinalizadosMes)
                  : '—'}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
