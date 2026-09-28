'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Barcode, Check, ClipboardList, Printer, X } from 'lucide-react'
import { barrasCode39 } from '@/lib/barcode.mjs'
import { cancelarInventario, concluirInventario, iniciarInventario, registrarContagem, type EtiquetaEstoque, type InventarioAtual } from '@/app/actions/inventario'

function CodigoBarras({ codigo }: { codigo: string }) {
  const desenho = useMemo(() => barrasCode39(codigo, 1.4, 3.5, 42), [codigo])
  return <svg viewBox={`0 0 ${desenho.largura} 58`} role="img" aria-label={`Código de barras ${codigo}`} className="h-16 w-full max-w-[220px] bg-white p-1 text-black"><g fill="currentColor">{desenho.barras.map((barra: { x: number; largura: number; altura: number }, index: number) => <rect key={index} x={barra.x} y="0" width={barra.largura} height={barra.altura} />)}</g><text x={desenho.largura / 2} y="55" textAnchor="middle" fontSize="8" fontFamily="monospace" fill="currentColor">{codigo}</text></svg>
}

export function InventarioEstoque({ atual, etiquetas }: { atual: InventarioAtual | null; etiquetas: EtiquetaEstoque[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [descricao, setDescricao] = useState('Contagem geral')
  const [codigo, setCodigo] = useState('')
  const [saldo, setSaldo] = useState('')
  const contados = atual?.itens.filter((item) => item.saldo_contado !== null).length ?? 0

  function iniciar(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => { const result = await iniciarInventario(descricao); setMensagem(result.message); if (result.success) router.refresh() })
  }
  function contar(event: React.FormEvent) {
    event.preventDefault()
    if (!atual) return
    startTransition(async () => {
      const result = await registrarContagem(atual.id, codigo, Number(saldo))
      setMensagem(result.message)
      if (result.success) { setCodigo(''); setSaldo(''); router.refresh() }
    })
  }
  function concluir() {
    if (!atual || !confirm('Concluir a contagem e aplicar todas as diferenças ao estoque?')) return
    startTransition(async () => { const result = await concluirInventario(atual.id); setMensagem(result.message); if (result.success) router.refresh() })
  }
  function cancelar() {
    if (!atual || !confirm('Cancelar esta contagem sem alterar o estoque?')) return
    startTransition(async () => { const result = await cancelarInventario(atual.id); setMensagem(result.message); if (result.success) router.refresh() })
  }

  return <>
    {mensagem && <p className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/65">{mensagem}</p>}
    {!atual ? <form onSubmit={iniciar} className="mb-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="flex items-center gap-2 font-semibold"><ClipboardList size={17} className="text-[#d8f45a]" /> Nova contagem</h2><p className="mt-1 text-xs text-white/35">O ERP congela uma fotografia do saldo de todos os itens; só altera o estoque quando você concluir.</p><div className="mt-5 flex flex-wrap items-end gap-3"><label className="min-w-[240px] flex-1 text-xs text-white/45">Descrição<input required maxLength={200} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><button disabled={isPending} className="h-10 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d] disabled:opacity-50">Iniciar inventário</button></div></form> : <section className="mb-6 rounded-2xl border border-[#d8f45a]/15 bg-[#15171b] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs text-[#d8f45a]">{atual.codigo}</p><h2 className="mt-1 font-semibold">{atual.descricao}</h2><p className="mt-1 text-xs text-white/35">{contados} de {atual.itens.length} itens contados. Digite ou leia o código da etiqueta.</p></div><div className="flex gap-2"><button disabled={isPending} onClick={cancelar} className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-500/10 px-3 text-xs text-red-300"><X size={13} /> Cancelar</button><button disabled={isPending || contados !== atual.itens.length} onClick={concluir} className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500/10 px-3 text-xs text-emerald-300 disabled:opacity-40"><Check size={13} /> Concluir e ajustar</button></div></div>
      <form onSubmit={contar} className="mt-5 grid gap-3 rounded-xl bg-white/[0.025] p-4 sm:grid-cols-[1fr_180px_auto]"><label className="text-xs text-white/45">Código do item<input autoFocus required value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="FIL-000001" className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3 font-mono" /></label><label className="text-xs text-white/45">Saldo contado<input required type="number" min="0" step="0.001" value={saldo} onChange={(e) => setSaldo(e.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><button disabled={isPending} className="mt-auto h-10 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d]">Registrar</button></form>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{atual.itens.map((item) => <div key={item.id} className="rounded-lg bg-white/[0.025] p-3 text-xs"><div className="flex justify-between gap-2"><span className="truncate font-medium">{item.nome}</span><span className="font-mono text-white/35">{item.codigo_item}</span></div><p className="mt-1 text-white/35">Sistema: {item.saldo_sistema} {item.unidade} · <span className={item.saldo_contado === null ? 'text-amber-300' : item.saldo_contado === item.saldo_sistema ? 'text-emerald-300' : 'text-blue-300'}>{item.saldo_contado === null ? 'pendente' : `contado ${item.saldo_contado}`}</span></p></div>)}</div>
    </section>}

    <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 print:border-0 print:bg-white print:text-black"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold"><Barcode size={17} /> Etiquetas de estoque</h2><p className="mt-1 text-xs text-white/35 print:text-black/60">Códigos permanentes para leitura manual ou com leitor Code 39.</p></div><button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/[0.06] px-3 text-xs print:hidden"><Printer size={14} /> Imprimir etiquetas</button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">{etiquetas.map((item) => <div key={item.codigo} className="rounded-xl border border-white/10 bg-white p-3 text-black break-inside-avoid"><p className="truncate text-xs font-semibold">{item.nome}</p><p className="mt-0.5 text-[9px] text-black/55">{item.tipo_item} · {item.saldo} {item.unidade}</p><CodigoBarras codigo={item.codigo} /></div>)}</div></section>
  </>
}
