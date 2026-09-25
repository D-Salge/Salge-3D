'use client'

import { useMemo, useState, useTransition } from 'react'
import { Search, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { excluirPedido, type PedidoResumo } from '@/app/actions/pedidos'
import { RecebimentoModal } from '@/app/components/RecebimentoModal'
import { WhatsAppModal } from '@/app/components/WhatsAppModal'
import type { PedidoWhatsApp } from '@/app/actions/whatsapp'
import Link from 'next/link'
import { filtrarPedidos, resumirPedidos } from '@/lib/filtros-pedidos.mjs'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  'Fila':        { label: 'Fila',       dot: 'bg-amber-400',   text: 'text-amber-400/80' },
  'Imprimindo':  { label: 'Imprimindo', dot: 'bg-blue-400',    text: 'text-blue-400/80' },
  'Acabamento':  { label: 'Acabamento', dot: 'bg-violet-400',  text: 'text-violet-400/80' },
  'Finalizado':  { label: 'Finalizado', dot: 'bg-[#d8f45a]',   text: 'text-[#d8f45a]/80' },
  'Cancelado':   { label: 'Cancelado',  dot: 'bg-red-400',     text: 'text-red-400/80' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, dot: 'bg-slate-400', text: 'text-slate-400/80' }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      <span className={`text-xs ${cfg.text}`}>{cfg.label}</span>
    </span>
  )
}

export function TabelaPedidos({ pedidos }: { pedidos: PedidoResumo[] }) {
  const [modalPedidoId, setModalPedidoId] = useState<number | null>(null)
  const [pedidoWhatsApp, setPedidoWhatsApp] = useState<PedidoWhatsApp | null>(null)
  const [busca, setBusca] = useState('')
  const [orcamento, setOrcamento] = useState('Todos')
  const [producao, setProducao] = useState('Todos')
  const [financeiro, setFinanceiro] = useState('Todos')
  const [isDeleting, startDelete] = useTransition()
  const router = useRouter()

  function handleExcluir(pedido: PedidoResumo) {
    const referencia = pedido.numero_orcamento ?? `#${pedido.id}`
    const aviso = pedido.status === 'Finalizado'
      ? `Excluir permanentemente ${referencia}? Pagamentos, parcelas, anexos e histórico serão removidos. A baixa de estoque deste pedido será estornada.`
      : `Excluir permanentemente ${referencia}? Pagamentos, parcelas, anexos e histórico também serão removidos.`
    if (!confirm(aviso)) return

    startDelete(async () => {
      const resultado = await excluirPedido(pedido.id)
      if (!resultado.success) {
        alert(resultado.message)
        return
      }
      router.refresh()
    })
  }

  const fmtBRL = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
  const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const pedidosFiltrados = useMemo(
    () => filtrarPedidos(pedidos, { busca, orcamento, producao, financeiro }) as PedidoResumo[],
    [pedidos, busca, orcamento, producao, financeiro],
  )
  const resumo = useMemo(() => resumirPedidos(pedidosFiltrados), [pedidosFiltrados])
  const filtrosAtivos = Boolean(busca || orcamento !== 'Todos' || producao !== 'Todos' || financeiro !== 'Todos')

  function limparFiltros() {
    setBusca('')
    setOrcamento('Todos')
    setProducao('Todos')
    setFinanceiro('Todos')
  }

  if (pedidos.length === 0) return <p className="py-8 text-center text-sm text-white/35">Nenhum orçamento cadastrado.</p>

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Resultados</p>
          <p className="mt-1 text-xl font-semibold text-white">{resumo.quantidade}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Valor da carteira</p>
          <p className="mt-1 font-mono text-lg font-semibold text-[#d8f45a]">{fmtBRL(resumo.total)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Recebido</p>
          <p className="mt-1 font-mono text-lg font-semibold text-emerald-400">{fmtBRL(resumo.recebido)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/30">Saldo pendente</p>
          <p className="mt-1 font-mono text-lg font-semibold text-amber-400">{fmtBRL(resumo.pendente)}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_160px_auto]">
        <label className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar número, peça ou cliente"
            className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#101114] pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-[#d8f45a]/50" />
        </label>
        <select value={orcamento} onChange={(event) => setOrcamento(event.target.value)} className="h-10 rounded-lg border border-white/[0.08] bg-[#101114] px-3 text-xs text-white/75 outline-none focus:border-[#d8f45a]/50">
          {['Todos', 'Rascunho', 'Enviado', 'Aprovado', 'Recusado', 'Expirado'].map((item) => <option key={item} value={item}>{item === 'Todos' ? 'Todos os orçamentos' : item}</option>)}
        </select>
        <select value={producao} onChange={(event) => setProducao(event.target.value)} className="h-10 rounded-lg border border-white/[0.08] bg-[#101114] px-3 text-xs text-white/75 outline-none focus:border-[#d8f45a]/50">
          {['Todos', 'Fila', 'Imprimindo', 'Acabamento', 'Finalizado', 'Cancelado'].map((item) => <option key={item} value={item}>{item === 'Todos' ? 'Toda a produção' : item}</option>)}
        </select>
        <select value={financeiro} onChange={(event) => setFinanceiro(event.target.value)} className="h-10 rounded-lg border border-white/[0.08] bg-[#101114] px-3 text-xs text-white/75 outline-none focus:border-[#d8f45a]/50">
          {['Todos', 'Pendente', 'Quitado'].map((item) => <option key={item} value={item}>{item === 'Todos' ? 'Todo financeiro' : item}</option>)}
        </select>
        <button type="button" onClick={limparFiltros} disabled={!filtrosAtivos}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] px-3 text-xs text-white/50 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">
          <X size={14} /> Limpar
        </button>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="w-[120px] pb-3 pl-0 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Número</th>
            <th className="w-[150px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Peça</th>
            <th className="w-[100px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Cliente</th>
            <th className="w-[90px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Total</th>
            <th className="hidden w-[90px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 xl:table-cell">Recebido</th>
            <th className="w-[90px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Orçamento</th>
            <th className="w-[95px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25">Produção</th>
            <th className="hidden w-[75px] px-3 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-white/25 xl:table-cell">Data</th>
            <th className="sticky right-0 z-20 w-[270px] min-w-[270px] bg-[#15171b] pb-3 pl-4 pr-0 text-right text-[10px] font-medium uppercase tracking-wider text-white/25 shadow-[-12px_0_18px_-18px_rgba(0,0,0,0.95)]">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {pedidosFiltrados.map((p) => {
            const isPendente = p.total_recebido < p.valor_total_cobrado

            return (
              <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="py-3.5 pl-0 pr-3 font-mono text-white/35 text-xs whitespace-nowrap">{p.numero_orcamento ?? `#${p.id}`}</td>
                <td className="py-3.5 px-3 font-medium text-white/90 max-w-[140px] truncate">{p.nome_da_peca}</td>
                <td className="py-3.5 px-3 text-white/50">{p.cliente_nome}</td>
                <td className="py-3.5 px-3 font-mono font-semibold text-[#d8f45a] whitespace-nowrap">{fmtBRL(p.valor_total_cobrado)}</td>
                <td className="hidden py-3.5 px-3 font-mono text-xs whitespace-nowrap xl:table-cell">
                   <span className={isPendente ? 'text-amber-400' : 'text-emerald-400'}>{fmtBRL(p.total_recebido)}</span>
                </td>
                <td className="py-3.5 px-3"><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/60">{p.orcamento_status}</span></td>
                <td className="py-3.5 px-3"><StatusBadge status={p.status} /></td>
                <td className="hidden py-3.5 px-3 text-white/25 text-xs whitespace-nowrap xl:table-cell">{fmtData(p.data_pedido)}</td>
                <td className="sticky right-0 z-10 w-[270px] min-w-[270px] bg-[#15171b] py-3.5 pl-4 pr-0 text-right shadow-[-12px_0_18px_-18px_rgba(0,0,0,0.95)] transition-colors group-hover:bg-[#17191d]">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Link href={`/pedidos/${p.id}`} className="inline-flex h-7 items-center rounded-md bg-[#d8f45a]/10 px-2 text-xs font-medium text-[#d8f45a] hover:bg-[#d8f45a]/20">Detalhes</Link>
                    {['Rascunho', 'Enviado'].includes(p.orcamento_status) && <Link href={`/orcamentos/editar/${p.id}`} className="inline-flex h-7 items-center rounded-md bg-blue-500/10 px-2 text-xs font-medium text-blue-300 hover:bg-blue-500/20">Editar</Link>}
                    <Link href={`/orcamentos/duplicar/${p.id}`} className="inline-flex h-7 items-center rounded-md bg-white/[0.05] px-2 text-xs font-medium text-white/60 hover:bg-white/[0.1] hover:text-white">Duplicar</Link>
                    {p.orcamento_status === 'Aprovado' && <button
                      onClick={() => setModalPedidoId(p.id)}
                      className="inline-flex h-7 items-center rounded-md bg-white/[0.05] px-2 text-xs font-medium text-white/60 hover:bg-white/[0.1] hover:text-white"
                      title="Registrar Pagamento"
                    >
                      💰 Pagar
                    </button>}
                    {p.cliente_telefone && (
                      <button
                        type="button"
                        onClick={() => setPedidoWhatsApp({
                          id: p.id,
                          numero_orcamento: p.numero_orcamento,
                          nome_da_peca: p.nome_da_peca,
                          cliente_nome: p.cliente_nome,
                          cliente_telefone: p.cliente_telefone,
                          valor_total_cobrado: p.valor_total_cobrado,
                          total_recebido: p.total_recebido,
                          saldo_pendente: Math.max(0, p.valor_total_cobrado - p.total_recebido),
                          orcamento_status: p.orcamento_status,
                          status: p.status,
                          vencimento_em: p.vencimento_em,
                        })}
                        className="inline-flex h-7 items-center justify-center rounded-md bg-emerald-500/10 px-2 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
                        title="Preparar mensagem pelo WhatsApp"
                      >
                        WhatsApp
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleExcluir(p)}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-red-500/10 px-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                      title="Excluir pedido permanentemente"
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
          {pedidosFiltrados.length === 0 && (
            <tr><td colSpan={9} className="py-12 text-center text-sm text-white/35">Nenhum orçamento corresponde aos filtros.</td></tr>
          )}
        </tbody>
      </table>
      </div>

      {modalPedidoId && (
        <RecebimentoModal pedidoId={modalPedidoId} onClose={() => setModalPedidoId(null)} />
      )}
      {pedidoWhatsApp && (
        <WhatsAppModal key={pedidoWhatsApp.id} pedido={pedidoWhatsApp} onClose={() => setPedidoWhatsApp(null)} />
      )}
    </div>
  )
}
