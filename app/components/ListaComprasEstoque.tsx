'use client'

import { useState } from 'react'
import { Check, ClipboardCopy, ShoppingCart } from 'lucide-react'
import type { AlertaEstoque } from '@/app/actions/estoque'

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtNumero(valor: number) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

export function ListaComprasEstoque({
  itens,
  investimento,
}: {
  itens: AlertaEstoque[]
  investimento: number
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiarLista() {
    const linhas = itens.map((item) => {
      const quantidade = item.tipo_item === 'Filamento'
        ? `${item.volumes} rolo${item.volumes === 1 ? '' : 's'} (${fmtNumero(item.quantidade_repor)} g)`
        : `${fmtNumero(item.quantidade_repor)} ${item.unidade}`
      return `- ${item.nome}: ${quantidade}${item.fornecedor ? ` · ${item.fornecedor}` : ''} · ${fmtBRL(item.custo_estimado)}`
    })
    await navigator.clipboard.writeText([
      'Lista de compras — Salge 3D',
      ...linhas,
      `Investimento estimado: ${fmtBRL(investimento)}`,
    ].join('\n'))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  if (itens.length === 0) return null

  return (
    <section className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <ShoppingCart size={16} /> Lista de compras projetada
          </h2>
          <p className="mt-1 text-xs text-white/40">Considera o estoque atual e o consumo dos pedidos aprovados ainda abertos.</p>
        </div>
        <button type="button" onClick={copiarLista} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.06] px-3 text-xs text-white/70 hover:bg-white/[0.1]">
          {copiado ? <Check size={14} className="text-emerald-400" /> : <ClipboardCopy size={14} />}
          {copiado ? 'Lista copiada' : 'Copiar lista'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((item) => (
          <div key={`${item.tipo_item}-${item.item_id}`} className="rounded-xl bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-medium">{item.nome}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-white/30">{item.tipo_item}</p></div>
              <span className="font-mono text-xs text-amber-300">{fmtBRL(item.custo_estimado)}</span>
            </div>
            <div className="mt-3 space-y-1 text-xs text-white/45">
              <p>Atual: {fmtNumero(item.saldo)} {item.unidade}</p>
              <p>Reservado: {fmtNumero(item.comprometido)} {item.unidade}</p>
              <p className={item.saldo_projetado < 0 ? 'text-red-300' : 'text-amber-200'}>Após pedidos: {fmtNumero(item.saldo_projetado)} {item.unidade}</p>
            </div>
            <p className="mt-3 text-xs font-medium text-white/80">
              Comprar {item.tipo_item === 'Filamento'
                ? `${item.volumes} rolo${item.volumes === 1 ? '' : 's'} (${fmtNumero(item.quantidade_repor)} g)`
                : `${fmtNumero(item.quantidade_repor)} ${item.unidade}`}
            </p>
            {item.fornecedor && <p className="mt-1 text-[10px] text-white/30">Fornecedor: {item.fornecedor}</p>}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-amber-300/10 pt-4 text-sm">
        <span className="text-white/45">Investimento estimado</span>
        <b className="font-mono text-lg text-amber-300">{fmtBRL(investimento)}</b>
      </div>
    </section>
  )
}
