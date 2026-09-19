'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, ShieldCheck, Upload } from 'lucide-react'
import {
  executarImportacaoPlanilha,
  prepararImportacaoPlanilha,
  type ImportacaoHistorico,
  type ImportacaoReport,
} from '@/app/actions/importacao-planilha'

const COUNT_LABELS: Record<string, string> = {
  clientes: 'Clientes', pedidos: 'Pedidos e vendas', recebimentos: 'Recebimentos',
  despesas: 'Despesas', retiradasReclassificadas: 'Retiradas reclassificadas',
  movimentosCapital: 'Aportes/retiradas', produtosFilamento: 'Produtos de filamento',
  lotesFilamento: 'Lotes de filamento', insumos: 'Materiais e insumos',
}

const TOTAL_LABELS: Record<string, string> = {
  vendas: 'Vendas registradas', recebido: 'Recebido', saldoAbertoPlanilha: 'A receber',
  gastosOriginais: 'Saídas originais', despesasOperacionais: 'Despesas operacionais',
  retiradasReclassificadas: 'Retiradas do proprietário',
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function ImportacaoPlanilha({ history }: { history: ImportacaoHistorico[] }) {
  const [isPending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [report, setReport] = useState<ImportacaoReport | null>(null)
  const [importacaoId, setImportacaoId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [allowMerge, setAllowMerge] = useState(false)
  const [completed, setCompleted] = useState(false)

  const existingCount = useMemo(() => Object.values(report?.baseAtual ?? {}).reduce((sum, value) => sum + value, 0), [report])

  function analyze(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return setMessage({ type: 'error', text: 'Selecione a planilha antes de analisar.' })
    const formData = new FormData()
    formData.set('arquivo', file)
    setMessage(null)
    setCompleted(false)
    startTransition(async () => {
      const result = await prepararImportacaoPlanilha(formData)
      setReport(result.report ?? null)
      setImportacaoId(result.importacaoId ?? null)
      setMessage({ type: result.success ? 'success' : 'error', text: result.message })
    })
  }

  function confirmImport() {
    if (!importacaoId || !report?.valido) return
    setMessage(null)
    startTransition(async () => {
      const result = await executarImportacaoPlanilha(importacaoId, allowMerge)
      setReport(result.report ?? report)
      setCompleted(result.success)
      setMessage({ type: result.success ? 'success' : 'error', text: result.message })
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#d8f45a]/10 text-[#d8f45a]"><Upload size={19} /></div>
          <div>
            <h2 className="text-sm font-semibold text-white">1. Envie e valide</h2>
            <p className="mt-1 text-xs leading-5 text-white/40">A prévia não altera clientes, pedidos, estoque ou financeiro. Aceita até 5 MB no formato .xlsx.</p>
          </div>
        </div>
        <form onSubmit={analyze} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-white/[0.14] bg-black/20 px-4 py-2.5 text-xs text-white/55 hover:border-[#d8f45a]/40">
            <FileSpreadsheet size={16} className="text-[#d8f45a]" />
            <span className="min-w-0 truncate">{file?.name ?? 'Selecionar Controle_Salge3D.xlsx'}</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <button disabled={isPending || !file} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#d8f45a] px-5 text-xs font-semibold text-[#15180d] disabled:opacity-50">
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Analisar planilha
          </button>
        </form>
      </section>

      {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-[#d8f45a]/20 bg-[#d8f45a]/[0.07] text-[#d8f45a]' : 'border-red-500/20 bg-red-500/[0.07] text-red-300'}`}>{message.text}</div>}

      {report && (
        <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            {report.valido ? <CheckCircle2 size={19} className="text-[#d8f45a]" /> : <AlertTriangle size={19} className="text-red-400" />}
            <div>
              <h2 className="text-sm font-semibold">2. Prévia da importação</h2>
              <p className="mt-1 text-xs text-white/35">{report.arquivo.nome} · {(report.arquivo.tamanho / 1024).toFixed(0)} KB</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(report.contagens).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
                <p className="text-[11px] text-white/35">{COUNT_LABELS[key] ?? key}</p>
                <p className="mt-1 text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.07]">
            {Object.entries(report.totais).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 text-xs last:border-0">
                <span className="text-white/45">{TOTAL_LABELS[key] ?? key}</span><span className="font-medium text-white/80">{money(value)}</span>
              </div>
            ))}
          </div>

          {report.erros.length > 0 && <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4"><p className="text-xs font-semibold text-red-300">Erros bloqueantes</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-red-200/70">{report.erros.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          {report.avisos.length > 0 && <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4"><p className="text-xs font-semibold text-amber-300">Ajustes e avisos</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-amber-100/60">{report.avisos.map((item) => <li key={item}>{item}</li>)}</ul></div>}

          {existingCount > 0 && !completed && (
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-xs leading-5 text-amber-100/70">
              <input type="checkbox" checked={allowMerge} onChange={(event) => setAllowMerge(event.target.checked)} className="mt-1 accent-[#d8f45a]" />
              <span>O ERP já contém {existingCount} registro(s) operacionais. Confirmo que desejo adicionar a planilha aos dados existentes. IDs externos repetidos continuarão bloqueados.</span>
            </label>
          )}

          <div className="mt-6 flex flex-col items-end gap-2">
            <button type="button" onClick={confirmImport} disabled={isPending || completed || !report.valido || existingCount > 0 && !allowMerge} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#d8f45a] px-5 text-xs font-semibold text-[#15180d] disabled:opacity-40">
              {isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {completed ? 'Importação concluída' : 'Confirmar importação'}
            </button>
            <p className="text-[10px] text-white/25">Um backup automático é criado imediatamente antes da gravação.</p>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 sm:p-8">
        <h2 className="text-sm font-semibold">Histórico</h2>
        <div className="mt-4 divide-y divide-white/[0.06]">
          {history.length === 0 && <p className="py-4 text-xs text-white/35">Nenhuma importação registrada.</p>}
          {history.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-xs"><div className="min-w-0"><p className="truncate text-white/65">{item.nome_arquivo}</p><p className="mt-1 text-[10px] text-white/25">{new Date(item.criado_em).toLocaleString('pt-BR')}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${item.status === 'Concluida' ? 'bg-[#d8f45a]/10 text-[#d8f45a]' : item.status === 'Falhou' ? 'bg-red-500/10 text-red-300' : 'bg-white/[0.06] text-white/45'}`}>{item.status}</span></div>)}
        </div>
      </section>
    </div>
  )
}
