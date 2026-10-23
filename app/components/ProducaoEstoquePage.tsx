'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Boxes, CheckCircle2, Factory, Play, ShieldCheck, XCircle } from 'lucide-react'
import {
  atualizarStatusOrdemProducaoEstoque,
  concluirOrdemProducaoEstoque,
  criarOrdemProducaoEstoque,
  type ProducaoEstoqueDados,
} from '@/app/actions/producao-estoque'
import { gerarIdentificadorOperacao } from '@/lib/identificador-operacao'

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ProducaoEstoquePage({ dados }: { dados: ProducaoEstoqueDados }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [produtoVersaoId, setProdutoVersaoId] = useState(dados.produtos[0]?.versao_id ?? 0)
  const produto = useMemo(() => dados.produtos.find(item => item.versao_id === produtoVersaoId), [dados.produtos, produtoVersaoId])
  const [quantidade, setQuantidade] = useState(24)
  const [quantidadePorPlate, setQuantidadePorPlate] = useState(24)
  const [tempoExecucao, setTempoExecucao] = useState(0)
  const [identificacao, setIdentificacao] = useState(`FAB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`)
  const [impressoraId, setImpressoraId] = useState<number | null>(null)
  const [dataPrevista, setDataPrevista] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [arquivos, setArquivos] = useState('')
  const [concluindo, setConcluindo] = useState<number | null>(null)
  const [registrandoPerdaTotal, setRegistrandoPerdaTotal] = useState(false)
  const ordemConclusao = dados.ordens.find(item => item.id === concluindo)
  const [aprovadas, setAprovadas] = useState(0)
  const [reprovadas, setReprovadas] = useState(0)
  const [tempoReal, setTempoReal] = useState(0)
  const [horasTrabalho, setHorasTrabalho] = useState(0)
  const [falhas, setFalhas] = useState(0)
  const [custosAdicionais, setCustosAdicionais] = useState(0)
  const [desperdicios, setDesperdicios] = useState('')
  const [consumosFilamentos, setConsumosFilamentos] = useState<Record<number, number>>({})
  const [consumosInsumos, setConsumosInsumos] = useState<Record<number, number>>({})

  function selecionarProduto(valor: number) {
    const selecionado = dados.produtos.find(item => item.versao_id === valor)
    setProdutoVersaoId(valor)
    if (selecionado) {
      setQuantidadePorPlate(selecionado.unidades_por_placa ?? quantidade)
      setTempoExecucao(selecionado.tempo_impressao_horas_unidade * (selecionado.unidades_por_placa ?? quantidade))
      setImpressoraId(selecionado.impressora_preferida_id)
    }
  }

  function criar(event: React.FormEvent) {
    event.preventDefault()
    if (!produto) return
    const execucoes = Math.ceil(quantidade / quantidadePorPlate)
    startTransition(async () => {
      const resultado = await criarOrdemProducaoEstoque({
        produtoId: produto.produto_id, produtoVersaoId: produto.versao_id,
        quantidadePlanejada: quantidade, impressoraId, dataPrevista,
        identificacaoLote: identificacao, quantidadePorPlate,
        execucoesPlanejadas: execucoes, tempoEstimadoExecucaoHoras: tempoExecucao,
        filamentos: produto.itens.filter(item => item.tipo_item === 'Filamento').map(item => ({
          filamentoId: item.item_id, gramasPrevistas: item.quantidade_por_unidade * quantidade,
        })),
        insumos: produto.itens.filter(item => item.tipo_item === 'Insumo').map(item => ({
          insumoId: item.item_id, quantidadePrevista: item.quantidade_por_unidade * quantidade,
        })),
        observacoes, arquivosReferencia: arquivos,
      })
      setMensagem(resultado.message)
      if (resultado.success) router.refresh()
    })
  }

  function mudarStatus(id: number, status: string) {
    startTransition(async () => {
      const resultado = await atualizarStatusOrdemProducaoEstoque(id, status)
      setMensagem(resultado.message)
      if (resultado.success) router.refresh()
    })
  }

  function abrirConclusao(ordem: ProducaoEstoqueDados['ordens'][number], perdaTotal = false) {
    setConcluindo(ordem.id)
    setRegistrandoPerdaTotal(perdaTotal)
    setAprovadas(perdaTotal ? 0 : ordem.quantidade_planejada)
    setReprovadas(perdaTotal ? ordem.quantidade_planejada : 0)
    setTempoReal(ordem.tempo_estimado_execucao_horas * ordem.execucoes_planejadas)
    setHorasTrabalho(0)
    setFalhas(perdaTotal ? 1 : 0)
    setCustosAdicionais(0)
    setDesperdicios('')
    setConsumosFilamentos(Object.fromEntries(ordem.filamentos.map(item => [item.filamento_id, item.gramas_previstas])))
    setConsumosInsumos(Object.fromEntries(ordem.insumos.map(item => [item.insumo_id, item.quantidade_prevista])))
  }

  function concluir(event: React.FormEvent) {
    event.preventDefault()
    if (!ordemConclusao) return
    startTransition(async () => {
      const resultado = await concluirOrdemProducaoEstoque({
        ordemId: ordemConclusao.id, operacaoId: gerarIdentificadorOperacao('conclusao'),
        quantidadeFabricada: aprovadas + reprovadas, quantidadeAprovada: aprovadas,
        quantidadeReprovada: reprovadas, tempoRealHoras: tempoReal, horasTrabalhoReal: horasTrabalho,
        falhas, custosAdicionais, desperdiciosObservacoes: desperdicios,
        filamentos: ordemConclusao.filamentos.map(item => ({ filamentoId: item.filamento_id, gramasReais: consumosFilamentos[item.filamento_id] ?? 0 })),
        insumos: ordemConclusao.insumos.map(item => ({ insumoId: item.insumo_id, quantidadeReal: consumosInsumos[item.insumo_id] ?? 0 })),
      })
      setMensagem(resultado.message)
      if (resultado.success) { setConcluindo(null); router.refresh() }
    })
  }

  return <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-3 text-xs text-white/35">Produção / Produzir para estoque</p><h1 className="text-3xl font-semibold tracking-tight">Produção para estoque</h1><p className="mt-2 text-sm text-white/40">Fabrique antecipadamente sem criar cliente, receita ou contas a receber.</p></div><div className="rounded-xl border border-[#d8f45a]/20 bg-[#d8f45a]/5 px-4 py-3 text-xs text-[#d8f45a]"><Factory className="mr-2 inline" size={15} />{dados.ordens.filter(item => !['Concluída', 'Cancelada', 'Falhou'].includes(item.status)).length} ordem(ns) ativa(s)</div></div>
    {mensagem && <p role="status" className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">{mensagem}</p>}
    <form onSubmit={criar} className="mb-8 rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 sm:p-6">
      <h2 className="mb-5 text-sm font-semibold">Nova ordem interna</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-white/50 sm:col-span-2">Produto e versão<select required value={produtoVersaoId} onChange={event => selecionarProduto(Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm"><option value={0}>Selecione...</option>{dados.produtos.map(item => <option key={item.versao_id} value={item.versao_id}>{item.codigo} · {item.produto_nome} · v{item.versao}</option>)}</select></label>
        <label className="text-xs text-white/50">Quantidade planejada<input required type="number" min="1" step="1" value={quantidade} onChange={event => setQuantidade(Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
        <label className="text-xs text-white/50">Identificação do lote<input required maxLength={80} value={identificacao} onChange={event => setIdentificacao(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
        <label className="text-xs text-white/50">Peças por plate<input required type="number" min="1" step="1" value={quantidadePorPlate} onChange={event => setQuantidadePorPlate(Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
        <label className="text-xs text-white/50">Execuções necessárias<input readOnly value={Math.max(1, Math.ceil(quantidade / Math.max(1, quantidadePorPlate)))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white/45" /></label>
        <label className="text-xs text-white/50">Tempo estimado / execução (h)<input required type="number" min="0" step="0.01" value={tempoExecucao} onChange={event => setTempoExecucao(Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
        <label className="text-xs text-white/50">Impressora<select value={impressoraId ?? ''} onChange={event => setImpressoraId(event.target.value ? Number(event.target.value) : null)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3"><option value="">Não definida</option>{dados.impressoras.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="text-xs text-white/50">Data prevista<input type="date" value={dataPrevista} onChange={event => setDataPrevista(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
        <label className="text-xs text-white/50 sm:col-span-2">Arquivos de fabricação<input maxLength={4000} value={arquivos} onChange={event => setArquivos(event.target.value)} placeholder="Caminho, URL ou referência dos arquivos" className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
        <label className="text-xs text-white/50 sm:col-span-2">Observações técnicas<input maxLength={2000} value={observacoes} onChange={event => setObservacoes(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>
      </div>
      {produto && <div className="mt-4 rounded-xl bg-black/20 p-4 text-xs text-white/45"><strong className="text-white/70">Previsão da ficha:</strong> {produto.itens.length ? produto.itens.map(item => `${item.nome}: ${(item.quantidade_por_unidade * quantidade).toLocaleString('pt-BR')} ${item.tipo_item === 'Filamento' ? 'g' : 'un.'}`).join(' · ') : 'nenhum material cadastrado'}. Os valores reais serão informados na conferência.</div>}
      <button disabled={isPending || !produto} className="mt-5 rounded-lg bg-[#d8f45a] px-5 py-3 text-sm font-semibold text-[#15180d] disabled:opacity-40">Criar ordem sem venda</button>
    </form>
    <section className="space-y-3"><h2 className="text-sm font-semibold">Ordens de fabricação</h2>{dados.ordens.map(ordem => <article key={ordem.id} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-[10px] text-[#d8f45a]">{ordem.codigo} · {ordem.identificacao_lote}</p><h3 className="mt-1 font-semibold">{ordem.produto_nome} · v{ordem.versao}</h3><p className="mt-1 text-xs text-white/35">{ordem.quantidade_planejada} un. · {ordem.execucoes_planejadas} execução(ões) · {ordem.impressora_nome ?? 'impressora não definida'}</p></div><span className="rounded-lg bg-white/[0.05] px-3 py-2 text-xs text-white/60">{ordem.status}</span></div>
      <div className="mt-4 flex flex-wrap gap-2">{ordem.status === 'Planejada' && <><button onClick={() => mudarStatus(ordem.id, 'Em produção')} disabled={isPending} className="rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-300"><Play className="mr-1 inline" size={12} /> Iniciar</button><button onClick={() => mudarStatus(ordem.id, 'Cancelada')} disabled={isPending} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">Cancelar antes do consumo</button></>}{ordem.status === 'Em produção' && <><button onClick={() => mudarStatus(ordem.id, 'Conferência')} disabled={isPending} className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300"><ShieldCheck className="mr-1 inline" size={12} /> Conferência</button><button onClick={() => abrirConclusao(ordem, true)} disabled={isPending} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300"><XCircle className="mr-1 inline" size={12} /> Registrar perda total</button></>}{ordem.status === 'Conferência' && <button onClick={() => abrirConclusao(ordem)} disabled={isPending} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><CheckCircle2 className="mr-1 inline" size={12} /> Concluir e dar entrada</button>}{ordem.status === 'Concluída' && <span className="text-xs text-emerald-300"><Boxes className="mr-1 inline" size={12} /> {ordem.quantidade_aprovada} em estoque · custo {moeda(ordem.custo_unitario_real ?? 0)}/un.</span>}{ordem.status === 'Falhou' && <span className="text-xs text-red-300"><XCircle className="mr-1 inline" size={12} /> Perda total · custo real {moeda(ordem.custo_total_real ?? 0)}</span>}</div>
    </article>)}{dados.ordens.length === 0 && <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-white/35">Nenhuma ordem interna criada.</div>}</section>
    {ordemConclusao && <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/80 p-4"><form onSubmit={concluir} className="mx-auto my-6 max-w-3xl rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="flex items-start justify-between"><div><h2 className="font-semibold">{registrandoPerdaTotal ? 'Registrar perda total' : 'Conferir'} {ordemConclusao.identificacao_lote}</h2><p className="mt-1 text-xs text-white/35">{registrandoPerdaTotal ? 'Informe o consumo e os custos reais. Nenhum produto vendável será criado.' : 'A conclusão baixa materiais e cria o lote acabado numa única transação.'}</p></div><button type="button" onClick={() => setConcluindo(null)}>×</button></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-xs text-white/50">Aprovadas<input required readOnly={registrandoPerdaTotal} type="number" min="0" step="1" value={aprovadas} onChange={e => setAprovadas(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 read-only:text-white/40" /></label><label className="text-xs text-white/50">Reprovadas<input required type="number" min="0" step="1" value={reprovadas} onChange={e => setReprovadas(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="text-xs text-white/50">Fabricadas<input readOnly value={aprovadas + reprovadas} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3" /></label><label className="text-xs text-white/50">Tempo real (h)<input required type="number" min="0" step="0.01" value={tempoReal} onChange={e => setTempoReal(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="text-xs text-white/50">Trabalho ativo (h)<input type="number" min="0" step="0.01" value={horasTrabalho} onChange={e => setHorasTrabalho(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="text-xs text-white/50">Falhas<input type="number" min="0" step="1" value={falhas} onChange={e => setFalhas(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{ordemConclusao.filamentos.map(item => <label key={`f-${item.filamento_id}`} className="text-xs text-white/50">{item.nome} · consumo real total (g)<input required type="number" min="0" step="0.01" value={consumosFilamentos[item.filamento_id] ?? 0} onChange={e => setConsumosFilamentos({ ...consumosFilamentos, [item.filamento_id]: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>)}{ordemConclusao.insumos.map(item => <label key={`i-${item.insumo_id}`} className="text-xs text-white/50">{item.nome} · consumo real ({item.unidade})<input required type="number" min="0" step="0.001" value={consumosInsumos[item.insumo_id] ?? 0} onChange={e => setConsumosInsumos({ ...consumosInsumos, [item.insumo_id]: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-white/50">Custos adicionais<input type="number" min="0" step="0.01" value={custosAdicionais} onChange={e => setCustosAdicionais(Number(e.target.value))} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="text-xs text-white/50">Desperdícios e observações<input maxLength={2000} value={desperdicios} onChange={e => setDesperdicios(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label></div><button disabled={isPending} className="mt-5 w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-40">{registrandoPerdaTotal ? 'Registrar consumo e perda total' : 'Concluir produção e gerar entrada'}</button></form></div>}
  </div>
}

