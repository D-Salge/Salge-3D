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
  Entrega: 'bg-blue-500/10 text-blue-300', Cobranca: 'bg-amber-500/10 text-amber-300',
  'Follow-up': 'bg-cyan-500/10 text-cyan-300', 'Pos-venda': 'bg-violet-500/10 text-violet-300',
  Outro: 'bg-white/[0.06] text-white/50',
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
    <div className="mx-auto max-w-[1200px] px-5 py-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-3 text-xs text-white/35">Operação / Agenda</p><h1 className="text-3xl font-semibold">Agenda da Salge 3D</h1><p className="mt-2 text-sm text-white/40">Entregas, contas, orçamentos e pós-venda em uma única fila.</p></div>
        <button onClick={() => setNovo(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d]"><Plus size={14} /> Novo lembrete</button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Atrasados', agenda.resumo.Atrasado, 'text-red-300'], ['Para hoje', agenda.resumo.Hoje, 'text-amber-300'],
          ['Próximos 7 dias', agenda.resumo.Proximos7Dias, 'text-blue-300'],
          ['Satisfação média', agenda.avaliacoes.total ? `${agenda.avaliacoes.media}/5` : '—', 'text-[#d8f45a]'],
        ].map(([rotulo, valor, cor]) => <div key={rotulo} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-[10px] uppercase tracking-wider text-white/30">{rotulo}</p><p className={`mt-2 text-2xl font-semibold ${cor}`}>{valor}</p></div>)}
      </div>

      {mensagem && <p className="mb-5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs text-white/65">{mensagem}</p>}

      <div className="space-y-6">
        {GRUPOS.map(([grupo, titulo]) => {
          const itens = agenda.itens.filter((item) => item.grupo === grupo)
          if (itens.length === 0) return null
          return <section key={grupo} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#15171b]">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div className="flex items-center gap-2"><Clock3 size={15} className={grupo === 'Atrasado' ? 'text-red-300' : 'text-[#d8f45a]'} /><h2 className="text-sm font-semibold">{titulo}</h2></div><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/45">{itens.length}</span></div>
            <div className="divide-y divide-white/[0.05]">{itens.map((item) => <div key={item.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2 py-1 text-[10px] ${CORES[item.tipo]}`}>{item.tipo}</span>{item.origem === 'Automatica' && <span className="text-[9px] uppercase tracking-wider text-white/20">automático</span>}<span className={grupo === 'Atrasado' ? 'text-xs text-red-300' : 'text-xs text-white/35'}>{dataBr(item.vencimento_em)}</span></div><p className="mt-2 text-sm font-medium text-white/80">{item.titulo}</p>{item.descricao && <p className="mt-1 truncate text-xs text-white/35">{item.descricao}</p>}</div>
              {item.valor !== null && <div className="flex items-center gap-2 font-mono text-sm text-amber-200"><WalletCards size={14} /> {moeda(item.valor)}</div>}
              <div className="flex flex-wrap items-center gap-2">
                {item.whatsapp && item.whatsapp_tipo && <button onClick={() => setWhatsApp(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><MessageCircle size={13} /> WhatsApp</button>}
                {item.permite_avaliacao && <button onClick={() => setAvaliar(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-300"><Star size={13} /> Avaliar</button>}
                {item.tarefa_id && <><button disabled={isPending} onClick={() => executar(() => adiarLembreteAgenda(item.tarefa_id!, proximoDia(item.vencimento_em)))} className="rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/50">+1 dia</button><button disabled={isPending} onClick={() => executar(() => concluirLembreteAgenda(item.tarefa_id!))} className="rounded-lg bg-[#d8f45a]/10 p-2 text-[#d8f45a]" aria-label="Concluir lembrete"><Check size={14} /></button></>}
                {item.href && <Link href={item.href} className="rounded-lg p-2 text-white/30 hover:text-white" aria-label="Abrir detalhes"><ChevronRight size={15} /></Link>}
              </div>
            </div>)}</div>
          </section>
        })}
        {agenda.itens.length === 0 && <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#15171b] px-6 py-10 text-sm text-white/40"><CheckCircle2 className="text-emerald-400" /> Nada pendente na agenda.</div>}
      </div>

      {novo && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"><form onSubmit={criar} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Novo lembrete</h2><p className="mt-1 text-xs text-white/35">Para qualquer tarefa que não venha automaticamente do ERP.</p></div><button type="button" onClick={() => setNovo(false)}><X size={18} /></button></div><div className="space-y-4"><label className="block text-xs text-white/50">Tipo<select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoAgenda })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{['Entrega', 'Cobranca', 'Follow-up', 'Pos-venda', 'Outro'].map(item => <option key={item}>{item}</option>)}</select></label><label className="block text-xs text-white/50">Título<input required maxLength={120} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="block text-xs text-white/50">Data<input required type="date" value={form.vencimento_em} onChange={e => setForm({ ...form, vencimento_em: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label><label className="block text-xs text-white/50">Descrição<textarea maxLength={500} rows={3} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101114] p-3 text-sm" /></label><button disabled={isPending} className="w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d]">{isPending ? 'Salvando...' : 'Criar lembrete'}</button></div></form></div>}

      {avaliar && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"><form onSubmit={registrarAvaliacao} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Avaliação do cliente</h2><p className="mt-1 text-xs text-white/35">{avaliar.descricao}</p></div><button type="button" onClick={() => setAvaliar(null)}><X size={18} /></button></div><label className="block text-xs text-white/50">Nota<select value={avaliacao.nota} onChange={e => setAvaliacao({ ...avaliacao, nota: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{[5, 4, 3, 2, 1].map(nota => <option key={nota} value={nota}>{nota} de 5</option>)}</select></label><label className="mt-4 block text-xs text-white/50">Comentário<textarea maxLength={1000} rows={4} value={avaliacao.comentario} onChange={e => setAvaliacao({ ...avaliacao, comentario: e.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101114] p-3 text-sm" /></label><button disabled={isPending} className="mt-5 w-full rounded-lg bg-violet-400 py-3 text-sm font-semibold text-[#151018]">Registrar avaliação</button></form></div>}

      {whatsApp?.whatsapp && <WhatsAppModal pedido={whatsApp.whatsapp} tipoInicial={whatsApp.whatsapp_tipo ?? undefined} onClose={() => setWhatsApp(null)} />}
    </div>
  )
}
