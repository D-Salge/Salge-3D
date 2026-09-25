import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  AtSign,
  CalendarDays,
  Copy,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ReceiptText,
  UserRound,
} from 'lucide-react'
import { getClienteDetalhes } from '@/app/actions/clientes'

export const metadata: Metadata = { title: 'Ficha do cliente · Salge 3D' }

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(valor: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor.split('-').reverse().join('/')
  return new Date(valor).toLocaleDateString('pt-BR')
}

export default async function ClienteDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clienteId = Number(id)
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) notFound()
  const cliente = await getClienteDetalhes(clienteId)
  if (!cliente) notFound()

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/clientes" className="mb-4 inline-flex items-center gap-2 text-xs text-white/40 hover:text-white"><ArrowLeft size={13} /> Voltar para clientes</Link>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-[#d8f45a]/10 text-[#d8f45a]"><UserRound size={20} /></div>
            <div><h1 className="text-3xl font-semibold tracking-[-0.03em]">{cliente.nome}</h1><p className="mt-1 text-xs text-white/35">Cliente desde {cliente.criado_em ? fmtData(cliente.criado_em) : 'data não informada'}</p></div>
          </div>
        </div>
        <Link href={`/orcamentos?cliente=${cliente.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d] hover:bg-[#e4ff76]"><Plus size={14} /> Novo orçamento para este cliente</Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Total vendido', fmtBRL(cliente.total_vendido), 'text-[#d8f45a]'],
          ['Total recebido', fmtBRL(cliente.total_recebido), 'text-emerald-400'],
          ['Saldo pendente', fmtBRL(cliente.saldo_pendente), cliente.saldo_pendente > 0 ? 'text-amber-300' : 'text-white'],
          ['Ticket médio', fmtBRL(cliente.ticket_medio), 'text-white'],
        ].map(([label, value, cor]) => <div key={label} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-xs text-white/35">{label}</p><p className={`mt-2 text-2xl font-semibold ${cor}`}>{value}</p></div>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Pedidos e orçamentos</h2><p className="mt-1 text-xs text-white/35">{cliente.total_pedidos} registro{cliente.total_pedidos === 1 ? '' : 's'} · {cliente.pedidos_aprovados} aprovado{cliente.pedidos_aprovados === 1 ? '' : 's'}</p></div><ReceiptText size={18} className="text-white/25" /></div>
            {cliente.pedidos.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-white/35">Este cliente ainda não possui pedidos.</p> : <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead><tr className="border-b border-white/[0.06]">{['Número', 'Peça', 'Qtd.', 'Total', 'Pendente', 'Status', 'Ações'].map((item) => <th key={item} className="px-2 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 first:pl-0 last:text-right">{item}</th>)}</tr></thead>
                <tbody className="divide-y divide-white/[0.04]">{cliente.pedidos.map((pedido) => <tr key={pedido.id} className="hover:bg-white/[0.02]">
                  <td className="py-3.5 pl-0 pr-2 font-mono text-xs text-white/35">{pedido.numero_orcamento || `#${pedido.id}`}</td>
                  <td className="max-w-[180px] truncate px-2 py-3.5 font-medium text-white/80">{pedido.nome_da_peca}</td>
                  <td className="px-2 py-3.5 text-white/45">{pedido.quantidade}</td>
                  <td className="whitespace-nowrap px-2 py-3.5 font-mono text-xs text-[#d8f45a]">{fmtBRL(pedido.valor_total_cobrado)}</td>
                  <td className={`whitespace-nowrap px-2 py-3.5 font-mono text-xs ${pedido.saldo_pendente > 0 ? 'text-amber-300' : 'text-white/25'}`}>{fmtBRL(pedido.saldo_pendente)}</td>
                  <td className="px-2 py-3.5"><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/55">{pedido.orcamento_status} · {pedido.status}</span></td>
                  <td className="py-3.5 pl-2 text-right"><div className="flex justify-end gap-1.5"><Link href={`/pedidos/${pedido.id}`} className="rounded-md bg-[#d8f45a]/10 px-2 py-1.5 text-xs text-[#d8f45a]">Detalhes</Link><Link title="Duplicar" href={`/orcamentos/duplicar/${pedido.id}`} className="rounded-md bg-white/[0.05] p-1.5 text-white/50"><Copy size={13} /></Link></div></td>
                </tr>)}</tbody>
              </table>
            </div>}
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2"><MessageCircle size={16} className="text-emerald-400" /><div><h2 className="font-semibold">Histórico de contatos</h2><p className="mt-1 text-xs text-white/35">Conversas abertas pelo ERP.</p></div></div>
            {cliente.contatos.length === 0 ? <p className="text-xs text-white/30">Nenhum contato pelo WhatsApp registrado.</p> : <div className="space-y-4">{cliente.contatos.map((contato) => <div key={contato.id} className="border-l border-emerald-400/20 pl-3"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium text-white/75">{contato.evento}</p><Link href={`/pedidos/${contato.pedido_id}`} className="font-mono text-[10px] text-[#d8f45a]/65">{contato.numero_orcamento || `#${contato.pedido_id}`}</Link></div><p className="mt-1 line-clamp-2 text-xs text-white/35">{contato.descricao}</p><p className="mt-1 text-[10px] text-white/20">{new Date(contato.criado_em).toLocaleString('pt-BR')}</p></div>)}</div>}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
            <h2 className="mb-5 font-semibold">Dados do cliente</h2>
            <div className="space-y-4 text-sm">
              <p className="flex items-start gap-3 text-white/55"><Phone size={14} className="mt-0.5 shrink-0 text-white/25" /><span>{cliente.telefone || 'Telefone não informado'}</span></p>
              <p className="flex items-start gap-3 text-white/55"><Mail size={14} className="mt-0.5 shrink-0 text-white/25" /><span className="break-all">{cliente.email || 'E-mail não informado'}</span></p>
              <p className="flex items-start gap-3 text-white/55"><AtSign size={14} className="mt-0.5 shrink-0 text-white/25" /><span>{cliente.instagram || 'Instagram não informado'}</span></p>
              <p className="flex items-start gap-3 text-white/55"><MapPin size={14} className="mt-0.5 shrink-0 text-white/25" /><span>{cliente.cidade || 'Cidade não informada'}</span></p>
              <p className="flex items-start gap-3 text-white/55"><CalendarDays size={14} className="mt-0.5 shrink-0 text-white/25" /><span>Último contato: {cliente.ultimo_contato ? fmtData(cliente.ultimo_contato) : 'não informado'}</span></p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/50">{cliente.tipo_cliente || 'Tipo não informado'}</span><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-white/50">Origem: {cliente.origem || 'não informada'}</span></div>
          </section>
          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6"><h2 className="mb-3 font-semibold">Observações</h2><p className="whitespace-pre-wrap text-sm leading-6 text-white/45">{cliente.observacoes || 'Nenhuma observação cadastrada.'}</p></section>
        </aside>
      </div>
    </div>
  )
}
