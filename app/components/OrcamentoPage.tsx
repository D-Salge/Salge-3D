'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, CheckCircle2, ChevronRight, Zap } from 'lucide-react'
import { criarPedido, type PedidoParaDuplicar, type ReferenciaPreco } from '@/app/actions/pedidos'
import { useRouter } from 'next/navigation'
import type { Cliente } from '@/app/actions/clientes'
import type { FilamentoCompleto } from '@/app/actions/filamentos'
import type { Insumo } from '@/app/actions/insumos'
import type { Impressora } from '@/app/actions/operacao'
import {
  aplicarPisoHistorico,
  arredondarMoeda,
  calcularPrecoPlanilha,
  calcularValorVenda,
  normalizarChaveTexto,
  TIPOS_PEDIDO,
} from '@/lib/orcamento.mjs'

function formaPagamentoInicial(valor?: string | null) {
  const mapa: Record<string, string> = {
    'Cartao Credito': 'Cartão de Crédito',
    'Cartao Debito': 'Cartão de Débito',
    Transferencia: 'Transferência',
  }
  return valor ? (mapa[valor] ?? valor) : 'Pix'
}

export function OrcamentoPage({ 
  clientes, 
  filamentos, 
  insumosList,
  impressoras,
  custoHoraMaquina,
  tarifaEnergia,
  potenciaW,
  margemPerdasPadrao,
  taxaVenda,
  valorHoraTrabalho,
  fatorB2CPersonalizado,
  fatorB2BPiloto,
  fatorB2BRecorrente,
  pedidoMinimoB2B,
  referenciasPrecos,
  pedidoInicial,
}: { 
  clientes: Cliente[]
  filamentos: FilamentoCompleto[]
  insumosList: Insumo[]
  impressoras: Impressora[]
  custoHoraMaquina: number
  tarifaEnergia: number
  potenciaW: number
  margemPerdasPadrao: number
  taxaVenda: number
  valorHoraTrabalho: number
  fatorB2CPersonalizado: number
  fatorB2BPiloto: number
  fatorB2BRecorrente: number
  pedidoMinimoB2B: number
  referenciasPrecos: ReferenciaPreco[]
  pedidoInicial?: PedidoParaDuplicar | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Basic info
  const [nomeDaPeca, setNomeDaPeca] = useState(pedidoInicial?.nome_da_peca ?? '')
  const [clienteId, setClienteId] = useState('')
  const [tempoHoras, setTempoHoras] = useState<number | ''>(pedidoInicial?.tempo_impressao_horas ?? '')
  const [quantidade, setQuantidade] = useState(Math.max(1, Math.round(pedidoInicial?.quantidade ?? 1)))
  const [tipoPedido, setTipoPedido] = useState(
    pedidoInicial?.tipo_venda && TIPOS_PEDIDO.includes(pedidoInicial.tipo_venda)
      ? pedidoInicial.tipo_venda
      : (pedidoInicial?.quantidade ?? 1) >= 4 ? 'B2C lote (4+)' : 'B2C personalizado (1-3)',
  )
  const [impressoraId, setImpressoraId] = useState(
    pedidoInicial?.impressora_id ? String(pedidoInicial.impressora_id) : '',
  )
  
  // Arrays
  const [materiais, setMateriais] = useState<{ id: string; filamentoId: string; pesoGasto: number | '' }[]>(
    pedidoInicial?.materiais.map((item, index) => ({ id: `duplicado-filamento-${index}`, filamentoId: String(item.filamento_id), pesoGasto: item.peso_gasto_gramas })) ?? [],
  )
  const [insumos, setInsumos] = useState<{ id: string; insumoId: string; quantidade: number | '' }[]>(
    pedidoInicial?.insumos.map((item, index) => ({ id: `duplicado-insumo-${index}`, insumoId: String(item.insumo_id), quantidade: item.quantidade })) ?? [],
  )

  // Faturamento e Custos Extras
  const [desconto, setDesconto] = useState<number | ''>(pedidoInicial?.desconto || '')
  const [freteCobrado, setFreteCobrado] = useState<number | ''>(pedidoInicial?.frete_cobrado || '')
  const [fretePago, setFretePago] = useState<number | ''>(pedidoInicial?.frete_pago || '')
  const [custoEmbalagem, setCustoEmbalagem] = useState<number | ''>(pedidoInicial?.custo_embalagem || '')
  const [materiaisAvulsosPorUnidade, setMateriaisAvulsosPorUnidade] = useState<number | ''>('')
  const [horasTrabalhoAtivo, setHorasTrabalhoAtivo] = useState<number | ''>('')
  const [setupProjeto, setSetupProjeto] = useState<number | ''>('')
  const [margemPerdas, setMargemPerdas] = useState(margemPerdasPadrao)
  const [precoUnitarioVenda, setPrecoUnitarioVenda] = useState<number | ''>(pedidoInicial?.preco_unitario_original || '')
  const [dataEntrega, setDataEntrega] = useState('')
  const [validadeOrcamento, setValidadeOrcamento] = useState('')
  const [vencimentoEm, setVencimentoEm] = useState('')
  const [parcelas, setParcelas] = useState(pedidoInicial?.parcelas ?? 1)
  const [condicaoPagamento, setCondicaoPagamento] = useState(formaPagamentoInicial(pedidoInicial?.condicao_pagamento))

  // UI state
  const [sucesso, setSucesso] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // ─── ADD ITEMS ──────────────────────────────────────────────────
  function addMaterial() {
    setMateriais([...materiais, { id: crypto.randomUUID(), filamentoId: '', pesoGasto: '' }])
  }
  function removeMaterial(id: string) {
    setMateriais(materiais.filter(m => m.id !== id))
  }
  function addInsumo() {
    setInsumos([...insumos, { id: crypto.randomUUID(), insumoId: '', quantidade: '' }])
  }
  function removeInsumo(id: string) {
    setInsumos(insumos.filter(i => i.id !== id))
  }
  function alterarQuantidade(novaQuantidade: number) {
    if (!Number.isSafeInteger(novaQuantidade) || novaQuantidade < 1) return
    const fator = novaQuantidade / quantidade
    const escalar = (valor: number | '') => valor === '' ? '' : Math.round(Number(valor) * fator * 1000) / 1000
    setTempoHoras(escalar(tempoHoras))
    setMateriais(lista => lista.map(item => ({ ...item, pesoGasto: escalar(item.pesoGasto) })))
    setInsumos(lista => lista.map(item => ({ ...item, quantidade: escalar(item.quantidade) })))
    setQuantidade(novaQuantidade)
  }

  // ─── CALCULATIONS ────────────────────────────────────────────────
  const th = Number(tempoHoras) || 0
  const impressoraSelecionada = impressoras.find(item => item.id === Number(impressoraId))
  const potenciaAplicada = impressoraSelecionada?.potencia_w ?? potenciaW
  const custoHoraAplicado = impressoraSelecionada && impressoraSelecionada.custo_hora > 0
    ? impressoraSelecionada.custo_hora
    : custoHoraMaquina
  const calculo = useMemo(() => calcularPrecoPlanilha({
    tipoPedido,
    quantidade,
    tempoImpressaoHoras: th >= 0 ? th : 0,
    potenciaW: potenciaAplicada,
    tarifaEnergiaKwh: tarifaEnergia,
    custoHoraMaquina: custoHoraAplicado,
    materiais: materiais.map((material) => {
      const filamento = filamentos.find(f => f.id === Number(material.filamentoId))
      const peso = Number(material.pesoGasto)
      return {
        pesoGramas: Number.isFinite(peso) && peso >= 0 ? peso : 0,
        custoPorGrama: filamento ? filamento.preco_rolo / filamento.peso_rolo_gramas : 0,
      }
    }),
    custoInsumos: insumos.reduce((acc, ins) => {
      if (!ins.insumoId || !ins.quantidade) return acc
      const item = insumosList.find(i => i.id === Number(ins.insumoId))
      return item ? acc + Number(ins.quantidade) * item.custo_unitario : acc
    }, 0),
    materiaisAvulsosPorUnidade: Number(materiaisAvulsosPorUnidade) || 0,
    horasTrabalhoAtivo: Number(horasTrabalhoAtivo) || 0,
    valorHoraTrabalho,
    custoEmbalagem: Number(custoEmbalagem) || 0,
    fretePago: Number(fretePago) || 0,
    setupProjeto: Number(setupProjeto) || 0,
    margemPerdas,
    taxaVenda,
    fatorB2CPersonalizado,
    fatorB2BPiloto,
    fatorB2BRecorrente,
    pedidoMinimoB2B,
  }), [
    tipoPedido, quantidade, th, potenciaAplicada, tarifaEnergia, custoHoraAplicado,
    materiais, filamentos, insumos, insumosList, materiaisAvulsosPorUnidade,
    horasTrabalhoAtivo, valorHoraTrabalho, custoEmbalagem, fretePago,
    setupProjeto, margemPerdas, taxaVenda, fatorB2CPersonalizado,
    fatorB2BPiloto, fatorB2BRecorrente, pedidoMinimoB2B,
  ])
  const custoFilamento = calculo.filamentoSemPerdas
  const reservaMaquina = calculo.reservaMaquina
  const custoInsumos = arredondarMoeda(insumos.reduce((acc, ins) => {
    if (!ins.insumoId || !ins.quantidade) return acc
    const item = insumosList.find(i => i.id === Number(ins.insumoId))
    if (!item) return acc
    return acc + (Number(ins.quantidade) * item.custo_unitario)
  }, 0))

  // O preço comercial informado prevalece sobre a sugestão da planilha.
  const desc = Number(desconto) || 0
  const freteC = Number(freteCobrado) || 0
  const referenciaPreco = referenciasPrecos.find((item) => (
    item.cliente_id === Number(clienteId) &&
    normalizarChaveTexto(item.nome_da_peca) === normalizarChaveTexto(nomeDaPeca)
  ))
  const precoHistorico = referenciaPreco?.preco_unitario ?? null
  const precoAutomatico = aplicarPisoHistorico(calculo.precoUnitarioArredondado, precoHistorico)
  const precoUnitario = precoUnitarioVenda === '' ? null : Number(precoUnitarioVenda)
  const precoAplicado = precoUnitario ?? precoAutomatico
  // Enquanto o formulário ainda está vazio, a sugestão pode ser R$ 0,00.
  // Nesse estado não existe preço unitário comercial: usamos apenas o custo
  // calculado na prévia e deixamos a validação positiva para o envio.
  const precoAplicadoValido = Number.isFinite(precoAplicado) && precoAplicado > 0 ? precoAplicado : null
  const baseComercial = precoAplicadoValido === null
    ? calculo.totalArredondado
    : arredondarMoeda(precoAplicadoValido * quantidade)
  const valorFinal = calcularValorVenda({
    custoCalculado: baseComercial,
    quantidade,
    precoUnitario: precoAplicadoValido,
    desconto: Math.min(desc, baseComercial + freteC),
    freteCobrado: freteC,
  })
  const taxasEstimadas = arredondarMoeda(valorFinal * taxaVenda)
  const lucroEstimado = arredondarMoeda(valorFinal - taxasEstimadas - calculo.custoCompleto)

  // ─── SUBMIT ──────────────────────────────────────────────────────
  function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault()
    setErrorMsg('')
    
    if (!nomeDaPeca || !clienteId || th <= 0) {
      setErrorMsg('Preencha os dados básicos corretamente.')
      return
    }
    if (precoUnitario !== null && (!Number.isFinite(precoUnitario) || precoUnitario <= 0)) {
      setErrorMsg('Informe um preço de venda unitário válido.')
      return
    }
    if (precoAplicadoValido === null) {
      setErrorMsg('O preço calculado precisa ser maior que zero antes de salvar.')
      return
    }
    if (desc > baseComercial + freteC) {
      setErrorMsg('O desconto não pode ser maior que o valor do orçamento.')
      return
    }

    const payloadMateriais = materiais
      .filter(m => m.filamentoId && m.pesoGasto)
      .map(m => ({ filamento_id: Number(m.filamentoId), peso_gasto_gramas: Number(m.pesoGasto) }))

    const payloadInsumos = insumos
      .filter(i => i.insumoId && i.quantidade)
      .map(i => ({ insumo_id: Number(i.insumoId), quantidade: Number(i.quantidade) }))

    startTransition(async () => {
      const res = await criarPedido({
        nome_da_peca: nomeDaPeca,
        cliente_id: Number(clienteId),
        tempo_impressao_horas: th,
        quantidade,
        tipo_pedido: tipoPedido,
        materials: payloadMateriais,
        insumos: payloadInsumos,
        materiais_avulsos_por_unidade: Number(materiaisAvulsosPorUnidade) || 0,
        horas_trabalho_ativo: Number(horasTrabalhoAtivo) || 0,
        setup_projeto: Number(setupProjeto) || 0,
        margem_perdas: margemPerdas,
        impressora_id: impressoraId ? Number(impressoraId) : null,
        custo_embalagem: Number(custoEmbalagem) || 0,
        desconto: desc,
        frete_cobrado: freteC,
        frete_pago: Number(fretePago) || 0,
        data_entrega: dataEntrega || undefined,
        validade_orcamento: validadeOrcamento || undefined,
        vencimento_em: vencimentoEm || undefined,
        parcelas,
        condicao_pagamento: condicaoPagamento,
        pedido_origem_id: pedidoInicial?.origem_id,
        preco_unitario: precoUnitario ?? undefined,
      })

      if (res.success) {
        setSucesso(true)
        setTimeout(() => router.push(res.pedidoId ? `/pedidos/${res.pedidoId}` : '/orcamentos'), 1200)
      } else {
        setErrorMsg(res.message)
      }
    })
  }

  const fmt = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')

  if (sucesso) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 size={40} />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-white">Orçamento Gerado!</h2>
        <p className="text-sm text-white/50">O orçamento foi salvo como rascunho. Aprove-o antes de iniciar a produção.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start shrink-0">
      <form onSubmit={handleSubmit} className="flex-1 space-y-8">
        {pedidoInicial && <div className="rounded-xl border border-[#d8f45a]/20 bg-[#d8f45a]/[0.06] p-4 text-xs leading-5 text-[#d8f45a]/80">
          Cópia de {pedidoInicial.origem_numero ?? `pedido #${pedidoInicial.origem_id}`} (valor anterior: {pedidoInicial.valor_total_original.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). O preço comercial por unidade foi preservado; os custos técnicos serão recalculados com os valores atuais. Cliente, datas, pagamentos e produção anterior não serão copiados.
        </div>}
        
        {/* 1. Dados Básicos */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl">
          <h2 className="mb-5 text-sm font-semibold text-white">Dados do Pedido</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-medium text-white/55">Nome da peça / Projeto</span>
              <input required value={nomeDaPeca} onChange={e => setNomeDaPeca(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Cliente</span>
              <select required value={clienteId} onChange={e => setClienteId(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none">
                <option value="" disabled>Selecione...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Quantidade de peças</span>
              <input required type="number" step="1" min="1" max="100000" value={quantidade} onChange={e => alterarQuantidade(Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Tempo de Impressão (Horas)</span>
              <input required type="number" step="0.1" min="0" value={tempoHoras} onChange={e => setTempoHoras(Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Tipo de pedido</span>
              <select value={tipoPedido} onChange={e => setTipoPedido(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none">
                {TIPOS_PEDIDO.map(tipo => <option key={tipo}>{tipo}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Impressora usada no cálculo</span>
              <select value={impressoraId} onChange={e => setImpressoraId(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none">
                <option value="">Configuração geral</option>
                {impressoras.filter(item => item.status !== 'Inativa').map(item => (
                  <option key={item.id} value={item.id}>{item.nome}{item.modelo ? ` — ${item.modelo}` : ''}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* 2. Filamentos */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Materiais e Cores</h2>
          </div>
          <div className="space-y-4">
            {materiais.map((m, idx) => (
              <div key={m.id} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <label className="flex-1 flex flex-col gap-2">
                  {idx === 0 && <span className="text-[11px] font-medium uppercase text-white/30">Filamento</span>}
                  <select value={m.filamentoId} onChange={e => {
                    const newM = [...materiais]; newM[idx].filamentoId = e.target.value; setMateriais(newM)
                  }} className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none">
                    <option value="" disabled>Selecione...</option>
                    {filamentos.map(f => <option key={f.id} value={f.id}>{f.material} {f.cor}</option>)}
                  </select>
                </label>
                <label className="flex w-full flex-col gap-2 sm:w-32">
                  {idx === 0 && <span className="text-[11px] font-medium uppercase text-white/30">Gramas</span>}
                  <input type="number" step="0.1" min="0" value={m.pesoGasto} onChange={e => {
                    const newM = [...materiais]; newM[idx].pesoGasto = Number(e.target.value); setMateriais(newM)
                  }} className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
                </label>
                <button type="button" onClick={() => removeMaterial(m.id)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] text-white/30 hover:bg-white/[0.05] hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addMaterial} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.15] py-3 text-xs font-medium text-white/50 hover:border-[#d8f45a]/50 hover:text-[#d8f45a] hover:bg-[#d8f45a]/5 transition">
              <Plus size={14} /> Adicionar filamento
            </button>
          </div>
        </section>

        {/* 3. Insumos */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Insumos Extras</h2>
          </div>
          <div className="space-y-4">
            {insumos.map((ins, idx) => (
              <div key={ins.id} className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <label className="flex-1 flex flex-col gap-2">
                  {idx === 0 && <span className="text-[11px] font-medium uppercase text-white/30">Insumo</span>}
                  <select value={ins.insumoId} onChange={e => {
                    const newI = [...insumos]; newI[idx].insumoId = e.target.value; setInsumos(newI)
                  }} className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none">
                    <option value="" disabled>Selecione...</option>
                    {insumosList.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                </label>
                <label className="flex w-full flex-col gap-2 sm:w-32">
                  {idx === 0 && <span className="text-[11px] font-medium uppercase text-white/30">Quantidade</span>}
                  <input type="number" step="0.1" min="0" value={ins.quantidade} onChange={e => {
                    const newI = [...insumos]; newI[idx].quantidade = Number(e.target.value); setInsumos(newI)
                  }} className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
                </label>
                <button type="button" onClick={() => removeInsumo(ins.id)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.1] text-white/30 hover:bg-white/[0.05] hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addInsumo} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.15] py-3 text-xs font-medium text-white/50 hover:border-[#d8f45a]/50 hover:text-[#d8f45a] hover:bg-[#d8f45a]/5 transition">
              <Plus size={14} /> Adicionar insumo (suporte, lixa, etc)
            </button>
          </div>
        </section>

        {/* 4. Logística e Faturamento */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl">
          <h2 className="mb-5 text-sm font-semibold text-white">Logística & Descontos</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Data de Entrega</span>
              <input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Validade do Orçamento</span>
              <input type="date" value={validadeOrcamento} onChange={e => setValidadeOrcamento(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Vencimento do Pagamento</span>
              <input type="date" value={vencimentoEm} onChange={e => setVencimentoEm(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Forma / Condição</span>
              <select value={condicaoPagamento} onChange={e => setCondicaoPagamento(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none">
                {['Pix', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Outro'].map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Parcelas</span>
              <input type="number" min="1" max="120" step="1" value={parcelas} onChange={e => setParcelas(Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-[#d8f45a]">Preço de venda por unidade (R$)</span>
              <input type="number" min="0.01" step="0.01" placeholder={`Automático: ${fmt(precoAutomatico)}`} value={precoUnitarioVenda}
                onChange={e => setPrecoUnitarioVenda(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-11 rounded-lg border border-[#d8f45a]/30 bg-[#d8f45a]/[0.05] px-3 text-sm text-white focus:border-[#d8f45a] outline-none" />
              <span className="text-[10px] text-white/30">Editável. Vazio usa o maior valor entre a sugestão e o histórico deste cliente.</span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-[#d8f45a]">Desconto (R$)</span>
              <input type="number" step="0.01" min="0" value={desconto} onChange={e => setDesconto(Number(e.target.value))}
                className="h-11 rounded-lg border border-[#d8f45a]/30 bg-[#d8f45a]/[0.05] px-3 text-sm text-white focus:border-[#d8f45a] outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Frete Cobrado do Cliente (R$)</span>
              <input type="number" step="0.01" min="0" value={freteCobrado} onChange={e => setFreteCobrado(Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Frete Pago (Custo real) (R$)</span>
              <input type="number" step="0.01" min="0" value={fretePago} onChange={e => setFretePago(Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-medium text-white/55">Custo com Embalagem (R$)</span>
              <input type="number" step="0.01" min="0" value={custoEmbalagem} onChange={e => setCustoEmbalagem(Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Materiais avulsos por unidade (R$)</span>
              <input type="number" step="0.01" min="0" value={materiaisAvulsosPorUnidade} onChange={e => setMateriaisAvulsosPorUnidade(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Horas de trabalho ativo</span>
              <input type="number" step="0.01" min="0" value={horasTrabalhoAtivo} onChange={e => setHorasTrabalhoAtivo(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
              <span className="text-[10px] text-white/30">Somente modelagem, preparo e acabamento; não conte a impressora sozinha.</span>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Setup / projeto total (R$)</span>
              <input type="number" step="0.01" min="0" value={setupProjeto} onChange={e => setSetupProjeto(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Margem para perdas</span>
              <div className="relative">
                <input type="number" step="1" min="0" max="100" value={arredondarMoeda(margemPerdas * 100)} onChange={e => setMargemPerdas(Number(e.target.value) / 100)}
                  className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 pr-8 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
                <span className="absolute right-3 top-3 text-sm text-white/35">%</span>
              </div>
            </label>
          </div>
        </section>

      </form>

      {/* Painel Lateral - Resumo */}
      <aside className="sticky top-6 w-full lg:w-[360px] rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 shadow-2xl">
        <h2 className="mb-6 text-sm font-semibold text-white">Resumo do Orçamento</h2>
        
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-white/60">
            <span>Filamentos</span><span className="font-mono text-white/80">{fmt(custoFilamento)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Reserva para perdas ({arredondarMoeda(margemPerdas * 100)}%)</span><span className="font-mono text-white/80">{fmt(calculo.reservaPerdas)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Insumos extras</span><span className="font-mono text-white/80">{fmt(custoInsumos)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span className="flex items-center gap-1"><Zap size={13} className="text-amber-400"/> Energia ({(potenciaAplicada/1000).toFixed(2)}kW)</span>
            <span className="font-mono text-white/80">{fmt(calculo.energia)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Reserva Máquina</span><span className="font-mono text-white/80">{fmt(reservaMaquina)}</span>
          </div>
          {calculo.materiaisAvulsos > 0 && <div className="flex justify-between text-white/60"><span>Materiais avulsos</span><span className="font-mono text-white/80">{fmt(calculo.materiaisAvulsos)}</span></div>}
          {calculo.maoObraAtiva > 0 && <div className="flex justify-between text-white/60"><span>Mão de obra ativa</span><span className="font-mono text-white/80">{fmt(calculo.maoObraAtiva)}</span></div>}
          {calculo.setupProjeto > 0 && <div className="flex justify-between text-white/60"><span>Setup / projeto</span><span className="font-mono text-white/80">{fmt(calculo.setupProjeto)}</span></div>}
          {Number(custoEmbalagem) > 0 && (
            <div className="flex justify-between text-white/60">
              <span>Embalagem</span><span className="font-mono text-white/80">{fmt(Number(custoEmbalagem))}</span>
            </div>
          )}
          {calculo.fretePago > 0 && <div className="flex justify-between text-white/60"><span>Frete pago</span><span className="font-mono text-white/80">{fmt(calculo.fretePago)}</span></div>}
          
          <div className="my-3 h-px w-full bg-white/[0.08]" />
          
          <div className="flex justify-between font-medium text-white/80">
            <span>Custo completo</span><span className="font-mono">{fmt(calculo.custoCompleto)}</span>
          </div>

          <div className="flex justify-between text-white/60">
            <span>Preço mínimo sem prejuízo</span><span className="font-mono text-white/80">{fmt(calculo.precoMinimo)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Sugestão ({calculo.fatorAplicado.toFixed(2)}×)</span><span className="font-mono text-white/80">{fmt(calculo.totalArredondado)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Sugestão por unidade</span><span className="font-mono text-white/80">{fmt(calculo.precoUnitarioArredondado)}</span>
          </div>

          {referenciaPreco && <div className="rounded-lg border border-blue-400/15 bg-blue-400/[0.06] p-3 text-xs text-blue-200/75">
            Último preço para este cliente: <strong>{fmt(referenciaPreco.preco_unitario)}/un.</strong> em {new Date(referenciaPreco.data_pedido).toLocaleDateString('pt-BR')}.
            {precoHistorico && precoHistorico > calculo.precoUnitarioArredondado && ' Esse valor foi mantido como piso automático.'}
          </div>}

          <div className="flex justify-between font-medium text-[#d8f45a]">
            <span>Preço aplicado ({quantidade} × {fmt(precoAplicado)})</span><span className="font-mono">{fmt(baseComercial)}</span>
          </div>

          {precoAplicado !== calculo.precoUnitarioArredondado && (
            <button type="button" onClick={() => setPrecoUnitarioVenda(calculo.precoUnitarioArredondado)} className="text-left text-[11px] text-[#d8f45a]/70 underline underline-offset-2">
              Usar preço sugerido de {fmt(calculo.precoUnitarioArredondado)} por unidade
            </button>
          )}
          {precoUnitario !== null && (
            <button type="button" onClick={() => setPrecoUnitarioVenda('')} className="ml-3 text-left text-[11px] text-white/45 underline underline-offset-2">
              Restaurar preço automático
            </button>
          )}

          {(desc > 0 || freteC > 0) && (
            <div className="pt-2 space-y-2">
              {desc > 0 && <div className="flex justify-between text-red-400"><span className="text-xs">Desconto</span><span className="font-mono">- {fmt(desc)}</span></div>}
              {freteC > 0 && <div className="flex justify-between text-blue-400"><span className="text-xs">Frete Cobrado</span><span className="font-mono">+ {fmt(freteC)}</span></div>}
            </div>
          )}
          {taxasEstimadas > 0 && <div className="flex justify-between text-white/60"><span>Taxas estimadas</span><span className="font-mono text-white/80">{fmt(taxasEstimadas)}</span></div>}

          {valorFinal < calculo.precoMinimo && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-300">
              Atenção: o valor final está abaixo do preço mínimo sem prejuízo calculado pela planilha.
            </div>
          )}
          {precoHistorico && precoAplicado < precoHistorico && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-200">
              O preço manual está abaixo dos {fmt(precoHistorico)} por unidade cobrados anteriormente deste cliente.
            </div>
          )}

          <div className="mt-4 rounded-xl bg-white/[0.03] p-4 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Valor final do orçamento</span>
            <div className="mt-1 text-3xl font-bold tracking-tight text-[#d8f45a]">
              {fmt(valorFinal)}
            </div>
            <p className={`mt-2 text-xs ${lucroEstimado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Lucro estimado: {fmt(lucroEstimado)}</p>
          </div>
        </div>

        {errorMsg && <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">{errorMsg}</div>}

        <button onClick={handleSubmit} disabled={isPending}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d8f45a] py-3.5 text-sm font-bold text-[#15180d] transition hover:bg-[#e4ff76] disabled:opacity-50">
          {isPending ? 'Salvando...' : 'Gerar Orçamento'}
          <ChevronRight size={16} />
        </button>
      </aside>
    </div>
  )
}
