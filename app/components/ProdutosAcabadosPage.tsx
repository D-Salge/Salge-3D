'use client'

import { ajustarEstoqueProdutoAcabado, type EstoqueProdutoAcabado } from '@/app/actions/producao-estoque'
import { gerarIdentificadorOperacao } from '@/lib/identificador-operacao'
import { Boxes, History, PackageCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ProdutosAcabadosPage({ dados }: {
  dados: { produtos: EstoqueProdutoAcabado[]; movimentos: Array<Record<string, unknown>> }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  function ajustar(loteId: number, tipo: 'Perda' | 'Ajuste entrada' | 'Ajuste saída') {
    const quantidade = Number(prompt(`Quantidade para ${tipo.toLowerCase()}:`, '1'))
    if (!Number.isSafeInteger(quantidade) || quantidade <= 0) return
    const motivo = prompt('Motivo do movimento:')?.trim() ?? ''
    if (!motivo) return
    startTransition(async () => {
      const resultado = await ajustarEstoqueProdutoAcabado({ loteId, tipo, quantidade, motivo, operacaoId: gerarIdentificadorOperacao('ajuste') })
      setMensagem(resultado.message)
      if (resultado.success) router.refresh()
    })
  }
  const unidades = dados.produtos.reduce((soma, item) => soma + item.saldo_fisico, 0)
  const disponiveis = dados.produtos.reduce((soma, item) => soma + item.disponivel, 0)
  const valor = dados.produtos.reduce((soma, item) => soma + item.valor_estoque, 0)
  return <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
    <div className="mb-8"><p className="mb-3 text-xs text-white/35">Estoque / Produtos acabados</p><h1 className="text-3xl font-semibold tracking-tight">Produtos acabados</h1><p className="mt-2 text-sm text-white/40">Saldo calculado pelo livro de entradas, saídas, perdas, ajustes e devoluções.</p></div>
    {mensagem && <p role="status" className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">{mensagem}</p>}
    <div className="mb-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><Boxes className="mb-3 text-[#d8f45a]" size={18} /><p className="text-xs text-white/40">Saldo físico</p><p className="mt-1 text-2xl font-semibold">{unidades} un.</p></div><div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><PackageCheck className="mb-3 text-emerald-400" size={18} /><p className="text-xs text-white/40">Disponível para venda</p><p className="mt-1 text-2xl font-semibold">{disponiveis} un.</p></div><div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><Boxes className="mb-3 text-blue-400" size={18} /><p className="text-xs text-white/40">Valor gerencial</p><p className="mt-1 text-2xl font-semibold">{moeda(valor)}</p></div></div>
    <div className="grid gap-4 lg:grid-cols-2">{dados.produtos.map(produto => <article key={`${produto.produto_id}:${produto.produto_versao_id}`} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] text-[#d8f45a]">{produto.codigo} · v{produto.versao}</p><h2 className="mt-1 font-semibold">{produto.produto_nome}</h2></div><span className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">{produto.disponivel} disponível(is)</span></div><div className="mt-4 grid grid-cols-3 gap-3 text-xs"><p><span className="block text-white/30">Físico</span>{produto.saldo_fisico}</p><p><span className="block text-white/30">Reservado</span>{produto.reservado}</p><p><span className="block text-white/30">Custo médio</span>{moeda(produto.custo_medio)}</p></div><div className="mt-4 space-y-2">{produto.lotes.map(lote => <div key={lote.id} className="rounded-lg bg-black/20 p-3 text-xs"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><p><span className="block text-[9px] uppercase text-white/25">Lote</span>{lote.codigo}</p><p><span className="block text-[9px] uppercase text-white/25">Disponível</span>{lote.disponivel}</p><p><span className="block text-[9px] uppercase text-white/25">Reservado</span>{lote.reservado}</p><p><span className="block text-[9px] uppercase text-white/25">Custo/un.</span>{moeda(lote.custo_unitario)}</p></div><div className="mt-3 flex flex-wrap gap-2"><button disabled={isPending} onClick={() => ajustar(lote.id, 'Perda')} className="rounded bg-red-500/10 px-2 py-1 text-[10px] text-red-300 disabled:opacity-40">Registrar perda</button><button disabled={isPending} onClick={() => ajustar(lote.id, 'Ajuste entrada')} className="rounded bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300 disabled:opacity-40">Ajuste de entrada</button><button disabled={isPending} onClick={() => ajustar(lote.id, 'Ajuste saída')} className="rounded bg-white/[0.05] px-2 py-1 text-[10px] text-white/50 disabled:opacity-40">Ajuste de saída</button></div></div>)}</div></article>)}{dados.produtos.length === 0 && <div className="lg:col-span-2 rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-white/35">Conclua uma produção para formar o primeiro saldo.</div>}</div>
    <section className="mt-7 rounded-2xl border border-white/[0.08] bg-[#15171b]"><div className="flex items-center gap-3 border-b border-white/[0.07] p-5"><History size={16} className="text-[#d8f45a]" /><div><h2 className="text-sm font-semibold">Movimentações</h2><p className="text-xs text-white/35">Rastreabilidade entre fabricação, lote e pedido.</p></div></div><div className="erp-table-scroll p-5"><table className="w-full text-sm"><thead><tr className="border-b border-white/[0.06] text-left text-[10px] uppercase text-white/25"><th className="pb-3">Data</th><th className="pb-3">Produto/lote</th><th className="pb-3">Tipo</th><th className="pb-3">Quantidade</th><th className="pb-3">Custo</th><th className="pb-3">Destino</th></tr></thead><tbody className="divide-y divide-white/[0.04]">{dados.movimentos.map(movimento => <tr key={Number(movimento.id)}><td className="py-3 text-xs text-white/35">{new Date(String(movimento.criado_em)).toLocaleString('pt-BR')}</td><td className="py-3"><p>{String(movimento.produto_nome)}</p><p className="text-[10px] text-white/30">{String(movimento.lote_codigo)}</p></td><td className="py-3">{String(movimento.tipo)}</td><td className="py-3 font-mono">{Number(movimento.quantidade)} un.</td><td className="py-3">{moeda(Number(movimento.custo_total))}</td><td className="py-3 text-xs text-white/40">{movimento.pedido_id ? `Pedido #${movimento.pedido_id}` : String(movimento.motivo)}</td></tr>)}</tbody></table></div></section>
  </div>
}

