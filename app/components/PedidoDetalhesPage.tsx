'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ArrowLeft, Copy, ExternalLink, FileDown, Link2, Save, Trash2 } from 'lucide-react'
import {
  atualizarStatusOrcamento,
  removerAnexoPedido,
  salvarAnexoPedido,
  salvarOperacaoPedido,
  type Impressora,
  type PedidoDetalhes,
} from '@/app/actions/operacao'
import { RecebimentoModal } from './RecebimentoModal'
import { atualizarStatusPedido } from '@/app/actions/pedidos'

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PedidoDetalhesPage({ pedido, impressoras }: { pedido: PedidoDetalhes; impressoras: Impressora[] }) {
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [receber, setReceber] = useState(false)
  const [anexoNome, setAnexoNome] = useState('')
  const [anexoUrl, setAnexoUrl] = useState('')
  const [impressoraId, setImpressoraId] = useState(pedido.impressora_id ? String(pedido.impressora_id) : '')
  const [inicioPrevisto, setInicioPrevisto] = useState(pedido.inicio_previsto?.slice(0, 16) ?? '')
  const [fimPrevisto, setFimPrevisto] = useState(pedido.fim_previsto?.slice(0, 16) ?? '')
  const [tempoReal, setTempoReal] = useState(pedido.tempo_real_horas?.toString() ?? '')
  const [custoExtra, setCustoExtra] = useState(String(pedido.custo_extra_real))
  const [falhas, setFalhas] = useState(String(pedido.falhas_impressao))
  const [materiais, setMateriais] = useState(pedido.materiais.map((item) => ({ id: item.id, consumoReal: item.consumo_real_gramas?.toString() ?? '' })))
  const [insumos, setInsumos] = useState(pedido.insumos.map((item) => ({ id: item.id, consumoReal: item.consumo_real?.toString() ?? '' })))

  function mudarOrcamento(status: string) {
    startTransition(async () => {
      const result = await atualizarStatusOrcamento(pedido.id, status)
      setMensagem(result.message)
    })
  }

  function mudarProducao(status: string) {
    if (status === 'Cancelado' && !confirm('Cancelar este pedido? Se já foi finalizado, o estoque consumido será estornado.')) return
    startTransition(async () => {
      const result = await atualizarStatusPedido(pedido.id, status)
      setMensagem(result.message)
    })
  }

  function salvarOperacao(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await salvarOperacaoPedido({
        pedidoId: pedido.id,
        impressoraId: impressoraId ? Number(impressoraId) : null,
        inicioPrevisto,
        fimPrevisto,
        tempoRealHoras: tempoReal === '' ? null : Number(tempoReal),
        custoExtraReal: Number(custoExtra) || 0,
        falhasImpressao: Number(falhas) || 0,
        materiais: materiais.map((item) => ({ id: item.id, consumoReal: item.consumoReal === '' ? null : Number(item.consumoReal) })),
        insumos: insumos.map((item) => ({ id: item.id, consumoReal: item.consumoReal === '' ? null : Number(item.consumoReal) })),
      })
      setMensagem(result.message)
    })
  }

  function adicionarAnexo(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await salvarAnexoPedido({ pedidoId: pedido.id, nome: anexoNome, url: anexoUrl })
      setMensagem(result.message)
      if (result.success) { setAnexoNome(''); setAnexoUrl('') }
    })
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs text-white/40 hover:text-white"><ArrowLeft size={13} /> Voltar</Link><p className="text-xs text-[#d8f45a]">{pedido.numero_orcamento}</p><h1 className="mt-2 text-3xl font-semibold">{pedido.nome_da_peca}</h1><p className="mt-1 text-sm text-white/45">{pedido.cliente_nome} · {pedido.orcamento_status} · {pedido.status}</p></div>
        <div className="flex flex-wrap gap-2"><Link href={`/orcamentos/duplicar/${pedido.id}`} className="flex items-center gap-2 rounded-lg bg-[#d8f45a]/10 px-4 py-2.5 text-xs font-medium text-[#d8f45a]"><Copy size={14} /> Duplicar pedido</Link><a href={`/api/orcamentos/${pedido.id}/pdf`} target="_blank" className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs"><FileDown size={14} /> Baixar PDF</a>{pedido.saldo_pendente > 0 && <button onClick={() => setReceber(true)} className="rounded-lg bg-emerald-500/15 px-4 py-2.5 text-xs font-medium text-emerald-400">Registrar pagamento</button>}</div>
      </div>

      {mensagem && <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">{mensagem}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['Venda', fmtBRL(pedido.valor_total_cobrado)], ['Custo real', fmtBRL(pedido.custo_real)], ['Lucro líquido', fmtBRL(pedido.lucro_liquido)], ['Margem', `${pedido.margem_percentual.toFixed(1)}%`]].map(([label, value], index) => <div key={label} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-xs text-white/35">{label}</p><p className={`mt-2 text-2xl font-semibold ${index >= 2 ? (pedido.lucro_liquido >= 0 ? 'text-[#d8f45a]' : 'text-red-400') : ''}`}>{value}</p></div>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Ciclo do orçamento</h2><p className="mt-1 text-xs text-white/35">Validade: {pedido.validade_orcamento ? new Date(`${pedido.validade_orcamento}T12:00:00`).toLocaleDateString('pt-BR') : 'não definida'}</p></div><div className="flex flex-wrap gap-2">{pedido.orcamento_status === 'Rascunho' && <><button onClick={() => mudarOrcamento('Enviado')} className="rounded-lg bg-blue-500/15 px-3 py-2 text-xs text-blue-300">Marcar enviado</button><button onClick={() => mudarOrcamento('Aprovado')} className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Aprovar</button></>}{pedido.orcamento_status === 'Enviado' && <><button onClick={() => mudarOrcamento('Aprovado')} className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Aprovar</button><button onClick={() => mudarOrcamento('Recusado')} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">Recusado</button></>}{pedido.orcamento_status === 'Expirado' && <><button onClick={() => mudarOrcamento('Enviado')} className="rounded-lg bg-blue-500/15 px-3 py-2 text-xs text-blue-300">Reenviar</button><button onClick={() => mudarOrcamento('Aprovado')} className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Aprovar mesmo assim</button></>}</div></div></section>

          {pedido.orcamento_status === 'Aprovado' && pedido.status !== 'Cancelado' && <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Andamento da produção</h2><p className="mt-1 text-xs text-white/35">Status atual: {pedido.status}</p></div><div className="flex flex-wrap gap-2">{pedido.status === 'Fila' && <button onClick={() => mudarProducao('Imprimindo')} className="rounded-lg bg-blue-500/15 px-3 py-2 text-xs text-blue-300">Iniciar impressão</button>}{pedido.status === 'Imprimindo' && <button onClick={() => mudarProducao('Acabamento')} className="rounded-lg bg-violet-500/15 px-3 py-2 text-xs text-violet-300">Enviar ao acabamento</button>}{pedido.status === 'Acabamento' && <button onClick={() => mudarProducao('Finalizado')} className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Finalizar e baixar estoque</button>}<button onClick={() => mudarProducao('Cancelado')} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">Cancelar pedido</button></div></div></section>}

          <form onSubmit={salvarOperacao} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-5 font-semibold">Planejamento e consumo real</h2><div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-white/50">Impressora<select value={impressoraId} onChange={(e) => setImpressoraId(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3"><option value="">Não atribuída</option>{impressoras.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
            <label className="text-xs text-white/50">Tempo real (horas)<input type="number" min="0" step="0.1" value={tempoReal} onChange={(e) => setTempoReal(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
            <label className="text-xs text-white/50">Início previsto<input type="datetime-local" value={inicioPrevisto} onChange={(e) => setInicioPrevisto(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
            <label className="text-xs text-white/50">Fim previsto<input type="datetime-local" value={fimPrevisto} onChange={(e) => setFimPrevisto(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
            <label className="text-xs text-white/50">Custos extras reais<input type="number" min="0" step="0.01" value={custoExtra} onChange={(e) => setCustoExtra(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
            <label className="text-xs text-white/50">Falhas/reimpressões<input type="number" min="0" step="1" value={falhas} onChange={(e) => setFalhas(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
          </div>
          <div className="mt-6 space-y-3"><p className="text-xs font-medium uppercase text-white/35">Filamentos</p>{pedido.materiais.map((item, index) => <label key={item.id} className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.03] p-3 text-sm"><span>{item.nome}<small className="ml-2 text-white/35">estimado {item.peso_gasto_gramas}g</small></span><input type="number" min="0" step="0.1" placeholder="real (g)" value={materiais[index]?.consumoReal ?? ''} onChange={(e) => setMateriais((lista) => lista.map((valor, i) => i === index ? { ...valor, consumoReal: e.target.value } : valor))} className="h-9 w-28 rounded-lg border border-white/10 bg-[#101114] px-2" /></label>)}</div>
          <div className="mt-6 space-y-3"><p className="text-xs font-medium uppercase text-white/35">Insumos</p>{pedido.insumos.length === 0 && <p className="text-xs text-white/30">Nenhum insumo.</p>}{pedido.insumos.map((item, index) => <label key={item.id} className="flex items-center justify-between gap-4 rounded-lg bg-white/[0.03] p-3 text-sm"><span>{item.nome}<small className="ml-2 text-white/35">estimado {item.quantidade} {item.unidade}</small></span><input type="number" min="0" step="0.1" placeholder="real" value={insumos[index]?.consumoReal ?? ''} onChange={(e) => setInsumos((lista) => lista.map((valor, i) => i === index ? { ...valor, consumoReal: e.target.value } : valor))} className="h-9 w-28 rounded-lg border border-white/10 bg-[#101114] px-2" /></label>)}</div>
          {pedido.status === 'Finalizado' && <p className="mt-5 text-xs text-amber-300">O consumo foi fechado junto com a baixa de estoque e não pode mais ser alterado.</p>}
          <button disabled={isPending || ['Finalizado', 'Cancelado'].includes(pedido.status)} className="mt-6 flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] disabled:opacity-50"><Save size={14} /> Salvar operação</button></form>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-4 font-semibold">Financeiro</h2><div className="space-y-2 text-sm"><p className="flex justify-between text-white/50"><span>Recebido</span><b className="text-emerald-400">{fmtBRL(pedido.total_recebido)}</b></p><p className="flex justify-between text-white/50"><span>Pendente</span><b className="text-amber-400">{fmtBRL(pedido.saldo_pendente)}</b></p></div><div className="mt-5 space-y-2">{pedido.parcelas_receber.map((parcela) => <div key={parcela.id} className="rounded-lg bg-white/[0.03] p-3 text-xs"><div className="flex justify-between"><span>Parcela {parcela.numero}/{pedido.parcelas}</span><b>{fmtBRL(parcela.valor)}</b></div><div className="mt-1 flex justify-between text-white/40"><span>{new Date(`${parcela.vencimento_em}T12:00:00`).toLocaleDateString('pt-BR')}</span><span className={parcela.situacao === 'Pago' ? 'text-emerald-400' : parcela.situacao === 'Atrasado' ? 'text-red-400' : 'text-amber-300'}>{parcela.situacao}{parcela.saldo > 0 ? ` · ${fmtBRL(parcela.saldo)}` : ''}</span></div></div>)}</div></section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Link2 size={15} /> Arquivos e links</h2><form onSubmit={adicionarAnexo} className="space-y-3"><input required placeholder="Nome: Projeto 3MF" value={anexoNome} onChange={(e) => setAnexoNome(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /><input required type="url" placeholder="https://..." value={anexoUrl} onChange={(e) => setAnexoUrl(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /><button className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs">Adicionar link</button></form><div className="mt-4 space-y-2">{pedido.anexos.map((anexo) => <div key={anexo.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3"><a href={anexo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-300">{anexo.nome}<ExternalLink size={11} /></a><button onClick={() => startTransition(async () => setMensagem((await removerAnexoPedido(anexo.id, pedido.id)).message))} className="text-red-400/60"><Trash2 size={13} /></button></div>)}</div></section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-4 font-semibold">Histórico</h2><div className="space-y-4">{pedido.historico.map((item) => <div key={item.id} className="border-l border-white/10 pl-3"><p className="text-xs font-medium">{item.evento}</p><p className="mt-1 text-xs text-white/40">{item.descricao}</p><p className="mt-1 text-[10px] text-white/25">{new Date(item.criado_em).toLocaleString('pt-BR')}</p></div>)}</div></section>
        </div>
      </div>
      {receber && <RecebimentoModal pedidoId={pedido.id} onClose={() => setReceber(false)} />}
    </div>
  )
}
