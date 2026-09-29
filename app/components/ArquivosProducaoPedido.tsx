'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, FileArchive, History, RotateCcw, Trash2, Upload } from 'lucide-react'
import { ativarVersaoArquivo, removerArquivoProducao } from '@/app/actions/arquivos-checklists'
import type { ArquivoProducaoPedido } from '@/app/actions/operacao'

function tamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ArquivosProducaoPedido({ pedidoId, arquivos }: { pedidoId: number; arquivos: ArquivoProducaoPedido[] }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEnviando(true)
    setMensagem('')
    try {
      const response = await fetch(`/api/pedidos/${pedidoId}/arquivos`, { method: 'POST', body: new FormData(event.currentTarget) })
      const result = await response.json() as { message?: string }
      setMensagem(result.message || (response.ok ? 'Arquivo armazenado.' : 'Falha no envio.'))
      if (response.ok) { formRef.current?.reset(); router.refresh() }
    } catch {
      setMensagem('Não foi possível enviar o arquivo.')
    } finally { setEnviando(false) }
  }

  function ativar(id: number) {
    startTransition(async () => {
      const result = await ativarVersaoArquivo(id, pedidoId)
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  function remover(item: ArquivoProducaoPedido) {
    if (!confirm(`Excluir permanentemente “${item.nome_logico}” v${item.versao}?`)) return
    startTransition(async () => {
      const result = await removerArquivoProducao(item.id, pedidoId)
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  return <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
    <div className="mb-4"><h2 className="flex items-center gap-2 font-semibold"><FileArchive size={16} /> Arquivos de produção</h2><p className="mt-1 text-xs leading-5 text-white/35">3MF, STL, imagens e PDF ficam dentro do backup do banco e acompanham os próximos pedidos do mesmo produto. Envie com o mesmo nome lógico para criar uma nova versão.</p></div>
    <form ref={formRef} onSubmit={enviar} className="space-y-3 rounded-xl border border-dashed border-white/10 p-4">
      <input required name="arquivo" type="file" accept=".3mf,.stl,.png,.jpg,.jpeg,.webp,.pdf" className="block w-full text-xs text-white/50 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.07] file:px-3 file:py-2 file:text-xs file:text-white/70" />
      <div className="grid gap-3 sm:grid-cols-2"><input name="nomeLogico" maxLength={160} placeholder="Nome lógico, ex.: Arquivo principal" className="h-10 rounded-lg border border-white/10 bg-[#101114] px-3 text-xs" /><input name="observacoes" maxLength={500} placeholder="Observação da versão" className="h-10 rounded-lg border border-white/10 bg-[#101114] px-3 text-xs" /></div>
      <button disabled={enviando} className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] disabled:opacity-50"><Upload size={13} /> {enviando ? 'Armazenando...' : 'Enviar arquivo'}</button>
    </form>
    {mensagem && <p className="mt-3 rounded-lg bg-white/[0.04] p-3 text-xs text-white/60">{mensagem}</p>}
    <div className="mt-4 space-y-2">{arquivos.map(item => <div key={item.id} className={`rounded-xl border p-3 ${item.ativo ? 'border-[#d8f45a]/20 bg-[#d8f45a]/[0.03]' : 'border-white/[0.05] bg-black/10'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{item.nome_logico} <span className="font-mono text-[#d8f45a]">v{item.versao}</span></p><p className="mt-1 truncate text-[10px] text-white/30">{item.nome_original} · {tamanho(item.tamanho_bytes)} · SHA {item.sha256.slice(0, 10)}…{item.produto_versao ? ` · ficha v${item.produto_versao}` : ''}</p>{item.observacoes && <p className="mt-1 text-[10px] text-white/45">{item.observacoes}</p>}</div><div className="flex shrink-0 items-center gap-1">{item.ativo ? <span title="Versão atual" className="p-2 text-emerald-300"><CheckCircle2 size={14} /></span> : <button disabled={isPending} onClick={() => ativar(item.id)} title="Restaurar esta versão" className="p-2 text-blue-300/70"><RotateCcw size={14} /></button>}<a href={`/api/arquivos/${item.id}`} title="Baixar" className="p-2 text-white/50"><Download size={14} /></a><button disabled={isPending} onClick={() => remover(item)} title="Excluir" className="p-2 text-red-300/50"><Trash2 size={14} /></button></div></div></div>)}{arquivos.length === 0 && <p className="flex items-center justify-center gap-2 py-5 text-xs text-white/30"><History size={13} /> Nenhum arquivo armazenado.</p>}</div>
  </section>
}
