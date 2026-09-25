'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, DollarSign, PackageSearch, Search, ShoppingBag, TrendingUp, Users } from 'lucide-react'
import type { ResumoProduto } from '@/app/actions/produtos'

type Ordenacao = 'faturamento' | 'lucro' | 'unidades' | 'margem' | 'recente'

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ProdutosPage({ produtos }: { produtos: ResumoProduto[] }) {
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('faturamento')

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    return produtos
      .filter((produto) => !termo || produto.nome.toLocaleLowerCase('pt-BR').includes(termo))
      .sort((a, b) => {
        if (ordenacao === 'lucro') return b.lucro - a.lucro
        if (ordenacao === 'unidades') return b.unidades - a.unidades
        if (ordenacao === 'margem') return b.margem_percentual - a.margem_percentual
        if (ordenacao === 'recente') return b.ultima_venda.localeCompare(a.ultima_venda)
        return b.faturamento - a.faturamento
      })
  }, [busca, ordenacao, produtos])

  const totais = useMemo(() => produtos.reduce((acc, produto) => ({
    faturamento: acc.faturamento + produto.faturamento,
    lucro: acc.lucro + produto.lucro,
    unidades: acc.unidades + produto.unidades,
  }), { faturamento: 0, lucro: 0, unidades: 0 }), [produtos])
  const campeao = [...produtos].sort((a, b) => b.unidades - a.unidades)[0]

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-xs text-white/35"><span>Dashboard</span><span>/</span><span className="text-white/65">Produtos</span></div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-[34px]">Produtos e vendas</h1>
        <p className="mt-2 text-sm text-white/40">Veja o que mais vende, quanto fatura e qual retorno cada produto está deixando.</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Produtos vendidos', value: String(produtos.length), icon: <PackageSearch size={17} />, cor: 'text-white' },
          { label: 'Unidades vendidas', value: String(totais.unidades), icon: <ShoppingBag size={17} />, cor: 'text-white' },
          { label: 'Faturamento', value: fmtBRL(totais.faturamento), icon: <DollarSign size={17} />, cor: 'text-[#d8f45a]' },
          { label: 'Lucro estimado', value: fmtBRL(totais.lucro), icon: <TrendingUp size={17} />, cor: totais.lucro >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map((card) => <div key={card.label} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><div className="flex items-center justify-between"><p className="text-xs text-white/35">{card.label}</p><span className="text-white/25">{card.icon}</span></div><p className={`mt-3 text-2xl font-semibold ${card.cor}`}>{card.value}</p></div>)}
      </div>

      {campeao && <div className="mb-6 rounded-xl border border-[#d8f45a]/15 bg-[#d8f45a]/[0.04] px-4 py-3 text-xs text-white/55"><strong className="text-[#d8f45a]">Mais vendido:</strong> {campeao.nome}, com {campeao.unidades} unidade{campeao.unidades === 1 ? '' : 's'} em {campeao.pedidos} pedido{campeao.pedidos === 1 ? '' : 's'}.</div>}

      <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-semibold">Desempenho por produto</h2><p className="mt-1 text-xs text-white/35">Agrupado mesmo quando há diferenças de acento, maiúsculas ou espaços no nome.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><Search size={14} className="absolute left-3 top-3 text-white/25" /><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar produto" className="h-10 w-full rounded-lg border border-white/10 bg-[#101114] pl-9 pr-3 text-xs outline-none focus:border-[#d8f45a]/50 sm:w-56" /></label>
            <select value={ordenacao} onChange={(event) => setOrdenacao(event.target.value as Ordenacao)} className="h-10 rounded-lg border border-white/10 bg-[#101114] px-3 text-xs text-white/65 outline-none">
              <option value="faturamento">Maior faturamento</option><option value="lucro">Maior lucro</option><option value="unidades">Mais unidades</option><option value="margem">Maior margem</option><option value="recente">Venda mais recente</option>
            </select>
          </div>
        </div>

        {filtrados.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/35">{produtos.length === 0 ? 'Nenhum pedido aprovado para analisar.' : 'Nenhum produto encontrado.'}</div> : <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-white/[0.06]">{['Produto', 'Pedidos', 'Unidades', 'Clientes', 'Média/un.', 'Faturamento', 'Lucro', 'Margem', 'Última venda', 'Ação'].map((item) => <th key={item} className="px-2 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 first:pl-0 last:pr-0 last:text-right">{item}</th>)}</tr></thead>
            <tbody className="divide-y divide-white/[0.04]">{filtrados.map((produto) => <tr key={produto.chave} className="hover:bg-white/[0.02]">
              <td className="max-w-[220px] truncate py-4 pl-0 pr-2 font-medium text-white/85">{produto.nome}</td>
              <td className="px-2 py-4 text-white/45">{produto.pedidos}</td>
              <td className="px-2 py-4 text-white/65">{produto.unidades}</td>
              <td className="px-2 py-4"><span className="inline-flex items-center gap-1 text-white/45"><Users size={12} />{produto.clientes}</span></td>
              <td className="whitespace-nowrap px-2 py-4 font-mono text-xs text-white/45">{fmtBRL(produto.receita_media_unidade)}</td>
              <td className="whitespace-nowrap px-2 py-4 font-mono text-xs font-semibold text-[#d8f45a]">{fmtBRL(produto.faturamento)}</td>
              <td className={`whitespace-nowrap px-2 py-4 font-mono text-xs ${produto.lucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtBRL(produto.lucro)}</td>
              <td className={`px-2 py-4 text-xs ${produto.margem_percentual >= 0 ? 'text-white/55' : 'text-red-400'}`}>{produto.margem_percentual.toFixed(1)}%</td>
              <td className="whitespace-nowrap px-2 py-4 text-xs text-white/30">{new Date(produto.ultima_venda).toLocaleDateString('pt-BR')}</td>
              <td className="py-4 pl-2 pr-0 text-right"><Link href={`/orcamentos/duplicar/${produto.ultimo_pedido_id}`} className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 py-2 text-xs text-white/55 hover:bg-white/[0.1] hover:text-white"><Copy size={12} /> Repetir</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>
  )
}
