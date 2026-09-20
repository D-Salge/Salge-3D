'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { arquivarModeloOrcamento, type ModeloOrcamento } from '@/app/actions/modelos-orcamento'

export function ModelosOrcamento({ modelos }: { modelos: ModeloOrcamento[] }) {
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')

  if (modelos.length === 0) {
    return (
      <div className="mb-8 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/35">
        Nenhum modelo salvo. Abra os detalhes de um pedido e use “Salvar como modelo”.
      </div>
    )
  }

  return (
    <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#15171b] p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Modelos de orçamento</h2>
        <p className="mt-1 text-xs text-white/35">Reaproveite produto, materiais, tempo, impressora e preço anterior.</p>
      </div>
      {mensagem && <p className="mb-3 text-xs text-white/55">{mensagem}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modelos.map((modelo) => (
          <div key={modelo.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#101114] p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{modelo.nome}</p>
              <p className="mt-1 truncate text-xs text-white/40">{modelo.nome_da_peca} · {modelo.quantidade} un.</p>
              <p className="mt-1 text-[11px] text-[#d8f45a]/75">
                {modelo.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/un.
                {modelo.impressora_nome ? ` · ${modelo.impressora_nome}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Link href={`/orcamentos/duplicar/${modelo.pedido_id}`} title="Usar modelo" className="flex size-9 items-center justify-center rounded-lg bg-[#d8f45a]/10 text-[#d8f45a] hover:bg-[#d8f45a]/20">
                <Copy size={14} />
              </Link>
              <button type="button" disabled={isPending} title="Remover modelo" onClick={() => {
                if (!confirm(`Remover o modelo “${modelo.nome}”?`)) return
                startTransition(async () => setMensagem((await arquivarModeloOrcamento(modelo.id)).message))
              }} className="flex size-9 items-center justify-center rounded-lg bg-white/[0.05] text-white/35 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
