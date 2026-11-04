'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  Check, CheckCircle2, ChevronRight, Clock3, MessageCircle,
  Plus, Star, WalletCards, X,
} from 'lucide-react'
import {
  adiarLembreteAgenda, concluirLembreteAgenda, criarLembreteAgenda,
  salvarAvaliacaoPedido, type AgendaDados, type ItemAgenda, type TipoAgenda,
} from '@/app/actions/agenda'
import { WhatsAppModal } from '@/app/components/WhatsAppModal'

const GRUPOS = [
  ['Atrasado', 'Atrasados'], ['Hoje', 'Hoje'], ['Proximos7Dias', 'Próximos 7 dias'], ['Futuro', 'Mais adiante'],
] as const

const CORES: Record<string, string> = {
  Entrega: 'bg-blue-500/10 text-info', Cobranca: 'bg-amber-500/10 text-warning',
  'Follow-up': 'bg-cyan-500/10 text-info', 'Pos-venda': 'bg-violet-500/10 text-accent',
  Outro: 'bg-subtle text-muted-foreground',
}

function dataBr(data: string) {
  return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function proximoDia(data: string) {
  const valor = new Date(`${data}T12:00:00Z`)
  valor.setUTCDate(valor.getUTCDate() + 1)
  return valor.toISOString().slice(0, 10)
}

export function AgendaPage({ agenda }: { agenda: AgendaDados }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [novo, setNovo] = useState(false)
  const [whatsApp, setWhatsApp] = useState<ItemAgenda | null>(null)
  const [avaliar, setAvaliar] = useState<ItemAgenda | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [form, setForm] = useState({ tipo: 'Outro' as TipoAgenda, titulo: '', descricao: '', vencimento_em: agenda.hoje })
  const [avaliacao, setAvaliacao] = useState({ nota: 5, comentario: '' })

  function executar(acao: () => Promise<{ success: boolean; message: string }>, aoConcluir?: () => void) {
    setMensagem('')
    startTransition(async () => {
      const resultado = await acao()
      setMensagem(resultado.message)
      if (resultado.success) {
        aoConcluir?.()
        router.refresh()
      }
    })
  }

  function criar(event: React.FormEvent) {
    event.preventDefault()
    executar(() => criarLembreteAgenda(form), () => {
      setNovo(false)
      setForm({ tipo: 'Outro', titulo: '', descricao: '', vencimento_em: agenda.hoje })
    })
  }

  function registrarAvaliacao(event: React.FormEvent) {
    event.preventDefault()
    if (!avaliar?.pedido_id) return
    executar(() => salvarAvaliacaoPedido({ pedidoId: avaliar.pedido_id!, ...avaliacao }), () => {
      setAvaliar(null)
      setAvaliacao({ nota: 5, comentario: '' })
    })
  }

  return (
    <div className="studio-page mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-3 text-xs text-muted-foreground">Operação / Agenda</p><h1 className="text-3xl font-semibold">Agenda da Salge 3D</h1><p className="mt-2 text-sm text-muted-foreground">Entregas, contas, orçamentos e pós-venda em uma única fila.</p></div>
        <button onClick={() => setNovo(true)} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground"><Plus size={14} /> Novo lembrete</button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Atrasados', agenda.resumo.Atrasado, 'text-destructive'], ['Para hoje', agenda.resumo.Hoje, 'text-warning'],
          ['Próximos 7 dias', agenda.resumo.Proximos7Dias, 'text-info'],
          ['Satisfação média', agenda.avaliacoes.total ? `${agenda.avaliacoes.media}/5` : '—', 'text-accent'],
        ].map(([rotulo, valor, cor]) => <div key={rotulo} className="rounded-2xl border border-border bg-card p-5"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p><p className={`mt-2 text-2xl font-semibold ${cor}`}>{valor}</p></div>)}
      </div>

      {mensagem && <p className="mb-5 rounded-xl border border-border bg-subtle px-4 py-3 text-xs text-secondary-foreground">{mensagem}</p>}

      <div className="space-y-6">
        {GRUPOS.map(([grupo, titulo]) => {
          const itens = agenda.itens.filter((item) => item.grupo === grupo)
          if (itens.length === 0) return null
          return <section key={grupo} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2"><Clock3 size={15} className={grupo === 'Atrasado' ? 'text-destructive' : 'text-accent'} /><h2 className="text-sm font-semibold">{titulo}</h2></div><span className="rounded-full bg-subtle px-2.5 py-1 text-[10px] text-muted-foreground">{itens.length}</span></div>
            <div className="erp-list-scroll divide-y divide-border">{itens.map((item) => <div key={item.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-1 text-[10px] ${CORES[item.tipo]}`}>{item.tipo}</span>{item.origem === 'Automatica' && <span className="text-[9px] uppercase tracking-wider text-muted-foreground">automático</span>}<span className={grupo === 'Atrasado' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{dataBr(item.vencimento_em)}</span></div><p className="mt-2 text-sm font-medium text-secondary-foreground">{item.titulo}</p>{item.descricao && <p className="mt-1 truncate text-xs text-muted-foreground">{item.descricao}</p>}</div>
              {item.valor !== null && <div className="flex items-center gap-2 font-mono text-sm text-warning"><WalletCards size={14} /> {moeda(item.valor)}</div>}
              <div className="flex flex-wrap items-center gap-2">
                {item.whatsapp && item.whatsapp_tipo && <button onClick={() => setWhatsApp(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-success"><MessageCircle size={13} /> WhatsApp</button>}
                {item.permite_avaliacao && <button onClick={() => setAvaliar(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-accent"><Star size={13} /> Avaliar</button>}
                {item.tarefa_id && <><button disabled={isPending} onClick={() => executar(() => adiarLembreteAgenda(item.tarefa_id!, proximoDia(item.vencimento_em)))} className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted-foreground">+1 dia</button><button disabled={isPending} onClick={() => executar(() => concluirLembreteAgenda(item.tarefa_id!))} className="rounded-lg bg-accent/10 p-2 text-accent" aria-label="Concluir lembrete"><Check size={14} /></button></>}
                {item.href && <Link href={item.href} className="rounded-lg p-2 text-muted-foreground hover:text-foreground" aria-label="Abrir detalhes"><ChevronRight size={15} /></Link>}
              </div>
            </div>)}</div>
          </section>
        })}
        {agenda.itens.length === 0 && <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-sm text-muted-foreground"><CheckCircle2 className="text-success" /> Nada pendente na agenda.</div>}
      </div>

      {novo && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"><form onSubmit={criar} className="w-full max-w-lg rounded-2xl border border-border bg-card p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Novo lembrete</h2><p className="mt-1 text-xs text-muted-foreground">Para qualquer tarefa que não venha automaticamente do ERP.</p></div><button type="button" onClick={() => setNovo(false)}><X size={18} /></button></div><div className="space-y-4"><label className="block text-xs text-muted-foreground">Tipo<select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoAgenda })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{['Entrega', 'Cobranca', 'Follow-up', 'Pos-venda', 'Outro'].map(item => <option key={item}>{item}</option>)}</select></label><label className="block text-xs text-muted-foreground">Título<input required maxLength={120} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="block text-xs text-muted-foreground">Data<input required type="date" value={form.vencimento_em} onChange={e => setForm({ ...form, vencimento_em: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="block text-xs text-muted-foreground">Descrição<textarea maxLength={500} rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label><button disabled={isPending} className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground">{isPending ? 'Salvando...' : 'Criar lembrete'}</button></div></form></div>}

      {avaliar && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"><form onSubmit={registrarAvaliacao} className="w-full max-w-lg rounded-2xl border border-border bg-card p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Avaliação do cliente</h2><p className="mt-1 text-xs text-muted-foreground">{avaliar.descricao}</p></div><button type="button" onClick={() => setAvaliar(null)}><X size={18} /></button></div><label className="block text-xs text-muted-foreground">Nota<select value={avaliacao.nota} onChange={e => setAvaliacao({ ...avaliacao, nota: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{[5, 4, 3, 2, 1].map(nota => <option key={nota} value={nota}>{nota} de 5</option>)}</select></label><label className="mt-4 block text-xs text-muted-foreground">Comentário<textarea maxLength={1000} rows={4} value={avaliacao.comentario} onChange={e => setAvaliacao({ ...avaliacao, comentario: e.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label><button disabled={isPending} className="mt-5 w-full rounded-lg bg-violet-400 py-3 text-sm font-semibold text-[#151018]">Registrar avaliação</button></form></div>}

      {whatsApp?.whatsapp && <WhatsAppModal pedido={whatsApp.whatsapp} tipoInicial={whatsApp.whatsapp_tipo ?? undefined} onClose={() => setWhatsApp(null)} />}
    </div>
  )
}
