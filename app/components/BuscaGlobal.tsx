'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Box, LoaderCircle, Package, ReceiptText, Search, UserRound, X } from 'lucide-react'

type TipoResultadoBusca = 'Pedido' | 'Cliente' | 'Produto' | 'Filamento' | 'Insumo'
interface ResultadoBuscaGlobal {
  id: string
  tipo: TipoResultadoBusca
  titulo: string
  detalhe: string
  href: string
}

const icones: Record<TipoResultadoBusca, typeof ReceiptText> = {
  Pedido: ReceiptText,
  Cliente: UserRound,
  Produto: Box,
  Filamento: Box,
  Insumo: Package,
}

const cores: Record<TipoResultadoBusca, string> = {
  Pedido: 'bg-accent/10 text-accent',
  Cliente: 'bg-blue-500/10 text-info',
  Produto: 'bg-violet-500/10 text-accent',
  Filamento: 'bg-orange-500/10 text-warning',
  Insumo: 'bg-emerald-500/10 text-success',
}

export function BuscaGlobal() {
  const [aberta, setAberta] = useState(false)
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ResultadoBuscaGlobal[]>([])
  const [carregando, setCarregando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const buscaAtual = useRef(0)

  useEffect(() => {
    const atalho = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setAberta((valor) => !valor)
      }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])

  useEffect(() => {
    if (!aberta) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const foco = window.setTimeout(() => inputRef.current?.focus(), 30)
    const fechar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAberta(false)
    }
    window.addEventListener('keydown', fechar)
    return () => {
      window.clearTimeout(foco)
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', fechar)
    }
  }, [aberta])

  useEffect(() => {
    if (!aberta) return
    const valor = termo.trim()
    if (valor.length < 2) return
    const numeroBusca = ++buscaAtual.current
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setCarregando(true)
      fetch(`/api/busca?q=${encodeURIComponent(valor)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('Falha na busca')))
        .then((data: { resultados?: ResultadoBuscaGlobal[] }) => {
          if (numeroBusca === buscaAtual.current) setResultados(data.resultados ?? [])
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name !== 'AbortError' && numeroBusca === buscaAtual.current) setResultados([])
        })
        .finally(() => {
          if (numeroBusca === buscaAtual.current) setCarregando(false)
        })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [aberta, termo])

  function fechar() {
    setAberta(false)
    setTermo('')
    setResultados([])
    setCarregando(false)
  }

  return (
    <>
      <button type="button" onClick={() => setAberta(true)} aria-label="Buscar no ERP" className="flex h-9 items-center gap-2 rounded-lg border border-border bg-subtle px-2.5 text-muted-foreground transition hover:border-border hover:text-secondary-foreground sm:min-w-44 sm:px-3">
        <Search size={14} />
        <span className="hidden flex-1 text-left text-xs sm:block">Buscar no ERP</span>
        <kbd className="hidden rounded border border-border bg-black/20 px-1.5 py-0.5 font-sans text-[9px] text-muted-foreground md:block">Ctrl K</kbd>
      </button>

      {aberta && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Busca global">
          <button type="button" aria-label="Fechar busca" onClick={fechar} className="absolute inset-0 cursor-default" />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/60">
            <div className="flex items-center gap-3 border-b border-border px-4">
              {carregando ? <LoaderCircle size={17} className="animate-spin text-accent" /> : <Search size={17} className="text-muted-foreground" />}
              <input ref={inputRef} value={termo} onChange={(event) => {
                const valor = event.target.value
                setTermo(valor)
                if (valor.trim().length < 2) {
                  buscaAtual.current += 1
                  setResultados([])
                  setCarregando(false)
                }
              }} placeholder="Pedido, cliente, produto ou item de estoque..." className="h-14 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
              <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-lg p-2 text-muted-foreground hover:bg-subtle hover:text-foreground"><X size={16} /></button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-2">
              {termo.trim().length < 2 ? (
                <div className="px-4 py-10 text-center"><p className="text-sm text-muted-foreground">Digite pelo menos duas letras.</p><p className="mt-2 text-xs text-muted-foreground">A busca consulta pedidos, clientes, produtos, filamentos e insumos.</p></div>
              ) : !carregando && resultados.length === 0 ? (
                <div className="px-4 py-10 text-center"><p className="text-sm text-muted-foreground">Nenhum resultado encontrado.</p><p className="mt-2 text-xs text-muted-foreground">Tente o nome do cliente, da peça ou o número do orçamento.</p></div>
              ) : (
                resultados.map((item) => {
                  const Icone = icones[item.tipo]
                  return (
                    <Link key={item.id} href={item.href} onClick={fechar} className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-subtle focus:bg-subtle">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${cores[item.tipo]}`}><Icone size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-secondary-foreground">{item.titulo}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detalhe}</span></span>
                      <span className="shrink-0 rounded bg-subtle px-2 py-1 text-[9px] uppercase tracking-wide text-muted-foreground">{item.tipo}</span>
                    </Link>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

