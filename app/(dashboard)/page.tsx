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
import { getCentralPendencias } from '@/app/actions/pendencias'
import { CentralPendencias } from '@/app/components/CentralPendencias'
import { getDespesasRecorrentes } from '@/app/actions/despesas'
import {
  TrendingUp,
  ReceiptText,
  DollarSign,
  Wrench,
  Plus,
  ArrowRight,
  AlertTriangle,
  PackageSearch,
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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <div
          className={`flex size-9 items-center justify-center rounded-lg ${
            accent
              ? 'bg-accent/10 text-accent'
              : 'bg-subtle text-muted-foreground'
          }`}
        >
          {icon}
        </div>
      </div>
      <p
        className={`text-3xl font-semibold tracking-[-0.04em] ${
          accent ? 'text-accent' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

// ── Badge de status ───────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  'Fila':        { label: 'Fila',       dot: 'bg-amber-400',  text: 'text-warning' },
  'Imprimindo':  { label: 'Imprimindo', dot: 'bg-blue-400',   text: 'text-info' },
  'Acabamento':  { label: 'Acabamento', dot: 'bg-violet-400', text: 'text-accent' },
  'Finalizado':  { label: 'Finalizado', dot: 'bg-accent',  text: 'text-accent/80' },
  'Cancelado':   { label: 'Cancelado',  dot: 'bg-red-400',    text: 'text-destructive' },
  'Rascunho':    { label: 'Rascunho',   dot: 'bg-slate-400',  text: 'text-muted-foreground' },
  'Enviado':     { label: 'Enviado',    dot: 'bg-cyan-400',   text: 'text-info' },
  'Recusado':    { label: 'Recusado',   dot: 'bg-red-400',    text: 'text-destructive' },
  'Expirado':    { label: 'Expirado',   dot: 'bg-orange-400', text: 'text-warning' },
}

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, dot: 'bg-slate-400', text: 'text-muted-foreground' }
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
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-subtle text-3xl">
          📋
        </div>
        <p className="text-sm font-medium text-muted-foreground">Nenhum orçamento ainda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Crie o primeiro em{' '}
          <Link href="/orcamentos" className="text-accent hover:underline">
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
          <tr className="border-b border-border">
            {['#', 'Peça', 'Cliente', 'Materiais', 'Status', 'Data', 'Valor'].map((h) => (
              <th
                key={h}
                className="pb-3.5 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground first:pl-0 last:pr-0 last:text-right"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {pedidos.map((p) => (
            <tr key={p.id} className="group hover:bg-subtle transition-colors">
              <td className="py-4 pl-0 pr-3 font-mono text-muted-foreground text-xs">
                <Link href={`/pedidos/${p.id}`} className="hover:text-accent">{p.numero_orcamento ?? `#${p.id}`}</Link>
              </td>
              <td className="py-4 px-3 font-medium text-foreground max-w-[160px] truncate">
                {p.nome_da_peca}
              </td>
              <td className="py-4 px-3 text-muted-foreground">{p.cliente_nome}</td>
              <td className="py-4 px-3 text-muted-foreground text-xs max-w-[180px] truncate">
                {p.materiais}
              </td>
              <td className="py-4 px-3">
                <StatusDot status={p.orcamento_status === 'Aprovado' ? p.status : p.orcamento_status} />
              </td>
              <td className="py-4 px-3 text-muted-foreground text-xs whitespace-nowrap">
                {new Date(p.data_pedido).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                })}
              </td>
              <td className="py-4 pl-3 pr-0 text-right font-mono font-semibold text-accent whitespace-nowrap">
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
  // Garante a geração das contas fixas do mês mesmo que o Financeiro não seja aberto.
  await getDespesasRecorrentes()
  const [stats, pedidos, pendencias] = await Promise.all([
    getDashboardStats(),
    getPedidosRecentes(10),
    getCentralPendencias(),
  ])

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">

      {/* ── Cabeçalho da página ─────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-secondary-foreground">Visão geral</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">
            Tudo em ordem. <span className="text-accent">Vamos criar?</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Seu ateliê em um olhar: métricas do mês e pedidos recentes.
          </p>
        </div>

        <Link
          href="/orcamentos"
          className="inline-flex items-center gap-2 self-start rounded-full bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition hover:bg-accent-hover sm:self-auto"
        >
          <Plus size={14} />
          Novo orçamento
        </Link>
      </div>

      {/* ── Cards de métricas ───────────────────────────────────────────────── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          sub="Operação + estoque dos finalizados"
        />
        <MetricCard
          icon={<TrendingUp size={17} />}
          label="Lucro líquido"
          value={fmtBRL(stats.lucroLiquido)}
          sub={`Margem média de ${stats.margemMedia.toFixed(1)}%`}
          accent
        />
        <MetricCard
          icon={<PackageSearch size={17} />}
          label="Reposição de estoque"
          value={String(stats.estoqueBaixo)}
          sub="Filamentos e insumos abaixo do mínimo"
        />
        <MetricCard
          icon={<AlertTriangle size={17} />}
          label="Pendências"
          value={String(stats.orcamentosPendentes + stats.pedidosAtrasados)}
          sub={`${stats.orcamentosPendentes} orçamentos · ${stats.pedidosAtrasados} atrasados`}
        />
      </div>

      <CentralPendencias pendencias={pendencias} />

      {/* ── Tabela de histórico ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">

        {/* Header do card */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-subtle text-accent">
              <TrendingUp size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Orçamentos recentes</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Últimos {pedidos.length} registros
              </p>
            </div>
          </div>

          {pedidos.length > 0 && (
            <Link
              href="/orcamentos"
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-accent"
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
          <div className="flex items-center justify-between border-t border-border px-6 py-4 sm:px-8">
            <p className="text-xs text-muted-foreground">
              Margem aparente:{' '}
              <span className="text-muted-foreground font-medium">
                {stats.faturamentoBruto > 0
                  ? `${Math.round(((stats.faturamentoBruto - stats.custosTotais) / stats.faturamentoBruto) * 100)}%`
                  : '—'}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Ticket médio:{' '}
              <span className="text-muted-foreground font-medium">
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
