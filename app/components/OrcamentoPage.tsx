'use client'

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
  MoreHorizontal,
  Plus,
  ReceiptText,
  Trash2,
} from 'lucide-react'
import { criarPedido, type Cliente, type Filamento, type ActionResult } from '@/app/actions/pedidos'
import type { PedidoResumo } from '@/app/actions/pedidos'
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

export function OrcamentoPage({ 
  clientes, 
  filamentos, 
  pedidosRecentes,
  taxaOperacional = 18.00,
  custoHoraMaquina = 8.5
}: OrcamentoPageProps) {
  const primeiroFilamento = filamentos[0]?.id.toString() ?? ''
  const primeiroCliente   = clientes[0]?.id.toString() ?? ''

  const [nomePeca, setNomePeca]   = useState('')
  const [horas, setHoras]         = useState('6.5')
  const [clienteId, setClienteId] = useState(primeiroCliente)
  const [materials, setMaterials] = useState<Material[]>([
    { id: 1, filamento_id: primeiroFilamento, peso: '180' },
  ])
  const [isPending, startTransition] = useTransition()
  const [result, setResult]          = useState<ActionResult | null>(null)

  const clienteSelecionado = clientes.find((c) => c.id.toString() === clienteId)

  // ── Cálculo em tempo real ────────────────────────────────────────────────
  const totals = useMemo(() => {
    const materialCost = materials.reduce((sum, mat) => {
      const grams = Number(mat.peso) || 0
      const fil   = filamentos.find((f) => f.id.toString() === mat.filamento_id)
      const rate  = fil ? fil.preco_rolo / fil.peso_rolo_gramas : 0
      return sum + grams * rate
    }, 0)
    const machineReserve = (Number(horas) || 0) * custoHoraMaquina
    return { materialCost, machineReserve, total: materialCost + machineReserve + taxaOperacional }
  }, [materials, horas, filamentos, custoHoraMaquina, taxaOperacional])

  // ── Materiais ────────────────────────────────────────────────────────────
  function addMaterial() {
    setMaterials((c) => [...c, { id: Date.now(), filamento_id: primeiroFilamento, peso: '' }])
  }
  function updateMaterial(id: number, field: 'filamento_id' | 'peso', value: string) {
    setMaterials((c) => c.map((m) => (m.id === id ? { ...m, [field]: value } : m)))
  }
  function removeMaterial(id: number) {
    if (materials.length === 1) return
    setMaterials((c) => c.filter((m) => m.id !== id))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleCriar() {
    setResult(null)
    if (!nomePeca.trim()) { setResult({ success: false, message: 'Informe o nome da peça.' }); return }
    if (!clienteId)       { setResult({ success: false, message: 'Selecione um cliente.' });  return }

    const materialsValidos = materials
      .filter((m) => m.filamento_id && Number(m.peso) > 0)
      .map((m) => ({ filamento_id: parseInt(m.filamento_id, 10), peso_gasto_gramas: Number(m.peso) }))

    if (materialsValidos.length === 0) {
      setResult({ success: false, message: 'Preencha o peso de pelo menos um material.' })
      return
    }

    startTransition(async () => {
      const res = await criarPedido({
        nome_da_peca:          nomePeca.trim(),
        cliente_id:            parseInt(clienteId, 10),
        tempo_impressao_horas: Number(horas) || 0,
        materials:             materialsValidos,
        custo_filamento:       totals.materialCost,
        valor_reserva_maquina: totals.machineReserve,
        taxa_operacional:      taxaOperacional,
        valor_total_cobrado:   totals.total,
      })
      setResult(res)
      if (res.success) {
        setNomePeca('')
        setHoras('6.5')
        setClienteId(primeiroCliente)
        setMaterials([{ id: Date.now(), filamento_id: primeiroFilamento, peso: '180' }])
      }
    })
  }

  const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[1320px] px-6 py-9 lg:px-10">

      {/* Breadcrumb + título */}
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs text-white/35">
            <span>Orçamentos</span>
            <span>/</span>
            <span className="text-white/65">Novo orçamento</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">
            Novo orçamento de impressão 3D
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Preencha os detalhes para gerar uma estimativa precisa.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/35">
          <span className="size-2 rounded-full bg-[#d8f45a] shadow-[0_0_10px_#d8f45a]" />
          {result?.success ? 'Orçamento salvo' : 'Rascunho'}
        </div>
      </div>

      {/* Feedback */}
      {result && (
        <div
          role="alert"
          className={`mb-6 flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium border ${
            result.success
              ? 'bg-[#d8f45a]/5 border-[#d8f45a]/20 text-[#d8f45a]'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <span className="text-lg leading-none">{result.success ? '✅' : '❌'}</span>
          <span>{result.message}</span>
        </div>
      )}

      {/* Grid principal */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">

        {/* ── Card: Formulário ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">

          <div className="border-b border-white/[0.07] px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-[#d8f45a]">
                <FileText size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Detalhes do projeto</h2>
                <p className="mt-0.5 text-xs text-white/35">Informações básicas da peça</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-8 p-6 sm:p-8">
            {/* Nome + Tempo + Cliente */}
            <div className="grid gap-5 sm:grid-cols-[1.5fr_1fr_1.25fr]">
              <Field label="Nome da peça" placeholder="Ex: Suporte articulado" value={nomePeca} onChange={setNomePeca} />
              <Field label="Tempo de impressão" placeholder="6.5" suffix="horas" value={horas} onChange={setHoras} type="number" />
              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-white/55">Cliente</span>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="h-11 rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none transition focus:border-[#d8f45a]/60"
                >
                  {clientes.length === 0 && <option value="">Nenhum cliente</option>}
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
            </div>

            <div className="h-px bg-white/[0.06]" />

            {/* Filamentos */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Filamentos</h3>
                  <p className="mt-1 text-xs text-white/35">Adicione os materiais utilizados.</p>
                </div>
                <button
                  type="button"
                  onClick={addMaterial}
                  className="flex items-center gap-2 rounded-lg border border-[#d8f45a]/25 bg-[#d8f45a]/[0.06] px-3 py-2 text-xs font-medium text-[#d8f45a] transition hover:bg-[#d8f45a]/[0.12]"
                >
                  <Plus size={14} /> Adicionar cor/material
                </button>
              </div>

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
            <button type="button" onClick={() => setResult(null)} className="text-xs text-white/40 transition hover:text-white">
              Cancelar
            </button>
            <div className="flex items-center gap-3">
              <button type="button" disabled={isPending} className="rounded-lg border border-white/[0.1] px-4 py-2.5 text-xs font-medium text-white/65 transition hover:bg-white/[0.05] disabled:opacity-50">
                Salvar rascunho
              </button>
              <button
                type="button"
                onClick={handleCriar}
                disabled={isPending || totals.total === taxaOperacional}
                className="rounded-lg bg-[#d8f45a] px-5 py-2.5 text-xs font-semibold text-[#15180d] transition hover:bg-[#e4ff76] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Salvando…' : result?.success ? 'Orçamento criado ✓' : 'Criar orçamento'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Card: Resumo ──────────────────────────────────────────────────── */}
        <aside className="sticky top-6 rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">
          <div className="border-b border-white/[0.07] px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Resumo do orçamento</h2>
                <p className="mt-1 text-xs text-white/35">Estimativa em tempo real</p>
              </div>
              <button aria-label="Mais opções" className="text-white/30 hover:text-white">
                <MoreHorizontal size={18} />
              </button>
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
              <SummaryRow label="Taxa operacional"   value={fmtBRL(taxaOperacional)} />
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
    </div>
  )
}
