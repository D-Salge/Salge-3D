'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  Archive, Building2, CheckCircle2, PackageCheck, Plus,
  ReceiptText, ShoppingCart, Trash2, TrendingDown, X,
} from 'lucide-react'
import {
  arquivarFornecedor, cancelarCompra, criarCompra, receberCompra, salvarFornecedor,
  type ComprasDados, type FornecedorCompra, type ItemCatalogoCompra, type ItemCompraInput,
} from '@/app/actions/compras'
import type { AlertaEstoque } from '@/app/actions/estoque'

const hoje = new Date().toISOString().slice(0, 10)

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(data: string | null) {
  return data ? new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR') : '—'
}

type LinhaForm = ItemCompraInput & { chave: string }

function linhaCatalogo(item: ItemCatalogoCompra): LinhaForm {
  return {
    chave: `${item.tipo_item}-${item.item_id}-${Date.now()}-${Math.random()}`,
    tipoItem: item.tipo_item, itemId: item.item_id,
    quantidadeVolumes: 1, quantidadeEstoque: item.volume_padrao,
    valorTotal: item.preco_referencia,
  }
}

const fornecedorVazio: Omit<FornecedorCompra, 'id'> = {
  nome: '', documento: '', telefone: '', email: '', site: '', observacoes: '',
}

export function ComprasPage({ dados, sugestoes }: { dados: ComprasDados; sugestoes: AlertaEstoque[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [modalCompra, setModalCompra] = useState(false)
  const [modalFornecedor, setModalFornecedor] = useState(false)
  const [fornecedorEditando, setFornecedorEditando] = useState<number | null>(null)
  const [fornecedor, setFornecedor] = useState(fornecedorVazio)
  const [itens, setItens] = useState<LinhaForm[]>(dados.catalogo[0] ? [linhaCatalogo(dados.catalogo[0])] : [])
  const [compra, setCompra] = useState({
    fornecedorId: dados.fornecedores[0]?.id || 0, pedidoEm: hoje, previsaoEntrega: '',
    frete: 0, desconto: 0, formaPagamento: 'Pix', parcelas: 1, vencimentoEm: hoje, pagoEm: '', observacoes: '',
  })

  const subtotal = useMemo(() => itens.reduce((total, item) => total + Number(item.valorTotal || 0), 0), [itens])
  const total = subtotal + Number(compra.frete || 0) - Number(compra.desconto || 0)

  function executar(acao: () => Promise<{ success: boolean; message: string }>, concluir?: () => void) {
    setMensagem('')
    startTransition(async () => {
      const resultado = await acao()
      setMensagem(resultado.message)
      if (resultado.success) {
        concluir?.()
        router.refresh()
      }
    })
  }

  function editarFornecedor(item?: FornecedorCompra) {
    setFornecedorEditando(item?.id || null)
    setFornecedor(item ? {
      nome: item.nome, documento: item.documento || '', telefone: item.telefone || '',
      email: item.email || '', site: item.site || '', observacoes: item.observacoes || '',
    } : fornecedorVazio)
    setModalFornecedor(true)
  }

  function usarSugestoes() {
    const linhas = sugestoes.flatMap((sugestao) => {
      const item = dados.catalogo.find(c => c.tipo_item === sugestao.tipo_item && c.item_id === sugestao.item_id)
      if (!item) return []
      return [{
        ...linhaCatalogo(item),
        quantidadeVolumes: sugestao.tipo_item === 'Filamento' ? sugestao.volumes : sugestao.quantidade_repor,
        quantidadeEstoque: sugestao.quantidade_repor,
        valorTotal: sugestao.custo_estimado,
      }]
    })
    if (linhas.length) setItens(linhas)
  }

  function alterarCatalogo(indice: number, valor: string) {
    const [tipo, id] = valor.split(':')
    const item = dados.catalogo.find(c => c.tipo_item === tipo && c.item_id === Number(id))
    if (!item) return
    setItens(atuais => atuais.map((linha, i) => i === indice ? { ...linhaCatalogo(item), chave: linha.chave } : linha))
  }

  function salvarCompra(event: React.FormEvent) {
    event.preventDefault()
    executar(() => criarCompra({
      ...compra,
      previsaoEntrega: compra.previsaoEntrega || null,
      pagoEm: compra.pagoEm || null,
      itens,
    }), () => setModalCompra(false))
  }

  function salvarCadastro(event: React.FormEvent) {
    event.preventDefault()
    executar(() => salvarFornecedor(fornecedorEditando, fornecedor), () => setModalFornecedor(false))
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-3 text-xs text-white/35">Estoque / Compras</p><h1 className="text-3xl font-semibold">Compras e fornecedores</h1><p className="mt-2 text-sm text-white/40">Do pedido ao recebimento, com estoque e financeiro integrados.</p></div>
        <div className="flex gap-2"><button onClick={() => editarFornecedor()} className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs text-white/70"><Building2 size={14} /> Fornecedor</button><button onClick={() => setModalCompra(true)} disabled={!dados.fornecedores.length || !dados.catalogo.length} className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] disabled:opacity-40"><Plus size={14} /> Nova compra</button></div>
      </div>

      {mensagem && <p className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs text-white/70">{mensagem}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Compras abertas', dados.resumo.emAberto, 'text-amber-300'],
          ['Valor em aberto', moeda(dados.resumo.valorEmAberto), 'text-amber-300'],
          ['Recebido no mês', moeda(dados.resumo.recebidoMes), 'text-emerald-300'],
          ['Fornecedores ativos', dados.resumo.fornecedores, 'text-[#d8f45a]'],
        ].map(([rotulo, valor, cor]) => <div key={rotulo} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-[10px] uppercase tracking-wider text-white/30">{rotulo}</p><p className={`mt-2 text-2xl font-semibold ${cor}`}>{valor}</p></div>)}
      </div>

      {!dados.fornecedores.length && <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5 text-sm text-amber-100"><b>Cadastre seu primeiro fornecedor.</b><p className="mt-1 text-xs text-white/45">Depois disso, você poderá criar e receber pedidos de compra.</p></div>}

      <section className="mb-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#15171b]">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4"><ShoppingCart size={16} className="text-[#d8f45a]" /><div><h2 className="text-sm font-semibold">Pedidos de compra</h2><p className="text-xs text-white/35">Receber uma compra dá entrada no estoque e cria a despesa.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead><tr className="border-b border-white/[0.05] text-left text-[10px] uppercase text-white/25"><th className="px-5 py-3">Compra</th><th>Fornecedor</th><th>Itens</th><th>Datas</th><th>Total</th><th>Status</th><th className="pr-5 text-right">Ações</th></tr></thead><tbody className="divide-y divide-white/[0.05]">
          {!dados.compras.length && <tr><td colSpan={7} className="px-5 py-10 text-center text-xs text-white/35">Nenhum pedido de compra registrado.</td></tr>}
          {dados.compras.map(item => <tr key={item.id}><td className="px-5 py-4"><p className="font-mono text-xs text-white/75">{item.numero}</p><p className="mt-1 text-[10px] text-white/30">{item.forma_pagamento} · {item.parcelas}x · vence {dataBr(item.vencimento_em)}</p></td><td className="text-xs text-white/65">{item.fornecedor_nome}</td><td className="max-w-[260px]"><p className="truncate text-xs text-white/65" title={item.descricao_itens}>{item.descricao_itens}</p><p className="text-[10px] text-white/30">{item.itens} item(ns)</p></td><td className="text-xs text-white/45"><p>Pedido: {dataBr(item.pedido_em)}</p><p>{item.recebido_em ? `Recebido: ${dataBr(item.recebido_em)}` : `Previsão: ${dataBr(item.previsao_entrega)}`}</p></td><td><p className="font-mono text-sm">{moeda(item.total)}</p>{item.frete > 0 && <p className="text-[10px] text-white/30">frete {moeda(item.frete)}</p>}</td><td><span className={`rounded px-2 py-1 text-[10px] ${item.status === 'Recebido' ? 'bg-emerald-400/10 text-emerald-300' : item.status === 'Cancelado' ? 'bg-red-400/10 text-red-300' : 'bg-amber-400/10 text-amber-300'}`}>{item.status}</span></td><td className="pr-5"><div className="flex justify-end gap-2">{item.status === 'Pedido' && <><button disabled={isPending} onClick={() => executar(() => receberCompra(item.id, hoje))} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><PackageCheck size={13} /> Receber</button><button disabled={isPending} onClick={() => confirm(`Cancelar ${item.numero}?`) && executar(() => cancelarCompra(item.id))} className="rounded-lg bg-white/[0.04] p-2 text-white/35" aria-label="Cancelar compra"><X size={14} /></button></>}</div></td></tr>)}
        </tbody></table></div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><div className="mb-4 flex items-center gap-2"><Building2 size={16} className="text-blue-300" /><h2 className="text-sm font-semibold">Fornecedores</h2></div><div className="space-y-2">{dados.fornecedores.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-black/15 p-3"><button onClick={() => editarFornecedor(item)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm text-white/75">{item.nome}</p><p className="mt-1 truncate text-[10px] text-white/30">{item.telefone || item.email || item.site || 'Sem contato informado'}</p></button><button disabled={isPending} onClick={() => confirm(`Arquivar ${item.nome}?`) && executar(() => arquivarFornecedor(item.id))} className="p-2 text-white/25 hover:text-red-300" aria-label="Arquivar fornecedor"><Archive size={14} /></button></div>)}</div></section>

        <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#15171b]"><div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4"><TrendingDown size={16} className="text-emerald-300" /><div><h2 className="text-sm font-semibold">Comparação de preços</h2><p className="text-xs text-white/35">Histórico real das compras recebidas por fornecedor.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-xs"><thead><tr className="border-b border-white/[0.05] text-left text-[10px] uppercase text-white/25"><th className="px-5 py-3">Item</th><th>Fornecedor</th><th>Último</th><th>Média</th><th>Menor</th><th className="pr-5">Data</th></tr></thead><tbody className="divide-y divide-white/[0.05]">{!dados.historicoPrecos.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-white/35">O comparativo aparecerá após o primeiro recebimento.</td></tr>}{dados.historicoPrecos.map((item, indice) => <tr key={`${item.tipo_item}-${item.item_id}-${item.fornecedor_nome}-${indice}`}><td className="px-5 py-3"><p className="text-white/70">{item.item_nome}</p><p className="text-[9px] text-white/25">por {item.unidade} · {item.compras} compra(s)</p></td><td className="text-white/50">{item.fornecedor_nome}</td><td className="font-mono text-white/70">{moeda(item.preco_ultimo_volume)}</td><td className="font-mono text-white/45">{moeda(item.preco_medio_volume)}</td><td className="font-mono text-emerald-300">{moeda(item.menor_preco_volume)}</td><td className="pr-5 text-white/35">{dataBr(item.ultima_compra)}</td></tr>)}</tbody></table></div></section>
      </div>

      {modalFornecedor && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"><form onSubmit={salvarCadastro} className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">{fornecedorEditando ? 'Editar fornecedor' : 'Novo fornecedor'}</h2><p className="mt-1 text-xs text-white/35">Os contatos e o histórico ficam centralizados aqui.</p></div><button type="button" onClick={() => setModalFornecedor(false)}><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-white/50 sm:col-span-2">Nome<input required maxLength={120} value={fornecedor.nome} onChange={e => setFornecedor({ ...fornecedor, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>{[['documento', 'CPF/CNPJ'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['site', 'Site']].map(([campo, rotulo]) => <label key={campo} className="text-xs text-white/50">{rotulo}<input type={campo === 'email' ? 'email' : 'text'} value={String(fornecedor[campo as keyof typeof fornecedor] || '')} onChange={e => setFornecedor({ ...fornecedor, [campo]: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>)}<label className="text-xs text-white/50 sm:col-span-2">Observações<textarea rows={3} value={fornecedor.observacoes || ''} onChange={e => setFornecedor({ ...fornecedor, observacoes: e.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101114] p-3 text-sm" /></label></div><button disabled={isPending} className="mt-5 w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d]">{isPending ? 'Salvando...' : 'Salvar fornecedor'}</button></form></div>}

      {modalCompra && <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-4"><form onSubmit={salvarCompra} className="mx-auto my-5 w-full max-w-4xl rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Novo pedido de compra</h2><p className="mt-1 text-xs text-white/35">O estoque só muda quando você clicar em Receber.</p></div><button type="button" onClick={() => setModalCompra(false)}><X size={18} /></button></div><div className="grid gap-4 md:grid-cols-3"><label className="text-xs text-white/50">Fornecedor<select required value={compra.fornecedorId} onChange={e => setCompra({ ...compra, fornecedorId: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{dados.fornecedores.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-xs text-white/50">Data do pedido<input required type="date" value={compra.pedidoEm} onChange={e => setCompra({ ...compra, pedidoEm: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Previsão de entrega<input type="date" value={compra.previsaoEntrega} onChange={e => setCompra({ ...compra, previsaoEntrega: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label></div><div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Itens</h3><p className="text-[10px] text-white/30">Informe o valor total de cada linha, não o unitário.</p></div>{sugestoes.length > 0 && <button type="button" onClick={usarSugestoes} className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">Usar sugestões do estoque ({sugestoes.length})</button>}</div><div className="mt-3 space-y-3">{itens.map((linha, indice) => <div key={linha.chave} className="grid gap-3 rounded-xl bg-black/20 p-3 md:grid-cols-[2fr_0.7fr_0.9fr_0.9fr_auto]"><label className="text-[10px] uppercase text-white/30">Item<select value={`${linha.tipoItem}:${linha.itemId}`} onChange={e => alterarCatalogo(indice, e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-2 text-xs">{dados.catalogo.map(item => <option key={`${item.tipo_item}-${item.item_id}`} value={`${item.tipo_item}:${item.item_id}`}>{item.tipo_item} · {item.nome}</option>)}</select></label>{[['quantidadeVolumes', linha.tipoItem === 'Filamento' ? 'Rolos' : 'Volumes'], ['quantidadeEstoque', linha.tipoItem === 'Filamento' ? 'Total (g)' : 'Quantidade'], ['valorTotal', 'Valor total (R$)']].map(([campo, rotulo]) => <label key={campo} className="text-[10px] uppercase text-white/30">{rotulo}<input required type="number" min="0.001" step="0.001" value={linha[campo as keyof ItemCompraInput]} onChange={e => setItens(atuais => atuais.map((item, i) => i === indice ? { ...item, [campo]: Number(e.target.value) } : item))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-2 text-xs" /></label>)}<button type="button" disabled={itens.length === 1} onClick={() => setItens(atuais => atuais.filter((_, i) => i !== indice))} className="mt-5 p-2 text-white/25 hover:text-red-300 disabled:opacity-20" aria-label="Remover item"><Trash2 size={15} /></button></div>)}</div><button type="button" onClick={() => dados.catalogo[0] && setItens(atuais => [...atuais, linhaCatalogo(dados.catalogo[0])])} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/55"><Plus size={13} /> Adicionar item</button><div className="mt-6 grid gap-4 md:grid-cols-4"><label className="text-xs text-white/50">Frete<input type="number" min="0" step="0.01" value={compra.frete} onChange={e => setCompra({ ...compra, frete: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Desconto<input type="number" min="0" step="0.01" value={compra.desconto} onChange={e => setCompra({ ...compra, desconto: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Pagamento<input required maxLength={80} value={compra.formaPagamento} onChange={e => setCompra({ ...compra, formaPagamento: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Parcelas<input required type="number" min="1" max="120" step="1" value={compra.parcelas} onChange={e => setCompra({ ...compra, parcelas: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">1º vencimento<input required type="date" value={compra.vencimentoEm} onChange={e => setCompra({ ...compra, vencimentoEm: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Pago em (opcional)<input type="date" value={compra.pagoEm} onChange={e => setCompra({ ...compra, pagoEm: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50 md:col-span-2">Observações<input maxLength={500} value={compra.observacoes} onChange={e => setCompra({ ...compra, observacoes: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label></div><div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-5"><div className="flex items-center gap-2"><ReceiptText size={16} className="text-[#d8f45a]" /><div><p className="text-[10px] uppercase text-white/30">Total do pedido</p><p className="font-mono text-xl text-[#d8f45a]">{moeda(total)}</p></div></div><button disabled={isPending || total <= 0} className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-5 py-3 text-sm font-semibold text-[#15180d] disabled:opacity-40"><CheckCircle2 size={15} /> {isPending ? 'Salvando...' : 'Criar pedido de compra'}</button></div></form></div>}
    </div>
  )
}
