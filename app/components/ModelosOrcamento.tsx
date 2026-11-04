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
      <div className="mb-8 rounded-xl border border-dashed border-border bg-subtle px-4 py-3 text-xs text-muted-foreground">
        Nenhum modelo salvo. Abra os detalhes de um pedido e use “Salvar como modelo”.
      </div>
    )
  }

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Modelos de orçamento</h2>
        <p className="mt-1 text-xs text-muted-foreground">Reaproveite produto, materiais, tempo, impressora e preço anterior.</p>
      </div>
      {mensagem && <p className="mb-3 text-xs text-secondary-foreground">{mensagem}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modelos.map((modelo) => (
          <div key={modelo.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{modelo.nome}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{modelo.nome_da_peca} · {modelo.quantidade} un.</p>
              <p className="mt-1 text-[11px] text-accent/75">
                {modelo.preco_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/un.
                {modelo.impressora_nome ? ` · ${modelo.impressora_nome}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Link href={`/orcamentos/duplicar/${modelo.pedido_id}`} title="Usar modelo" className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent hover:bg-accent/20">
                <Copy size={14} />
              </Link>
              <button type="button" disabled={isPending} title="Remover modelo" onClick={() => {
                if (!confirm(`Remover o modelo “${modelo.nome}”?`)) return
                startTransition(async () => setMensagem((await arquivarModeloOrcamento(modelo.id)).message))
              }} className="flex size-9 items-center justify-center rounded-lg bg-subtle text-muted-foreground hover:bg-red-500/10 hover:text-destructive disabled:opacity-50">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
