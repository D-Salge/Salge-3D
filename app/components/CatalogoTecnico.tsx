'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Archive, Boxes, Clock3, Layers3, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import {
  arquivarProdutoCatalogo, salvarProdutoCatalogo,
  type CatalogoDados, type ProdutoCatalogo,
} from '@/app/actions/catalogo'

type LinhaFicha = {
  chave: string
  tipoItem: 'Filamento' | 'Insumo'
  itemId: number
  quantidadePorUnidade: number
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CatalogoTecnico({ dados }: { dados: CatalogoDados }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<number | null>(null)
  const [form, setForm] = useState({ nome: '', categoria: '', descricao: '', precoBaseUnitario: 0, tempoImpressaoHorasUnidade: 0, observacoesVersao: '' })
  const [itens, setItens] = useState<LinhaFicha[]>([])

  const materiaisPorChave = useMemo(() => new Map(dados.materiais.map(item => [`${item.tipo_item}:${item.item_id}`, item])), [dados.materiais])

  function abrir(produto?: ProdutoCatalogo) {
    setEditando(produto?.id ?? null)
    setForm(produto ? {
      nome: produto.nome, categoria: produto.categoria || '', descricao: produto.descricao || '',
      precoBaseUnitario: produto.preco_base_unitario,
      tempoImpressaoHorasUnidade: produto.tempo_impressao_horas_unidade,
      observacoesVersao: produto.observacoes_versao || '',
    } : { nome: '', categoria: '', descricao: '', precoBaseUnitario: 0, tempoImpressaoHorasUnidade: 0, observacoesVersao: '' })
    setItens(produto?.itens.map(item => ({
      chave: `${item.tipo_item}-${item.item_id}-${Math.random()}`,
      tipoItem: item.tipo_item, itemId: item.item_id, quantidadePorUnidade: item.quantidade_por_unidade,
    })) ?? [])
    setMensagem('')
    setAberto(true)
  }

  function adicionarItem() {
    const disponivel = dados.materiais.find(material => !itens.some(item => item.tipoItem === material.tipo_item && item.itemId === material.item_id))
    if (!disponivel) return
    setItens(atuais => [...atuais, {
      chave: `${disponivel.tipo_item}-${disponivel.item_id}-${Date.now()}`,
      tipoItem: disponivel.tipo_item, itemId: disponivel.item_id, quantidadePorUnidade: 1,
    }])
  }

  function trocarItem(indice: number, valor: string) {
    const [tipo, id] = valor.split(':')
    setItens(atuais => atuais.map((item, i) => i === indice ? {
      ...item, tipoItem: tipo as LinhaFicha['tipoItem'], itemId: Number(id),
    } : item))
  }

  function salvar(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const resultado = await salvarProdutoCatalogo(editando, {
        ...form,
        itens: itens.map(item => ({ tipoItem: item.tipoItem, itemId: item.itemId, quantidadePorUnidade: item.quantidadePorUnidade })),
      })
      setMensagem(resultado.message)
      if (resultado.success) {
        setAberto(false)
        router.refresh()
      }
    })
  }

  function arquivar(produto: ProdutoCatalogo) {
    if (!confirm(`Arquivar a ficha de ${produto.nome}? O histórico será preservado.`)) return
    startTransition(async () => {
      const resultado = await arquivarProdutoCatalogo(produto.id)
      setMensagem(resultado.message)
      if (resultado.success) router.refresh()
    })
  }

  return <>
    {mensagem && !aberto && <p className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/65">{mensagem}</p>}
    <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-semibold"><Layers3 size={16} className="text-[#d8f45a]" /> Catálogo técnico</h2><p className="mt-1 text-xs text-white/35">Preço, tempo e materiais por unidade, com histórico de versões.</p></div>
        <button onClick={() => abrir()} className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d]"><Plus size={14} /> Novo produto</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {dados.produtos.map(produto => {
          const custoMateriais = produto.itens.reduce((total, item) => total + item.quantidade_por_unidade * item.custo_unitario, 0)
          return <article key={produto.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[10px] text-[#d8f45a]">{produto.codigo} · v{produto.versao || 0}</p><h3 className="mt-1 truncate text-sm font-semibold">{produto.nome}</h3><p className="mt-1 text-[10px] text-white/30">{produto.categoria || 'Sem categoria'} · {produto.total_versoes} versão(ões)</p></div><div className="flex"><button onClick={() => abrir(produto)} className="p-2 text-white/35 hover:text-white" aria-label="Editar ficha"><Pencil size={14} /></button><button onClick={() => arquivar(produto)} className="p-2 text-white/25 hover:text-red-300" aria-label="Arquivar ficha"><Archive size={14} /></button></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[9px] uppercase text-white/25">Preço base</p><p className="mt-1 font-mono text-[#d8f45a]">{moeda(produto.preco_base_unitario)}</p></div><div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[9px] uppercase text-white/25">Tempo/un.</p><p className="mt-1 flex items-center gap-1 text-white/65"><Clock3 size={11} /> {produto.tempo_impressao_horas_unidade.toLocaleString('pt-BR')} h</p></div></div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-white/35"><span className="flex items-center gap-1"><Boxes size={11} /> {produto.itens.length} materiais · custo {moeda(custoMateriais)}</span><span>{produto.unidades_vendidas} un. vendidas</span></div>
          </article>
        })}
        {dados.produtos.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/35">Cadastre a primeira ficha técnica.</div>}
      </div>
    </section>

    {aberto && <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-4"><form onSubmit={salvar} className="mx-auto my-5 w-full max-w-3xl rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">{editando ? 'Nova versão da ficha' : 'Novo produto'}</h2><p className="mt-1 text-xs text-white/35">Editar uma ficha existente cria uma nova versão e preserva a anterior.</p></div><button type="button" onClick={() => setAberto(false)}><X size={18} /></button></div>{mensagem && <p className="mb-4 rounded-lg bg-red-400/10 p-3 text-xs text-red-200">{mensagem}</p>}<div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-white/50">Nome<input required maxLength={160} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Categoria<input maxLength={80} placeholder="Ex.: Chaveiro, decoração..." value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Preço base por unidade<input required type="number" min="0" step="0.01" value={form.precoBaseUnitario} onChange={e => setForm({ ...form, precoBaseUnitario: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50">Tempo por unidade (horas)<input required type="number" min="0" step="0.01" value={form.tempoImpressaoHorasUnidade} onChange={e => setForm({ ...form, tempoImpressaoHorasUnidade: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="text-xs text-white/50 sm:col-span-2">Descrição<textarea rows={2} maxLength={1000} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101114] p-3 text-sm" /></label></div><div className="mt-6 flex items-center justify-between"><div><h3 className="text-sm font-semibold">Materiais por unidade</h3><p className="mt-1 text-[10px] text-white/30">A quantidade fica salva nesta versão da ficha.</p></div><button type="button" onClick={adicionarItem} disabled={itens.length >= dados.materiais.length} className="rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/55 disabled:opacity-30"><Plus size={12} className="mr-1 inline" /> Material</button></div><div className="mt-3 space-y-2">{itens.map((item, indice) => <div key={item.chave} className="grid grid-cols-[1fr_130px_auto] gap-2 rounded-lg bg-black/20 p-3"><select value={`${item.tipoItem}:${item.itemId}`} onChange={e => trocarItem(indice, e.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#101114] px-2 text-xs">{dados.materiais.map(material => <option key={`${material.tipo_item}:${material.item_id}`} value={`${material.tipo_item}:${material.item_id}`}>{material.tipo_item} · {material.nome}</option>)}</select><label className="relative"><input required type="number" min="0.001" step="0.001" value={item.quantidadePorUnidade} onChange={e => setItens(atuais => atuais.map((linha, i) => i === indice ? { ...linha, quantidadePorUnidade: Number(e.target.value) } : linha))} className="h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-2 pr-9 text-xs" /><span className="absolute right-2 top-3 text-[9px] text-white/25">{materiaisPorChave.get(`${item.tipoItem}:${item.itemId}`)?.unidade}</span></label><button type="button" onClick={() => setItens(atuais => atuais.filter((_, i) => i !== indice))} className="p-2 text-white/25 hover:text-red-300"><Trash2 size={14} /></button></div>)}</div><label className="mt-5 block text-xs text-white/50">Observações desta versão<textarea rows={3} maxLength={1000} value={form.observacoesVersao} onChange={e => setForm({ ...form, observacoesVersao: e.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101114] p-3 text-sm" /></label><button disabled={isPending} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-40"><Save size={14} /> {isPending ? 'Salvando...' : editando ? 'Salvar nova versão' : 'Cadastrar produto'}</button></form></div>}
  </>
}
