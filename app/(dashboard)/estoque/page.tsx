import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, History } from 'lucide-react'
import { getResumoEstoque } from '@/app/actions/estoque'
import { LotesFilamento } from '@/app/components/LotesFilamento'

export const metadata: Metadata = { title: 'Movimentações de Estoque · Salge 3D' }

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function EstoquePage() {
  const resumo = await getResumoEstoque()
  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-3 text-xs text-white/35">Estoque / Movimentações</p>
          <h1 className="text-3xl font-semibold tracking-tight">Controle de estoque</h1>
          <p className="mt-2 text-sm text-white/40">Entradas, consumos, ajustes e estornos com rastreabilidade.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/filamentos" className="rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs text-white/70">Filamentos</Link>
          <Link href="/insumos" className="rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d]">Insumos</Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5">
          <Boxes className="mb-3 text-[#d8f45a]" size={18} />
          <p className="text-xs text-white/40">Valor em filamentos</p>
          <p className="mt-1 text-2xl font-semibold">{fmtBRL(resumo.valorEstoqueFilamentos)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5">
          <Boxes className="mb-3 text-blue-400" size={18} />
          <p className="text-xs text-white/40">Valor em insumos</p>
          <p className="mt-1 text-2xl font-semibold">{fmtBRL(resumo.valorEstoqueInsumos)}</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5">
          <AlertTriangle className="mb-3 text-amber-400" size={18} />
          <p className="text-xs text-white/40">Itens abaixo do mínimo</p>
          <p className="mt-1 text-2xl font-semibold text-amber-400">{resumo.alertas.length}</p>
        </div>
      </div>

      {resumo.alertas.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle size={16} /> Reposição necessária
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resumo.alertas.map((item) => (
              <div key={`${item.tipo_item}-${item.item_id}`} className="rounded-xl bg-black/20 p-4">
                <p className="text-sm font-medium">{item.nome}</p>
                <p className="mt-1 text-xs text-white/45">
                  {item.saldo} {item.unidade} disponíveis · mínimo {item.minimo} {item.unidade}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <LotesFilamento lotes={resumo.lotes} filamentos={resumo.filamentos} />

      <div className="rounded-2xl border border-white/[0.08] bg-[#15171b]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5">
          <History size={17} className="text-[#d8f45a]" />
          <div>
            <h2 className="text-sm font-semibold">Histórico de movimentações</h2>
            <p className="text-xs text-white/35">Últimos 100 lançamentos</p>
          </div>
        </div>
        <div className="overflow-x-auto p-6">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/[0.06] text-left text-[10px] uppercase text-white/25">
              <th className="pb-3">Data</th><th className="pb-3">Item</th><th className="pb-3">Movimento</th>
              <th className="pb-3">Quantidade</th><th className="pb-3">Saldo</th><th className="pb-3">Motivo</th>
            </tr></thead>
            <tbody className="divide-y divide-white/[0.04]">
              {resumo.movimentos.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-xs text-white/35">As próximas alterações de estoque aparecerão aqui.</td></tr>}
              {resumo.movimentos.map((movimento) => {
                const entrada = movimento.tipo === 'Entrada' || movimento.tipo === 'Reversao' || movimento.saldo_posterior > movimento.saldo_anterior
                return (
                  <tr key={movimento.id}>
                    <td className="py-3 text-xs text-white/35">{new Date(movimento.criado_em).toLocaleString('pt-BR')}</td>
                    <td className="py-3"><p className="font-medium">{movimento.item_nome}</p><p className="text-[10px] text-white/30">{movimento.tipo_item}{movimento.lote_codigo ? ` · lote ${movimento.lote_codigo}` : ''}</p></td>
                    <td className="py-3"><span className={entrada ? 'text-emerald-400' : 'text-red-400'}>{entrada ? <ArrowUp className="inline" size={13} /> : <ArrowDown className="inline" size={13} />} {movimento.tipo}</span></td>
                    <td className="py-3 font-mono">{movimento.quantidade} {movimento.unidade}</td>
                    <td className="py-3 font-mono text-white/55">{movimento.saldo_anterior} → {movimento.saldo_posterior}</td>
                    <td className="py-3 text-xs text-white/45">{movimento.motivo}{movimento.pedido_id ? ` · Pedido #${movimento.pedido_id}` : ''}</td>
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
