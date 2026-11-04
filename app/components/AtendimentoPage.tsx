'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  CheckCircle2, ExternalLink, PackageCheck,
  ShieldAlert, Truck, X,
} from 'lucide-react'
import {
  marcarExpedicaoEntregue, registrarExpedicao, registrarOcorrenciaQualidade,
  resolverOcorrenciaQualidade, type AtendimentoDados,
} from '@/app/actions/atendimento'

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(data: string | null) {
  return data ? new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR') : '—'
}

export function AtendimentoPage({ dados, pedidoInicial }: { dados: AtendimentoDados; pedidoInicial?: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const pedidoPadrao = dados.pedidos.some(p => p.id === pedidoInicial) ? pedidoInicial! : dados.pedidos[0]?.id || 0
  const [mensagem, setMensagem] = useState('')
  const [modalOcorrencia, setModalOcorrencia] = useState(false)
  const [modalExpedicao, setModalExpedicao] = useState(false)
  const [ocorrencia, setOcorrencia] = useState({
    pedidoId: pedidoPadrao, tipo: 'Defeito', acao: 'Reimprimir', quantidade: 1,
    custoEstimado: 0, descricao: '', prazoEm: '',
  })
  const [expedicao, setExpedicao] = useState({
    pedidoId: pedidoPadrao, modalidade: 'Entrega local', transportadora: '', codigoRastreio: '',
    urlRastreio: '', postadoEm: '', previsaoEntrega: '', custo: 0, observacoes: '',
  })

  function executar(acao: () => Promise<{ success: boolean; message: string }>, concluir?: () => void) {
    setMensagem('')
    startTransition(async () => {
      const resultado = await acao()
      setMensagem(resultado.message)
      if (resultado.success) {
        concluir?.()
        router.refresh()
      }
    })
  }

  function salvarOcorrencia(event: React.FormEvent) {
    event.preventDefault()
    executar(() => registrarOcorrenciaQualidade({
      ...ocorrencia, prazoEm: ocorrencia.prazoEm || null,
    }), () => { setModalOcorrencia(false); setOcorrencia({ ...ocorrencia, descricao: '', custoEstimado: 0, quantidade: 1 }) })
  }

  function salvarExpedicao(event: React.FormEvent) {
    event.preventDefault()
    executar(() => registrarExpedicao({
      ...expedicao, postadoEm: expedicao.postadoEm || null, previsaoEntrega: expedicao.previsaoEntrega || null,
    }), () => { setModalExpedicao(false); setExpedicao({ ...expedicao, codigoRastreio: '', urlRastreio: '', observacoes: '', custo: 0 }) })
  }

  return <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 text-xs text-muted-foreground">Operação / Pós-venda</p><h1 className="text-3xl font-semibold">Qualidade e expedição</h1><p className="mt-2 text-sm text-muted-foreground">Garantias, reimpressões, devoluções e rastreamento dos pedidos.</p></div><div className="flex gap-2"><button disabled={!dados.pedidos.length} onClick={() => setModalOcorrencia(true)} className="inline-flex items-center gap-2 rounded-lg bg-subtle px-4 py-2.5 text-xs text-secondary-foreground disabled:opacity-40"><ShieldAlert size={14} /> Nova ocorrência</button><button disabled={!dados.pedidos.length} onClick={() => setModalExpedicao(true)} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground disabled:opacity-40"><Truck size={14} /> Nova expedição</button></div></div>

    {mensagem && <p className="mb-5 rounded-xl border border-border bg-subtle px-4 py-3 text-xs text-secondary-foreground">{mensagem}</p>}
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      ['Ocorrências abertas', dados.resumo.ocorrenciasAbertas, 'text-warning'],
      ['Reimpressões pendentes', dados.resumo.reimpressoesPendentes, 'text-accent'],
      ['Expedições abertas', dados.resumo.expedicoesEmAberto, 'text-info'],
      ['Entregas atrasadas', dados.resumo.expedicoesAtrasadas, dados.resumo.expedicoesAtrasadas ? 'text-destructive' : 'text-success'],
    ].map(([rotulo, valor, cor]) => <div key={rotulo} className="rounded-2xl border border-border bg-card p-5"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</p><p className={`mt-2 text-2xl font-semibold ${cor}`}>{valor}</p></div>)}</div>

    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center gap-3 border-b border-border px-5 py-4"><ShieldAlert size={16} className="text-warning" /><div><h2 className="text-sm font-semibold">Ocorrências de qualidade</h2><p className="text-xs text-muted-foreground">Custos e ações corretivas ficam ligados ao pedido original.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Pedido</th><th>Ocorrência</th><th>Ação</th><th>Quantidade</th><th>Custo</th><th>Prazo</th><th>Status</th><th className="pr-5 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{!dados.ocorrencias.length && <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">Nenhuma ocorrência registrada.</td></tr>}{dados.ocorrencias.map(item => <tr key={item.id}><td className="px-5 py-4"><Link href={`/pedidos/${item.pedido_id}`} className="font-mono text-accent">{item.numero_orcamento}</Link><p className="mt-1 max-w-[180px] truncate text-muted-foreground">{item.cliente_nome} · {item.produto_nome}</p></td><td><p className="text-secondary-foreground">{item.tipo}</p><p className="mt-1 max-w-[230px] truncate text-muted-foreground" title={item.descricao}>{item.descricao}</p></td><td><span className={item.acao === 'Reimprimir' ? 'text-accent' : 'text-muted-foreground'}>{item.acao}</span></td><td>{item.quantidade}</td><td className="font-mono">{moeda(item.custo_estimado)}</td><td className={item.prazo_em && item.prazo_em < dados.hoje && item.status !== 'Resolvida' ? 'text-destructive' : 'text-muted-foreground'}>{dataBr(item.prazo_em)}</td><td><span className={`rounded px-2 py-1 text-[10px] ${item.status === 'Resolvida' ? 'bg-emerald-400/10 text-success' : 'bg-amber-400/10 text-warning'}`}>{item.status}</span></td><td className="pr-5 text-right">{!['Resolvida', 'Cancelada'].includes(item.status) && <button disabled={isPending} onClick={() => { const texto = prompt('Como a ocorrência foi resolvida?'); if (texto) executar(() => resolverOcorrenciaQualidade(item.id, item.pedido_id, texto)) }} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-success"><CheckCircle2 size={13} /> Resolver</button>}</td></tr>)}</tbody></table></div></section>

    <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center gap-3 border-b border-border px-5 py-4"><Truck size={16} className="text-info" /><div><h2 className="text-sm font-semibold">Expedições e rastreamento</h2><p className="text-xs text-muted-foreground">Retiradas, entregas locais, Correios e transportadoras.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Pedido</th><th>Modalidade</th><th>Rastreio</th><th>Postagem</th><th>Previsão</th><th>Custo</th><th>Status</th><th className="pr-5 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{!dados.expedicoes.length && <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">Nenhuma expedição registrada.</td></tr>}{dados.expedicoes.map(item => <tr key={item.id}><td className="px-5 py-4"><Link href={`/pedidos/${item.pedido_id}`} className="font-mono text-accent">{item.numero_orcamento}</Link><p className="mt-1 max-w-[180px] truncate text-muted-foreground">{item.cliente_nome} · {item.produto_nome}</p></td><td><p className="text-secondary-foreground">{item.modalidade}</p><p className="mt-1 text-muted-foreground">{item.transportadora || '—'}</p></td><td>{item.codigo_rastreio ? item.url_rastreio ? <a href={item.url_rastreio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-info">{item.codigo_rastreio}<ExternalLink size={10} /></a> : <span className="font-mono text-secondary-foreground">{item.codigo_rastreio}</span> : '—'}</td><td className="text-muted-foreground">{dataBr(item.postado_em)}</td><td className={item.status_exibicao === 'Atrasado' ? 'text-destructive' : 'text-muted-foreground'}>{dataBr(item.previsao_entrega)}</td><td className="font-mono">{moeda(item.custo)}</td><td><span className={`rounded px-2 py-1 text-[10px] ${item.status_exibicao === 'Entregue' ? 'bg-emerald-400/10 text-success' : item.status_exibicao === 'Atrasado' ? 'bg-red-400/10 text-destructive' : 'bg-blue-400/10 text-info'}`}>{item.status_exibicao}</span></td><td className="pr-5 text-right">{!['Entregue', 'Cancelada'].includes(item.status) && <button disabled={isPending} onClick={() => executar(() => marcarExpedicaoEntregue(item.id, item.pedido_id, dados.hoje))} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-success"><PackageCheck size={13} /> Entregue</button>}</td></tr>)}</tbody></table></div></section>

    {modalOcorrencia && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"><form onSubmit={salvarOcorrencia} className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Nova ocorrência</h2><p className="mt-1 text-xs text-muted-foreground">Use também para garantia, devolução ou reimpressão.</p></div><button type="button" onClick={() => setModalOcorrencia(false)}><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-muted-foreground sm:col-span-2">Pedido<select value={ocorrencia.pedidoId} onChange={e => setOcorrencia({ ...ocorrencia, pedidoId: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{dados.pedidos.map(p => <option key={p.id} value={p.id}>{p.numero_orcamento} · {p.cliente_nome} · {p.nome_da_peca}</option>)}</select></label><label className="text-xs text-muted-foreground">Tipo<select value={ocorrencia.tipo} onChange={e => setOcorrencia({ ...ocorrencia, tipo: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{['Falha de impressão', 'Defeito', 'Devolução', 'Garantia', 'Reimpressão', 'Outro'].map(v => <option key={v}>{v}</option>)}</select></label><label className="text-xs text-muted-foreground">Ação prevista<select value={ocorrencia.acao} onChange={e => setOcorrencia({ ...ocorrencia, acao: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{['Reimprimir', 'Trocar', 'Estornar', 'Crédito', 'Sem ação'].map(v => <option key={v}>{v}</option>)}</select></label><label className="text-xs text-muted-foreground">Quantidade<input required type="number" min="0.001" step="0.001" value={ocorrencia.quantidade} onChange={e => setOcorrencia({ ...ocorrencia, quantidade: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground">Custo estimado<input type="number" min="0" step="0.01" value={ocorrencia.custoEstimado} onChange={e => setOcorrencia({ ...ocorrencia, custoEstimado: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground">Prazo<input type="date" value={ocorrencia.prazoEm} onChange={e => setOcorrencia({ ...ocorrencia, prazoEm: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground sm:col-span-2">Descrição<textarea required rows={4} maxLength={2000} value={ocorrencia.descricao} onChange={e => setOcorrencia({ ...ocorrencia, descricao: e.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label></div><button disabled={isPending} className="mt-5 w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground">Registrar ocorrência</button></form></div>}

    {modalExpedicao && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"><form onSubmit={salvarExpedicao} className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Nova expedição</h2><p className="mt-1 text-xs text-muted-foreground">Pode ser registrada antes ou depois da postagem.</p></div><button type="button" onClick={() => setModalExpedicao(false)}><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-muted-foreground sm:col-span-2">Pedido<select value={expedicao.pedidoId} onChange={e => setExpedicao({ ...expedicao, pedidoId: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{dados.pedidos.map(p => <option key={p.id} value={p.id}>{p.numero_orcamento} · {p.cliente_nome} · {p.nome_da_peca}</option>)}</select></label><label className="text-xs text-muted-foreground">Modalidade<select value={expedicao.modalidade} onChange={e => setExpedicao({ ...expedicao, modalidade: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">{['Retirada', 'Entrega local', 'Transportadora', 'Correios', 'Outro'].map(v => <option key={v}>{v}</option>)}</select></label><label className="text-xs text-muted-foreground">Transportadora<input maxLength={120} value={expedicao.transportadora} onChange={e => setExpedicao({ ...expedicao, transportadora: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground">Código de rastreio<input maxLength={100} value={expedicao.codigoRastreio} onChange={e => setExpedicao({ ...expedicao, codigoRastreio: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground">Link de rastreio<input type="url" value={expedicao.urlRastreio} onChange={e => setExpedicao({ ...expedicao, urlRastreio: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground">Postado em<input type="date" value={expedicao.postadoEm} onChange={e => setExpedicao({ ...expedicao, postadoEm: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground">Previsão<input type="date" value={expedicao.previsaoEntrega} onChange={e => setExpedicao({ ...expedicao, previsaoEntrega: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground">Custo<input type="number" min="0" step="0.01" value={expedicao.custo} onChange={e => setExpedicao({ ...expedicao, custo: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs text-muted-foreground sm:col-span-2">Observações<textarea rows={3} maxLength={1000} value={expedicao.observacoes} onChange={e => setExpedicao({ ...expedicao, observacoes: e.target.value })} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm" /></label></div><button disabled={isPending} className="mt-5 w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground">Registrar expedição</button></form></div>}
  </div>
}
