'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, ArrowLeft, BookmarkPlus, Copy, ExternalLink, FileDown, Link2, MessageCircle, PackageCheck, Pencil, Save, Trash2, X } from 'lucide-react'
import {
  atualizarStatusOrcamento,
  removerAnexoPedido,
  salvarAnexoPedido,
  salvarOperacaoPedido,
  type Impressora,
  type PedidoDetalhes,
} from '@/app/actions/operacao'
import { RecebimentoModal } from './RecebimentoModal'
import { atualizarStatusPedido, excluirPedido } from '@/app/actions/pedidos'
import { salvarModeloOrcamento } from '@/app/actions/modelos-orcamento'
import { WhatsAppModal } from './WhatsAppModal'

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PedidoDetalhesPage({ pedido, impressoras }: { pedido: PedidoDetalhes; impressoras: Impressora[] }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [mensagem, setMensagem] = useState('')
  const [receber, setReceber] = useState(false)
  const [whatsApp, setWhatsApp] = useState(false)
  const [salvarModelo, setSalvarModelo] = useState(false)
  const [nomeModelo, setNomeModelo] = useState(pedido.nome_da_peca)
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
      const result = await salvarOperacaoPedido(montarPayloadOperacao(false))
      setMensagem(result.message)
    })
  }

  function montarPayloadOperacao(usarEstimativas: boolean) {
    return {
        pedidoId: pedido.id,
        impressoraId: impressoraId ? Number(impressoraId) : null,
        inicioPrevisto,
        fimPrevisto,
        tempoRealHoras: tempoReal === ''
          ? (usarEstimativas ? pedido.tempo_impressao_horas : null)
          : Number(tempoReal),
        custoExtraReal: Number(custoExtra) || 0,
        falhasImpressao: Number(falhas) || 0,
        materiais: materiais.map((item, index) => ({
          id: item.id,
          consumoReal: item.consumoReal === ''
            ? (usarEstimativas ? pedido.materiais[index].peso_gasto_gramas : null)
            : Number(item.consumoReal),
        })),
        insumos: insumos.map((item, index) => ({
          id: item.id,
          consumoReal: item.consumoReal === ''
            ? (usarEstimativas ? pedido.insumos[index].quantidade : null)
            : Number(item.consumoReal),
        })),
      }
  }

  function finalizarComRevisao() {
    const camposEstimados = [
      tempoReal === '',
      ...materiais.map((item) => item.consumoReal === ''),
      ...insumos.map((item) => item.consumoReal === ''),
    ].filter(Boolean).length
    const aviso = camposEstimados > 0
      ? `${camposEstimados} campo(s) sem valor real serão preenchidos com a estimativa do orçamento. Depois da baixa de estoque, os consumos ficarão bloqueados. Finalizar?`
      : 'Os consumos reais informados serão usados na baixa de estoque e ficarão bloqueados. Finalizar o pedido?'
    if (!confirm(aviso)) return

    startTransition(async () => {
      const operacao = await salvarOperacaoPedido(montarPayloadOperacao(true))
      if (!operacao.success) {
        setMensagem(operacao.message)
        return
      }
      const status = await atualizarStatusPedido(pedido.id, 'Finalizado')
      setMensagem(status.message)
      if (status.success) router.refresh()
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

  function criarModelo(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await salvarModeloOrcamento(pedido.id, nomeModelo)
      setMensagem(result.message)
      if (result.success) setSalvarModelo(false)
    })
  }

  function excluirPedidoAtual() {
    const referencia = pedido.numero_orcamento || `#${pedido.id}`
    const aviso = pedido.status === 'Finalizado'
      ? `Excluir permanentemente ${referencia}? Pagamentos, parcelas, anexos e histórico serão removidos. A baixa de estoque deste pedido será estornada.`
      : `Excluir permanentemente ${referencia}? Pagamentos, parcelas, anexos e histórico também serão removidos.`
    if (!confirm(aviso)) return

    startTransition(async () => {
      const result = await excluirPedido(pedido.id)
      if (!result.success) {
        setMensagem(result.message)
        return
      }
      router.push('/orcamentos')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><Link href="/" className="mb-4 inline-flex items-center gap-2 text-xs text-white/40 hover:text-white"><ArrowLeft size={13} /> Voltar</Link><p className="text-xs text-[#d8f45a]">{pedido.numero_orcamento}</p><h1 className="mt-2 text-3xl font-semibold">{pedido.nome_da_peca}</h1><p className="mt-1 text-sm text-white/45">{pedido.cliente_nome} · {pedido.orcamento_status} · {pedido.status}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSalvarModelo(true)} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs text-white/70"><BookmarkPlus size={14} /> Salvar como modelo</button>{['Rascunho', 'Enviado'].includes(pedido.orcamento_status) && <Link href={`/orcamentos/editar/${pedido.id}`} className="flex items-center gap-2 rounded-lg bg-blue-500/10 px-4 py-2.5 text-xs font-medium text-blue-300"><Pencil size={14} /> Editar orçamento</Link>}<Link href={`/orcamentos/duplicar/${pedido.id}`} className="flex items-center gap-2 rounded-lg bg-[#d8f45a]/10 px-4 py-2.5 text-xs font-medium text-[#d8f45a]"><Copy size={14} /> Duplicar pedido</Link><a href={`/api/orcamentos/${pedido.id}/pdf`} target="_blank" className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs"><FileDown size={14} /> Baixar PDF</a>{pedido.cliente_telefone && <button type="button" onClick={() => setWhatsApp(true)} className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-2.5 text-xs font-medium text-emerald-400"><MessageCircle size={14} /> WhatsApp</button>}{pedido.saldo_pendente > 0 && <button onClick={() => setReceber(true)} className="rounded-lg bg-emerald-500/15 px-4 py-2.5 text-xs font-medium text-emerald-400">Registrar pagamento</button>}<button type="button" disabled={isPending} onClick={excluirPedidoAtual} className="flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-40"><Trash2 size={14} /> Excluir pedido</button></div>
      </div>

      {mensagem && <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70">{mensagem}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[['Venda', fmtBRL(pedido.valor_total_cobrado)], ['Custo real', fmtBRL(pedido.custo_real)], ['Lucro líquido', fmtBRL(pedido.lucro_liquido)], ['Margem', `${pedido.margem_percentual.toFixed(1)}%`]].map(([label, value], index) => <div key={label} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-xs text-white/35">{label}</p><p className={`mt-2 text-2xl font-semibold ${index >= 2 ? (pedido.lucro_liquido >= 0 ? 'text-[#d8f45a]' : 'text-red-400') : ''}`}>{value}</p></div>)}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-xs text-white/35">Custo orçado</p><p className="mt-2 text-xl font-semibold">{fmtBRL(pedido.custo_estimado)}</p></div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-xs text-white/35">Custo após revisão</p><p className="mt-2 text-xl font-semibold">{fmtBRL(pedido.custo_real)}</p></div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5"><p className="text-xs text-white/35">Variação do custo</p><p className={`mt-2 text-xl font-semibold ${pedido.custo_real > pedido.custo_estimado ? 'text-red-300' : 'text-emerald-400'}`}>{pedido.custo_real > pedido.custo_estimado ? '+' : ''}{fmtBRL(pedido.custo_real - pedido.custo_estimado)}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Ciclo do orçamento</h2><p className="mt-1 text-xs text-white/35">Validade: {pedido.validade_orcamento ? new Date(`${pedido.validade_orcamento}T12:00:00`).toLocaleDateString('pt-BR') : 'não definida'}</p></div><div className="flex flex-wrap gap-2">{pedido.orcamento_status === 'Rascunho' && <><button onClick={() => mudarOrcamento('Enviado')} className="rounded-lg bg-blue-500/15 px-3 py-2 text-xs text-blue-300">Marcar enviado</button><button onClick={() => mudarOrcamento('Aprovado')} className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Aprovar</button></>}{pedido.orcamento_status === 'Enviado' && <><button onClick={() => mudarOrcamento('Aprovado')} className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Aprovar</button><button onClick={() => mudarOrcamento('Recusado')} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">Recusado</button></>}{pedido.orcamento_status === 'Expirado' && <><button onClick={() => mudarOrcamento('Enviado')} className="rounded-lg bg-blue-500/15 px-3 py-2 text-xs text-blue-300">Reenviar</button><button onClick={() => mudarOrcamento('Aprovado')} className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Aprovar mesmo assim</button></>}</div></div></section>

          {pedido.orcamento_status === 'Aprovado' && pedido.status !== 'Cancelado' && <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Andamento da produção</h2><p className="mt-1 text-xs text-white/35">Status atual: {pedido.status}</p></div><div className="flex flex-wrap gap-2">{pedido.status === 'Fila' && <button onClick={() => mudarProducao('Imprimindo')} className="rounded-lg bg-blue-500/15 px-3 py-2 text-xs text-blue-300">Iniciar impressão</button>}{pedido.status === 'Imprimindo' && <button onClick={() => mudarProducao('Acabamento')} className="rounded-lg bg-violet-500/15 px-3 py-2 text-xs text-violet-300">Enviar ao acabamento</button>}{pedido.status === 'Acabamento' && <a href="#fechamento" className="rounded-lg bg-[#d8f45a] px-3 py-2 text-xs font-semibold text-[#15180d]">Revisar e finalizar</a>}<button onClick={() => mudarProducao('Cancelado')} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">Cancelar pedido</button></div></div></section>}

          <form id="fechamento" onSubmit={salvarOperacao} className="scroll-mt-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><div className="mb-5"><h2 className="font-semibold">Planejamento e consumo real</h2><p className="mt-1 text-xs leading-5 text-white/35">Antes de finalizar, informe o que realmente foi usado. Campos vazios serão preenchidos com a estimativa após sua confirmação.</p></div><div className="grid gap-4 sm:grid-cols-2">
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
          {pedido.status === 'Acabamento' && <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-100/70"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-300" /> A finalização dará baixa definitiva no estoque. Confira os consumos antes de continuar.</div>}
          <div className="mt-6 flex flex-wrap gap-2"><button disabled={isPending || ['Finalizado', 'Cancelado'].includes(pedido.status)} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs text-white/70 disabled:opacity-50"><Save size={14} /> Salvar operação</button>{pedido.status === 'Acabamento' && <button type="button" onClick={finalizarComRevisao} disabled={isPending} className="flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] disabled:opacity-50"><PackageCheck size={14} /> Revisar e finalizar</button>}</div></form>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-4 font-semibold">Financeiro</h2><div className="space-y-2 text-sm"><p className="flex justify-between text-white/50"><span>Recebido</span><b className="text-emerald-400">{fmtBRL(pedido.total_recebido)}</b></p><p className="flex justify-between text-white/50"><span>Pendente</span><b className="text-amber-400">{fmtBRL(pedido.saldo_pendente)}</b></p></div><div className="mt-5 space-y-2">{pedido.parcelas_receber.map((parcela) => <div key={parcela.id} className="rounded-lg bg-white/[0.03] p-3 text-xs"><div className="flex justify-between"><span>Parcela {parcela.numero}/{pedido.parcelas}</span><b>{fmtBRL(parcela.valor)}</b></div><div className="mt-1 flex justify-between text-white/40"><span>{new Date(`${parcela.vencimento_em}T12:00:00`).toLocaleDateString('pt-BR')}</span><span className={parcela.situacao === 'Pago' ? 'text-emerald-400' : parcela.situacao === 'Atrasado' ? 'text-red-400' : 'text-amber-300'}>{parcela.situacao}{parcela.saldo > 0 ? ` · ${fmtBRL(parcela.saldo)}` : ''}</span></div></div>)}</div></section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-4 flex items-center gap-2 font-semibold"><Link2 size={15} /> Arquivos e links</h2><form onSubmit={adicionarAnexo} className="space-y-3"><input required placeholder="Nome: Projeto 3MF" value={anexoNome} onChange={(e) => setAnexoNome(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /><input required type="url" placeholder="https://..." value={anexoUrl} onChange={(e) => setAnexoUrl(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /><button className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs">Adicionar link</button></form><div className="mt-4 space-y-2">{pedido.anexos.map((anexo) => <div key={anexo.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3"><a href={anexo.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-300">{anexo.nome}<ExternalLink size={11} /></a><button onClick={() => startTransition(async () => setMensagem((await removerAnexoPedido(anexo.id, pedido.id)).message))} className="text-red-400/60"><Trash2 size={13} /></button></div>)}</div></section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6"><h2 className="mb-4 font-semibold">Histórico</h2><div className="space-y-4">{pedido.historico.map((item) => <div key={item.id} className="border-l border-white/10 pl-3"><p className="text-xs font-medium">{item.evento}</p><p className="mt-1 text-xs text-white/40">{item.descricao}</p><p className="mt-1 text-[10px] text-white/25">{new Date(item.criado_em).toLocaleString('pt-BR')}</p></div>)}</div></section>
        </div>
      </div>
      {salvarModelo && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
        <form onSubmit={criarModelo} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15171b] p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Salvar como modelo</h2><p className="mt-1 text-xs text-white/35">Depois ele aparecerá no início da tela Novo Orçamento.</p></div><button type="button" onClick={() => setSalvarModelo(false)} className="text-white/35 hover:text-white"><X size={18} /></button></div>
          <label className="text-xs text-white/55">Nome do modelo<input autoFocus required maxLength={100} value={nomeModelo} onChange={(event) => setNomeModelo(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm outline-none focus:border-[#d8f45a]/60" /></label>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setSalvarModelo(false)} className="rounded-lg bg-white/[0.05] px-4 py-2.5 text-xs text-white/55">Cancelar</button><button disabled={isPending} className="rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d] disabled:opacity-50">{isPending ? 'Salvando...' : 'Salvar modelo'}</button></div>
        </form>
      </div>}
      {receber && <RecebimentoModal pedidoId={pedido.id} onClose={() => setReceber(false)} />}
      {whatsApp && <WhatsAppModal pedido={pedido} onClose={() => setWhatsApp(false)} />}
    </div>
  )
}
