'use client'

<<<<<<< HEAD
import { useState, useTransition } from 'react'
import { Plus, Trash2, CheckCircle2, ChevronRight, Package, Zap } from 'lucide-react'
import { criarPedido } from '@/app/actions/pedidos'
import { useRouter } from 'next/navigation'
import type { Cliente } from '@/app/actions/clientes'
import type { FilamentoCompleto } from '@/app/actions/filamentos'
import type { Insumo } from '@/app/actions/insumos'
=======
/**
 * app/components/OrcamentoPage.tsx  —  v3
 *
 * Formulário de orçamento (Client Component).
 * A Sidebar e o DashboardHeader NÃO estão mais aqui —
 * eles são injetados pelo layout app/(dashboard)/layout.tsx.
 */

import { useMemo, useState, useTransition } from 'react'
import {
  Clock3,
  FileText,
  Plus,
  ReceiptText,
  Trash2,
} from 'lucide-react'
import { criarPedido, type Cliente, type Filamento, type ActionResult } from '@/app/actions/pedidos'
import type { PedidoResumo } from '@/app/actions/pedidos'
import { calcularOrcamento } from '@/lib/orcamento.mjs'
import { TabelaPedidos } from './TabelaPedidos'

// ── Constantes de negócio removidas (agora via props/banco) ──────────────

type Material = { id: number; filamento_id: string; peso: string }

// ── Sub-componentes locais ────────────────────────────────────────────────────
function Field({
  label, placeholder, suffix, value, onChange, type = 'text',
}: {
  label: string; placeholder: string; suffix?: string
  value?: string; onChange?: (v: string) => void; type?: string
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium text-white/55">{label}</span>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          type={type}
          placeholder={placeholder}
          className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none placeholder:text-white/20 transition focus:border-[#d8f45a]/60"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-3 text-xs text-white/30">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/45">{label}</span>
      <span className="font-medium text-white/75">{value}</span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
interface OrcamentoPageProps {
  clientes: Cliente[]
  filamentos: Filamento[]
  pedidosRecentes: PedidoResumo[]
  taxaOperacional?: number
  custoHoraMaquina?: number
}
>>>>>>> main

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

<<<<<<< HEAD
  // UI state
  const [sucesso, setSucesso] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
=======
  // ── Cálculo em tempo real ────────────────────────────────────────────────
  const totals = useMemo(() => {
    const tempo = Number(horas)
    return calcularOrcamento({
      tempoImpressaoHoras: Number.isFinite(tempo) && tempo >= 0 ? tempo : 0,
      custoHoraMaquina,
      taxaOperacional,
      materiais: materials.map((mat) => {
        const peso = Number(mat.peso)
        const filamento = filamentos.find((f) => f.id.toString() === mat.filamento_id)
        return {
          pesoGramas: Number.isFinite(peso) && peso >= 0 ? peso : 0,
          custoPorGrama: filamento ? filamento.preco_rolo / filamento.peso_rolo_gramas : 0,
        }
      }),
    })
  }, [materials, horas, filamentos, custoHoraMaquina, taxaOperacional])
>>>>>>> main

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

<<<<<<< HEAD
  // ─── CALCULATIONS ────────────────────────────────────────────────
  const th = Number(tempoHoras) || 0
  const reservaMaquina = th * custoHoraMaquina
  
  // Filamentos
  const custoFilamento = materiais.reduce((acc, m) => {
    if (!m.filamentoId || !m.pesoGasto) return acc
    const fil = filamentos.find(f => f.id === Number(m.filamentoId))
    if (!fil) return acc
    return acc + (Number(m.pesoGasto) * (fil.preco_rolo / fil.peso_rolo_gramas))
  }, 0)
=======
  function resetForm() {
    setNomePeca('')
    setHoras('6.5')
    setClienteId(primeiroCliente)
    setMaterials([{ id: Date.now(), filamento_id: primeiroFilamento, peso: '180' }])
    setResult(null)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleCriar() {
    setResult(null)
    if (!nomePeca.trim()) { setResult({ success: false, message: 'Informe o nome da peça.' }); return }
    if (!clienteId)       { setResult({ success: false, message: 'Selecione um cliente.' });  return }
>>>>>>> main

  // Insumos
  const custoInsumos = insumos.reduce((acc, ins) => {
    if (!ins.insumoId || !ins.quantidade) return acc
    const item = insumosList.find(i => i.id === Number(ins.insumoId))
    if (!item) return acc
    return acc + (Number(ins.quantidade) * item.custo_unitario)
  }, 0)

  // Energia: (Potência Watts / 1000) * Horas * Tarifa(R$/kWh)
  const custoEnergia = (potenciaW / 1000) * th * tarifaEnergia

  // Base
  const custoBase = custoFilamento + custoInsumos + custoEnergia + reservaMaquina + taxaOperacional + (Number(custoEmbalagem) || 0)
  
  // Total = Base - Desconto + FreteCobrado
  const desc = Number(desconto) || 0
  const freteC = Number(freteCobrado) || 0
  const valorFinal = custoBase - desc + freteC

  // ─── SUBMIT ──────────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    
    if (!nomeDaPeca || !clienteId || th <= 0) {
      setErrorMsg('Preencha os dados básicos corretamente.')
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
<<<<<<< HEAD
        nome_da_peca: nomeDaPeca,
        cliente_id: Number(clienteId),
        tempo_impressao_horas: th,
        materials: payloadMateriais,
        insumos: payloadInsumos,
        
        custo_filamento: custoFilamento,
        custo_insumos: custoInsumos,
        custo_energia: custoEnergia,
        valor_reserva_maquina: reservaMaquina,
        taxa_operacional: taxaOperacional,
        custo_embalagem: Number(custoEmbalagem) || 0,
        
        desconto: desc,
        frete_cobrado: freteC,
        frete_pago: Number(fretePago) || 0,
        valor_total_cobrado: valorFinal,
        data_entrega: dataEntrega || undefined
=======
        nome_da_peca:          nomePeca.trim(),
        cliente_id:            parseInt(clienteId, 10),
        tempo_impressao_horas: Number(horas) || 0,
        materials:             materialsValidos,
>>>>>>> main
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
<<<<<<< HEAD
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
            <span>Taxa Operacional</span><span className="font-mono text-white/80">{fmt(taxaOperacional)}</span>
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
=======

              <div className="flex flex-col gap-3">
                {materials.map((mat, index) => {
                  const filSel = filamentos.find((f) => f.id.toString() === mat.filamento_id)
                  const custoItem = filSel && Number(mat.peso) > 0
                    ? (Number(mat.peso) * filSel.preco_rolo) / filSel.peso_rolo_gramas
                    : 0

                  return (
                    <div key={mat.id} className="grid grid-cols-[1fr_150px_36px] items-end gap-3">
                      <label className="flex flex-col gap-2">
                        <span className="text-[11px] text-white/35">
                          {index === 0 ? 'Tipo de filamento' : `Material ${index + 1}`}
                        </span>
                        <select
                          value={mat.filamento_id}
                          onChange={(e) => updateMaterial(mat.id, 'filamento_id', e.target.value)}
                          className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60"
                        >
                          {filamentos.length === 0 && <option value="">Nenhum filamento</option>}
                          {filamentos.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.material} — {f.cor} · R${' '}
                              {(f.preco_rolo / f.peso_rolo_gramas).toFixed(2).replace('.', ',')}/g
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-[11px] text-white/35">
                          {custoItem > 0 ? `Peso · ${fmtBRL(custoItem)}` : 'Peso (gramas)'}
                        </span>
                        <div className="relative">
                          <input
                            value={mat.peso}
                            onChange={(e) => updateMaterial(mat.id, 'peso', e.target.value)}
                            type="number" min="0" step="0.1"
                            className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 pr-9 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#d8f45a]/60"
                            placeholder="0"
                          />
                          <span className="pointer-events-none absolute right-3 top-3 text-xs text-white/30">g</span>
                        </div>
                      </label>

                      <button
                        type="button"
                        onClick={() => removeMaterial(mat.id)}
                        disabled={materials.length === 1}
                        aria-label={`Remover material ${index + 1}`}
                        className="mb-0.5 flex size-11 items-center justify-center rounded-lg text-white/25 transition hover:bg-red-400/10 hover:text-red-300 disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.07] px-6 py-5 sm:px-8">
            <button type="button" onClick={resetForm} className="text-xs text-white/40 transition hover:text-white">
              Cancelar
            </button>
            <div>
              <button
                type="button"
                onClick={handleCriar}
                disabled={isPending || materials.every((material) => Number(material.peso) <= 0)}
                className="rounded-lg bg-[#d8f45a] px-5 py-2.5 text-xs font-semibold text-[#15180d] transition hover:bg-[#e4ff76] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Salvando…' : result?.success ? 'Orçamento criado ✓' : 'Criar orçamento'}
              </button>
>>>>>>> main
            </div>
          </div>
        </div>

<<<<<<< HEAD
        {errorMsg && <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">{errorMsg}</div>}

        <button onClick={handleSubmit} disabled={isPending}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d8f45a] py-3.5 text-sm font-bold text-[#15180d] transition hover:bg-[#e4ff76] disabled:opacity-50">
          {isPending ? 'Salvando...' : 'Gerar Orçamento'}
          <ChevronRight size={16} />
        </button>
      </aside>
=======
        {/* ── Card: Resumo ──────────────────────────────────────────────────── */}
        <aside className="sticky top-6 rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">
          <div className="border-b border-white/[0.07] px-6 py-5">
            <div>
              <h2 className="text-sm font-semibold">Resumo do orçamento</h2>
              <p className="mt-1 text-xs text-white/35">Estimativa em tempo real</p>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-7 rounded-xl border border-white/[0.07] bg-[#101114] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/40">{nomePeca.trim() || 'Peça sem nome'}</span>
                <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/40">Rascunho</span>
              </div>
              <p className="mt-3 text-sm font-medium text-white/80">{clienteSelecionado?.nome ?? '—'}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-white/35">
                <Clock3 size={13} /> {horas || '0'} horas de impressão
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <SummaryRow label="Custo de material"  value={fmtBRL(totals.materialCost)} />
              <SummaryRow label="Reserva de máquina" value={fmtBRL(totals.machineReserve)} />
              <SummaryRow label="Taxa operacional"   value={fmtBRL(totals.operationalFee)} />
            </div>

            <div className="my-6 h-px bg-white/[0.08]" />

            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-white/45">Valor final sugerido</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#d8f45a]">
                  {fmtBRL(totals.total)}
                </p>
              </div>
              <span className="mb-1 rounded-md bg-[#d8f45a]/10 px-2 py-1 text-[10px] font-medium text-[#d8f45a]">
                + taxa op.
              </span>
            </div>

            {/* Discriminação por material */}
            {materials.some((m) => Number(m.peso) > 0) && (
              <div className="mt-5 flex flex-col gap-1.5">
                {materials.map((mat) => {
                  const fil = filamentos.find((f) => f.id.toString() === mat.filamento_id)
                  const custo = fil && Number(mat.peso) > 0
                    ? (Number(mat.peso) * fil.preco_rolo) / fil.peso_rolo_gramas
                    : 0
                  if (!fil || custo === 0) return null
                  return (
                    <div key={mat.id} className="flex justify-between text-[11px] text-white/30">
                      <span>{fil.material} {fil.cor} · {mat.peso}g</span>
                      <span>{fmtBRL(custo)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-7 rounded-lg border border-[#d8f45a]/15 bg-[#d8f45a]/[0.04] p-3 text-xs leading-relaxed text-white/45">
              Este valor considera material, tempo de máquina e taxa operacional.
            </div>
          </div>
        </aside>
      </div>

      {/* Pedidos recentes */}
      {pedidosRecentes.length > 0 && (
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">
          <div className="border-b border-white/[0.07] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-[#d8f45a]">
                <ReceiptText size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Orçamentos recentes</h2>
                <p className="mt-0.5 text-xs text-white/35">{pedidosRecentes.length} registro(s)</p>
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8">
            <TabelaPedidos pedidos={pedidosRecentes} />
          </div>
        </div>
      )}
>>>>>>> main
    </div>
  )
}
