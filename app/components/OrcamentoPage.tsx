'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, CheckCircle2, ChevronRight, Zap } from 'lucide-react'
import { criarPedido } from '@/app/actions/pedidos'
import { useRouter } from 'next/navigation'
import type { Cliente } from '@/app/actions/clientes'
import type { FilamentoCompleto } from '@/app/actions/filamentos'
import type { Insumo } from '@/app/actions/insumos'
import { arredondarMoeda, calcularOrcamento } from '@/lib/orcamento.mjs'

export function OrcamentoPage({ 
  clientes, 
  filamentos, 
  insumosList,
  taxaOperacional, 
  custoHoraMaquina,
  tarifaEnergia,
  potenciaW
}: { 
  clientes: Cliente[]
  filamentos: FilamentoCompleto[]
  insumosList: Insumo[]
  taxaOperacional: number
  custoHoraMaquina: number
  tarifaEnergia: number
  potenciaW: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Basic info
  const [nomeDaPeca, setNomeDaPeca] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [tempoHoras, setTempoHoras] = useState<number | ''>('')
  
  // Arrays
  const [materiais, setMateriais] = useState<{ id: string; filamentoId: string; pesoGasto: number | '' }[]>([])
  const [insumos, setInsumos] = useState<{ id: string; insumoId: string; quantidade: number | '' }[]>([])

  // Faturamento e Custos Extras
  const [desconto, setDesconto] = useState<number | ''>('')
  const [freteCobrado, setFreteCobrado] = useState<number | ''>('')
  const [fretePago, setFretePago] = useState<number | ''>('')
  const [custoEmbalagem, setCustoEmbalagem] = useState<number | ''>('')
  const [dataEntrega, setDataEntrega] = useState('')

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

  // ─── CALCULATIONS ────────────────────────────────────────────────
  const th = Number(tempoHoras) || 0
  const totaisBasicos = useMemo(() => calcularOrcamento({
    tempoImpressaoHoras: th >= 0 ? th : 0,
    custoHoraMaquina,
    taxaOperacional,
    materiais: materiais.map((material) => {
      const filamento = filamentos.find(f => f.id === Number(material.filamentoId))
      const peso = Number(material.pesoGasto)
      return {
        pesoGramas: Number.isFinite(peso) && peso >= 0 ? peso : 0,
        custoPorGrama: filamento ? filamento.preco_rolo / filamento.peso_rolo_gramas : 0,
      }
    }),
  }), [th, custoHoraMaquina, taxaOperacional, materiais, filamentos])
  const custoFilamento = totaisBasicos.materialCost
  const reservaMaquina = totaisBasicos.machineReserve

  // Insumos
  const custoInsumos = arredondarMoeda(insumos.reduce((acc, ins) => {
    if (!ins.insumoId || !ins.quantidade) return acc
    const item = insumosList.find(i => i.id === Number(ins.insumoId))
    if (!item) return acc
    return acc + (Number(ins.quantidade) * item.custo_unitario)
  }, 0))

  // Energia: (Potência Watts / 1000) * Horas * Tarifa(R$/kWh)
  const custoEnergia = arredondarMoeda((potenciaW / 1000) * th * tarifaEnergia)

  // Base
  const custoBase = arredondarMoeda(
    custoFilamento + custoInsumos + custoEnergia + reservaMaquina +
    totaisBasicos.operationalFee + (Number(custoEmbalagem) || 0),
  )
  
  // Total = Base - Desconto + FreteCobrado
  const desc = Number(desconto) || 0
  const freteC = Number(freteCobrado) || 0
  const valorFinal = arredondarMoeda(Math.max(0, custoBase - desc + freteC))

  // ─── SUBMIT ──────────────────────────────────────────────────────
  function handleSubmit(e?: React.SyntheticEvent) {
    e?.preventDefault()
    setErrorMsg('')
    
    if (!nomeDaPeca || !clienteId || th <= 0) {
      setErrorMsg('Preencha os dados básicos corretamente.')
      return
    }
    if (desc > custoBase + freteC) {
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
        materials: payloadMateriais,
        insumos: payloadInsumos,
        custo_embalagem: Number(custoEmbalagem) || 0,
        desconto: desc,
        frete_cobrado: freteC,
        frete_pago: Number(fretePago) || 0,
        data_entrega: dataEntrega || undefined
      })

      if (res.success) {
        setSucesso(true)
        setTimeout(() => router.push('/'), 1500)
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
        <p className="text-sm text-white/50">O pedido foi salvo e está na fila de produção.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start shrink-0">
      <form onSubmit={handleSubmit} className="flex-1 space-y-8">
        
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
              <span className="text-xs font-medium text-white/55">Tempo de Impressão (Horas)</span>
              <input required type="number" step="0.1" min="0" value={tempoHoras} onChange={e => setTempoHoras(Number(e.target.value))}
                className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white focus:border-[#d8f45a]/60 outline-none" />
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
            <span>Insumos extras</span><span className="font-mono text-white/80">{fmt(custoInsumos)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span className="flex items-center gap-1"><Zap size={13} className="text-amber-400"/> Energia ({(potenciaW/1000).toFixed(2)}kW)</span>
            <span className="font-mono text-white/80">{fmt(custoEnergia)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Reserva Máquina</span><span className="font-mono text-white/80">{fmt(reservaMaquina)}</span>
          </div>
          <div className="flex justify-between text-white/60">
            <span>Taxa Operacional</span><span className="font-mono text-white/80">{fmt(totaisBasicos.operationalFee)}</span>
          </div>
          {Number(custoEmbalagem) > 0 && (
            <div className="flex justify-between text-white/60">
              <span>Embalagem</span><span className="font-mono text-white/80">{fmt(Number(custoEmbalagem))}</span>
            </div>
          )}
          
          <div className="my-3 h-px w-full bg-white/[0.08]" />
          
          <div className="flex justify-between font-medium text-white/80">
            <span>Custo Base</span><span className="font-mono">{fmt(custoBase)}</span>
          </div>

          {(desc > 0 || freteC > 0) && (
            <div className="pt-2 space-y-2">
              {desc > 0 && <div className="flex justify-between text-red-400"><span className="text-xs">Desconto</span><span className="font-mono">- {fmt(desc)}</span></div>}
              {freteC > 0 && <div className="flex justify-between text-blue-400"><span className="text-xs">Frete Cobrado</span><span className="font-mono">+ {fmt(freteC)}</span></div>}
            </div>
          )}

          <div className="mt-4 rounded-xl bg-white/[0.03] p-4 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Valor Final Sugerido</span>
            <div className="mt-1 text-3xl font-bold tracking-tight text-[#d8f45a]">
              {fmt(valorFinal)}
            </div>
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
