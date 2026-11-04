'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, BadgeCheck, FileDown, Landmark, Plus, ReceiptText, Trash2 } from 'lucide-react'
import {
  adicionarReceitaExterna,
  atualizarDocumentoFiscal,
  cancelarReceitaExterna,
  salvarConfiguracaoMei,
  salvarObrigacaoFiscal,
  type PainelFiscal,
} from '@/app/actions/fiscal'

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function FiscalMeiPage({ painel }: { painel: PainelFiscal }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [config, setConfig] = useState({
    inicioMei: painel.inicioMei || '', limiteAnual: painel.limiteAnualConfigurado,
    naturezaPadrao: painel.naturezaPadrao,
  })
  const [nova, setNova] = useState({
    dataCompetencia: new Date().toISOString().slice(0, 10), natureza: painel.naturezaPadrao,
    descricao: '', valor: '', notaFiscalEmitida: false, numeroDocumento: '',
  })
  const percentual = Math.min(Math.max(painel.resumo.percentual, 0), 100)

  function executar(acao: () => Promise<{ success: boolean; message: string }>) {
    setMensagem('')
    startTransition(async () => {
      const result = await acao()
      setMensagem(result.message)
      if (result.success) router.refresh()
    })
  }

  return <div>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold"><Landmark className="text-accent" size={22} /> Fiscal e MEI</h1><p className="mt-1 text-xs text-muted-foreground">Faturamento bruto, obrigações e documentos em um único lugar.</p></div>
      <div className="flex gap-2"><Link href={`/financeiro/fiscal?ano=${painel.ano - 1}`} className="rounded-lg bg-subtle px-3 py-2 text-xs text-secondary-foreground">{painel.ano - 1}</Link><span className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">{painel.ano}</span><Link href={`/financeiro/fiscal?ano=${painel.ano + 1}`} className="rounded-lg bg-subtle px-3 py-2 text-xs text-secondary-foreground">{painel.ano + 1}</Link></div>
    </div>

    {mensagem && <p className="mb-5 rounded-lg bg-subtle p-3 text-xs text-secondary-foreground">{mensagem}</p>}

    <div className="grid gap-4 md:grid-cols-4">
      <div className="rounded-2xl border border-border bg-card p-5 md:col-span-2"><p className="text-xs text-muted-foreground">Receita bruta em {painel.ano}</p><p className="mt-2 text-2xl font-semibold">{moeda(painel.resumo.total)}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-subtle"><div className={`h-full rounded-full ${painel.resumo.situacao === 'Excedido' ? 'bg-red-400' : painel.resumo.situacao === 'Atenção' ? 'bg-amber-400' : 'bg-accent'}`} style={{ width: `${percentual}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{painel.resumo.percentual.toFixed(1)}% do limite</span><span>Limite: {moeda(painel.resumo.limite)}</span></div><p className={`mt-3 flex items-center gap-2 text-xs ${painel.resumo.situacao === 'Dentro do limite' ? 'text-success' : 'text-warning'}`}>{painel.resumo.situacao === 'Dentro do limite' ? <BadgeCheck size={14} /> : <AlertTriangle size={14} />}{painel.resumo.situacao} · {painel.resumo.restante >= 0 ? `${moeda(painel.resumo.restante)} disponíveis` : `${moeda(Math.abs(painel.resumo.restante))} acima`}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Vendas / indústria</p><p className="mt-2 text-xl font-semibold">{moeda(painel.totalVendas)}</p></div>
      <div className="rounded-2xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Serviços</p><p className="mt-2 text-xl font-semibold">{moeda(painel.totalServicos)}</p></div>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Receita por mês</h2><p className="mt-1 text-xs text-muted-foreground">Inclui recebimentos do ERP e receitas externas adicionadas por você.</p></div><a href={`/api/fiscal/relatorio?ano=${painel.ano}`} className="inline-flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-xs text-secondary-foreground"><FileDown size={14} /> Exportar CSV</a></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pb-3">Mês</th><th className="pb-3">Vendas</th><th className="pb-3">Serviços</th><th className="pb-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-border">{painel.meses.map((item, index) => <tr key={item.mes}><td className="py-3 text-secondary-foreground">{meses[index]}</td><td className="py-3 text-muted-foreground">{moeda(item.vendas)}</td><td className="py-3 text-muted-foreground">{moeda(item.servicos)}</td><td className="py-3 text-right font-medium">{moeda(item.total)}</td></tr>)}</tbody></table></div>
      </div>

      <div className="space-y-6">
        <form onSubmit={(event) => { event.preventDefault(); executar(() => adicionarReceitaExterna({ ...nova, valor: Number(nova.valor) })); setNova((atual) => ({ ...atual, descricao: '', valor: '', numeroDocumento: '' })) }} className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="flex items-center gap-2 text-sm font-semibold"><Plus size={15} className="text-accent" /> Receita fora do ERP</h2><p className="mt-1 text-xs text-muted-foreground">Use para o trabalho PJ ou outra receita que também entra no mesmo CNPJ.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><input required type="date" value={nova.dataCompetencia} onChange={(e) => setNova({ ...nova, dataCompetencia: e.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 text-xs" /><select value={nova.natureza} onChange={(e) => setNova({ ...nova, natureza: e.target.value as 'Venda' | 'Serviço' })} className="h-10 rounded-lg border border-border bg-background px-3 text-xs"><option>Venda</option><option>Serviço</option></select><input required placeholder="Descrição" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 text-xs sm:col-span-2" /><input required type="number" min="0.01" step="0.01" placeholder="Valor (R$)" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 text-xs" /><input placeholder="Nº da nota (opcional)" value={nova.numeroDocumento} onChange={(e) => setNova({ ...nova, numeroDocumento: e.target.value, notaFiscalEmitida: Boolean(e.target.value) })} className="h-10 rounded-lg border border-border bg-background px-3 text-xs" /></div><button disabled={isPending} className="mt-4 h-10 w-full rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50">Adicionar receita</button></form>

        <form onSubmit={(event) => { event.preventDefault(); executar(() => salvarConfiguracaoMei({ inicioMei: config.inicioMei || null, limiteAnual: Number(config.limiteAnual), naturezaPadrao: config.naturezaPadrao })) }} className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="text-sm font-semibold">Configuração do MEI</h2><div className="mt-4 space-y-3"><label className="block text-[11px] text-muted-foreground">Data de abertura<input type="date" value={config.inicioMei} onChange={(e) => setConfig({ ...config, inicioMei: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground" /></label><label className="block text-[11px] text-muted-foreground">Limite anual vigente<input type="number" min="1" step="0.01" value={config.limiteAnual} onChange={(e) => setConfig({ ...config, limiteAnual: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground" /></label><label className="block text-[11px] text-muted-foreground">Natureza padrão dos recebimentos<select value={config.naturezaPadrao} onChange={(e) => setConfig({ ...config, naturezaPadrao: e.target.value as 'Venda' | 'Serviço' })} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground"><option>Venda</option><option>Serviço</option></select></label></div><button disabled={isPending} className="mt-4 h-10 w-full rounded-lg bg-subtle text-xs text-secondary-foreground disabled:opacity-50">Salvar configuração</button></form>
      </div>
    </div>

    <div className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="text-sm font-semibold">Obrigações</h2><p className="mt-1 text-xs text-muted-foreground">Controle operacional; a emissão e entrega continuam nos portais oficiais.</p><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{painel.obrigacoes.filter((item) => item.tipo === 'DASN' || item.competencia <= new Date().toISOString().slice(0, 7)).map((item) => <div key={`${item.tipo}-${item.competencia}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-black/15 p-3"><div><p className="text-xs font-medium">{item.tipo} · {item.competencia}</p><p className="mt-1 text-[10px] text-muted-foreground">Vence em {new Date(`${item.vencimento_em}T12:00:00`).toLocaleDateString('pt-BR')}</p></div><button disabled={isPending} onClick={() => executar(() => salvarObrigacaoFiscal({ ...item, vencimentoEm: item.vencimento_em, status: item.status === 'Pendente' ? (item.tipo === 'DAS' ? 'Pago' : 'Entregue') : 'Pendente' }))} className={`rounded-lg px-2.5 py-1.5 text-[10px] ${item.status === 'Pendente' ? 'bg-amber-500/10 text-warning' : 'bg-emerald-500/10 text-success'}`}>{item.status}</button></div>)}</div></div>

    <div className="mt-6 rounded-2xl border border-border bg-card"><div className="flex items-center justify-between p-5 sm:p-6"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><ReceiptText size={15} /> Lançamentos fiscais</h2><p className="mt-1 text-xs text-muted-foreground">Marque a emissão de nota sem alterar o recebimento financeiro.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="border-y border-border text-muted-foreground"><tr><th className="px-5 py-3">Data</th><th>Descrição</th><th>Origem</th><th>Natureza</th><th>Valor</th><th>Documento</th><th className="pr-5 text-right">Ações</th></tr></thead><tbody className="divide-y divide-border">{painel.receitas.map((item) => <tr key={item.id}><td className="px-5 py-3 text-muted-foreground">{new Date(`${item.data_competencia.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}</td><td className="max-w-[300px] truncate py-3">{item.descricao}</td><td className="py-3 text-muted-foreground">{item.origem}</td><td className="py-3 text-muted-foreground">{item.natureza}</td><td className="py-3 font-medium">{moeda(item.valor)}</td><td className="py-3"><button disabled={isPending} onClick={() => executar(() => atualizarDocumentoFiscal(item.id, !item.nota_fiscal_emitida, item.numero_documento || undefined))} className={`rounded px-2 py-1 text-[10px] ${item.nota_fiscal_emitida ? 'bg-emerald-500/10 text-success' : 'bg-subtle text-muted-foreground'}`}>{item.nota_fiscal_emitida ? item.numero_documento || 'Emitida' : 'Não informada'}</button></td><td className="pr-5 text-right">{item.origem === 'Externa' && <button title="Remover receita externa" disabled={isPending} onClick={() => executar(() => cancelarReceitaExterna(item.id))} className="rounded p-2 text-destructive hover:bg-red-500/10"><Trash2 size={13} /></button>}</td></tr>)}{painel.receitas.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma receita no ano selecionado.</td></tr>}</tbody></table></div></div>

    <p className="mt-5 text-[11px] leading-5 text-muted-foreground">Este painel é um controle gerencial. Ele não substitui orientação contábil, emissão de DAS, notas fiscais ou envio da DASN-SIMEI nos sistemas oficiais.</p>
  </div>
}
