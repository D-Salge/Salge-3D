import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowDown, ArrowUp, Barcode, Boxes, History } from 'lucide-react'
import { getResumoEstoque } from '@/app/actions/estoque'
import { LotesFilamento } from '@/app/components/LotesFilamento'
import { ListaComprasEstoque } from '@/app/components/ListaComprasEstoque'

export const metadata: Metadata = { title: 'Movimentações de Estoque · Salge 3D' }

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function EstoquePage() {
  const resumo = await getResumoEstoque()
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-3 text-xs text-muted-foreground">Estoque / Movimentações</p>
          <h1 className="text-3xl font-semibold tracking-tight">Controle de estoque</h1>
          <p className="mt-2 text-sm text-muted-foreground">Entradas, consumos, ajustes e estornos com rastreabilidade.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/estoque/inventario" className="inline-flex items-center gap-2 rounded-lg bg-blue-500/10 px-4 py-2.5 text-xs text-info"><Barcode size={14} /> Inventário</Link>
          <Link href="/filamentos" className="rounded-lg bg-subtle px-4 py-2.5 text-xs text-secondary-foreground">Filamentos</Link>
          <Link href="/insumos" className="rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground">Insumos</Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <Boxes className="mb-3 text-accent" size={18} />
          <p className="text-xs text-muted-foreground">Valor em filamentos</p>
          <p className="mt-1 text-2xl font-semibold">{fmtBRL(resumo.valorEstoqueFilamentos)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <Boxes className="mb-3 text-info" size={18} />
          <p className="text-xs text-muted-foreground">Valor em insumos</p>
          <p className="mt-1 text-2xl font-semibold">{fmtBRL(resumo.valorEstoqueInsumos)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <AlertTriangle className="mb-3 text-warning" size={18} />
          <p className="text-xs text-muted-foreground">Itens abaixo do mínimo</p>
          <p className="mt-1 text-2xl font-semibold text-warning">{resumo.alertas.length}</p>
        </div>
      </div>

      <ListaComprasEstoque itens={resumo.alertas} investimento={resumo.resumoCompras.investimento} />

      <LotesFilamento lotes={resumo.lotes} filamentos={resumo.filamentos} />

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-6 py-5">
          <History size={17} className="text-accent" />
          <div>
            <h2 className="text-sm font-semibold">Histórico de movimentações</h2>
            <p className="text-xs text-muted-foreground">Últimos 100 lançamentos</p>
          </div>
        </div>
        <div className="erp-table-scroll p-6">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground">
              <th className="pb-3">Data</th><th className="pb-3">Item</th><th className="pb-3">Movimento</th>
              <th className="pb-3">Quantidade</th><th className="pb-3">Saldo</th><th className="pb-3">Motivo</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {resumo.movimentos.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-xs text-muted-foreground">As próximas alterações de estoque aparecerão aqui.</td></tr>}
              {resumo.movimentos.map((movimento) => {
                const entrada = movimento.tipo === 'Entrada' || movimento.tipo === 'Reversao' || movimento.saldo_posterior > movimento.saldo_anterior
                return (
                  <tr key={movimento.id}>
                    <td className="py-3 text-xs text-muted-foreground">{new Date(movimento.criado_em).toLocaleString('pt-BR')}</td>
                    <td className="py-3"><p className="font-medium">{movimento.item_nome}</p><p className="text-[10px] text-muted-foreground">{movimento.tipo_item}{movimento.lote_codigo ? ` · lote ${movimento.lote_codigo}` : ''}</p></td>
                    <td className="py-3"><span className={entrada ? 'text-success' : 'text-destructive'}>{entrada ? <ArrowUp className="inline" size={13} /> : <ArrowDown className="inline" size={13} />} {movimento.tipo}</span></td>
                    <td className="py-3 font-mono">{movimento.quantidade} {movimento.unidade}</td>
                    <td className="py-3 font-mono text-secondary-foreground">{movimento.saldo_anterior} → {movimento.saldo_posterior}</td>
                    <td className="py-3 text-xs text-muted-foreground">{movimento.motivo}{movimento.pedido_id ? ` · Pedido #${movimento.pedido_id}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
