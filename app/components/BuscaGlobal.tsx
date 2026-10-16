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
  Pedido: 'bg-[#d8f45a]/10 text-[#d8f45a]',
  Cliente: 'bg-blue-500/10 text-blue-300',
  Produto: 'bg-violet-500/10 text-violet-300',
  Filamento: 'bg-orange-500/10 text-orange-300',
  Insumo: 'bg-emerald-500/10 text-emerald-300',
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
      <button type="button" onClick={() => setAberta(true)} aria-label="Buscar no ERP" className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 text-white/40 transition hover:border-white/15 hover:text-white/75 sm:min-w-44 sm:px-3">
        <Search size={14} />
        <span className="hidden flex-1 text-left text-xs sm:block">Buscar no ERP</span>
        <kbd className="hidden rounded border border-white/10 bg-black/20 px-1.5 py-0.5 font-sans text-[9px] text-white/30 md:block">Ctrl K</kbd>
      </button>

      {aberta && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Busca global">
          <button type="button" aria-label="Fechar busca" onClick={fechar} className="absolute inset-0 cursor-default" />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#15171b] shadow-2xl shadow-black/60">
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
              {carregando ? <LoaderCircle size={17} className="animate-spin text-[#d8f45a]" /> : <Search size={17} className="text-white/30" />}
              <input ref={inputRef} value={termo} onChange={(event) => {
                const valor = event.target.value
                setTermo(valor)
                if (valor.trim().length < 2) {
                  buscaAtual.current += 1
                  setResultados([])
                  setCarregando(false)
                }
              }} placeholder="Pedido, cliente, produto ou item de estoque..." className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" />
              <button type="button" onClick={fechar} aria-label="Fechar" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><X size={16} /></button>
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-2">
              {termo.trim().length < 2 ? (
                <div className="px-4 py-10 text-center"><p className="text-sm text-white/45">Digite pelo menos duas letras.</p><p className="mt-2 text-xs text-white/25">A busca consulta pedidos, clientes, produtos, filamentos e insumos.</p></div>
              ) : !carregando && resultados.length === 0 ? (
                <div className="px-4 py-10 text-center"><p className="text-sm text-white/45">Nenhum resultado encontrado.</p><p className="mt-2 text-xs text-white/25">Tente o nome do cliente, da peça ou o número do orçamento.</p></div>
              ) : (
                resultados.map((item) => {
                  const Icone = icones[item.tipo]
                  return (
                    <Link key={item.id} href={item.href} onClick={fechar} className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-white/[0.05] focus:bg-white/[0.05]">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${cores[item.tipo]}`}><Icone size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-white/80">{item.titulo}</span><span className="mt-0.5 block truncate text-xs text-white/35">{item.detalhe}</span></span>
                      <span className="shrink-0 rounded bg-white/[0.04] px-2 py-1 text-[9px] uppercase tracking-wide text-white/30">{item.tipo}</span>
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

