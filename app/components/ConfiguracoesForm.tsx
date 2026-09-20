'use client'

import { useState, useTransition } from 'react'
import { Settings2, Save, Download, FileSpreadsheet, Upload } from 'lucide-react'
import Link from 'next/link'
import { salvarConfiguracoes, type ConfiguracoesTenant } from '@/app/actions/configuracoes'

export function ConfiguracoesForm({ initialData }: { initialData: ConfiguracoesTenant }) {
  const [isPending, startTransition] = useTransition()
  
  const [form, setForm] = useState<ConfiguracoesTenant>(initialData)
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    
    startTransition(async () => {
      const res = await salvarConfiguracoes({
        nome:                   form.nome,
        meta_mensal:           Number(form.meta_mensal),
        taxa_operacional:      Number(form.taxa_operacional),
        custo_hora_maquina:    Number(form.custo_hora_maquina),
        tarifa_energia_kwh:    Number(form.tarifa_energia_kwh),
        potencia_impressora_w: Number(form.potencia_impressora_w),
        saldo_inicial_caixa:   Number(form.saldo_inicial_caixa),
        margem_perdas_padrao:  Number(form.margem_perdas_padrao),
        taxa_venda_padrao:     Number(form.taxa_venda_padrao),
        valor_hora_trabalho:   Number(form.valor_hora_trabalho),
        fator_b2c_personalizado: Number(form.fator_b2c_personalizado),
        fator_b2c_lote:        Number(form.fator_b2c_lote),
        fator_b2b_piloto:      Number(form.fator_b2b_piloto),
        fator_b2b_recorrente:  Number(form.fator_b2b_recorrente),
        pedido_minimo_b2b:     Number(form.pedido_minimo_b2b),
      })
      
      setMsg({ type: res.success ? 'success' : 'error', text: res.message })
    })
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-white/35">
          <span>Sistema</span>
          <span>/</span>
          <span className="text-white/65">Configurações</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[34px]">
          Configurações do Estúdio
        </h1>
        <p className="mt-2 text-sm text-white/40">
          Ajuste as taxas e metas que impactam os cálculos de orçamento e dashboard.
        </p>
      </div>

      <div className="rounded-2xl border border-white/[0.08] bg-[#15171b] shadow-2xl shadow-black/10">
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-6 py-5 sm:px-8">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06] text-[#d8f45a]">
            <Settings2 size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Financeiro</h2>
            <p className="mt-0.5 text-xs text-white/35">Metas e custos operacionais</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-6 p-6 sm:p-8">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-white/55">Nome do negócio</span>
            <input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60" />
          </label>
          
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-white/55">Meta Mensal (R$)</span>
            <input
              required type="number" step="0.01" min="0"
              value={form.meta_mensal}
              onChange={e => setForm(f => ({ ...f, meta_mensal: Number(e.target.value) }))}
              className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#d8f45a]/60"
            />
            <span className="text-[10px] text-white/30">O valor total de faturamento desejado por mês.</span>
          </label>

          <div className="h-px w-full bg-white/[0.06]" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium text-white/55">Custo Hora da Máquina (R$)</span>
              <input
                required type="number" step="0.01" min="0"
                value={form.custo_hora_maquina}
                onChange={e => setForm(f => ({ ...f, custo_hora_maquina: Number(e.target.value) }))}
                className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-[#d8f45a]/60"
              />
              <span className="text-[10px] text-white/30">Reserva por hora para desgaste, manutenção e reposição. A energia é calculada separadamente.</span>
            </label>
          </div>

          <div className="h-px w-full bg-white/[0.06]" />
          <div>
            <h3 className="text-xs font-semibold text-white/70">Premissas de precificação</h3>
            <p className="mt-1 text-[11px] text-white/30">Valores compatíveis com a Calculadora da planilha.</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {([
              ['saldo_inicial_caixa', 'Saldo inicial de caixa (R$)', '0.01'],
              ['valor_hora_trabalho', 'Valor da sua hora (R$)', '0.01'],
              ['margem_perdas_padrao', 'Margem de perdas (0 a 1)', '0.01'],
              ['taxa_venda_padrao', 'Taxa de venda (0 a 1)', '0.01'],
              ['fator_b2c_personalizado', 'Fator B2C personalizado', '0.01'],
              ['fator_b2c_lote', 'Fator B2C lote', '0.01'],
              ['fator_b2b_piloto', 'Fator B2B piloto', '0.01'],
              ['fator_b2b_recorrente', 'Fator B2B recorrente', '0.01'],
              ['pedido_minimo_b2b', 'Pedido mínimo B2B (R$)', '0.01'],
              ['potencia_impressora_w', 'Potência média (W)', '1'],
              ['tarifa_energia_kwh', 'Tarifa de energia (R$/kWh)', '0.01'],
            ] as const).map(([key, label, step]) => (
              <label key={key} className="flex flex-col gap-2">
                <span className="text-xs font-medium text-white/55">{label}</span>
                <input required type="number" step={step} min="0" max={key === 'margem_perdas_padrao' || key === 'taxa_venda_padrao' ? '1' : undefined} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} className="h-11 w-full rounded-lg border border-white/[0.1] bg-[#101114] px-3 text-sm text-white outline-none focus:border-[#d8f45a]/60" />
              </label>
            ))}
          </div>

          {msg && (
            <div className={`mt-2 rounded-lg px-4 py-3 text-xs font-medium ${msg.type === 'success' ? 'bg-[#d8f45a]/10 text-[#d8f45a]' : 'bg-red-500/10 text-red-400'}`}>
              {msg.text}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#d8f45a] px-5 py-2.5 text-xs font-semibold text-[#15180d] hover:bg-[#e4ff76] disabled:opacity-50"
            >
              <Save size={14} />
              {isPending ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6 sm:p-8">
        <h2 className="text-sm font-semibold">Dados e segurança</h2>
        <p className="mt-1 text-xs text-white/35">Baixe cópias locais antes de atualizações importantes.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/configuracoes/importar-planilha" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d]">
            <Upload size={14} /> Importar planilha
          </Link>
          <a href="/api/backup" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d]">
            <Download size={14} /> Backup completo
          </a>
          <a href="/api/exportacao/pedidos" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs text-white/70">
            <FileSpreadsheet size={14} /> Exportar pedidos CSV
          </a>
          <a href="/api/exportacao/financeiro" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs text-white/70">
            <FileSpreadsheet size={14} /> Exportar financeiro CSV
          </a>
          <a href="/api/exportacao/estoque" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-4 py-2.5 text-xs text-white/70">
            <FileSpreadsheet size={14} /> Exportar estoque CSV
          </a>
        </div>
        <div className="mt-5 rounded-lg border border-white/[0.06] bg-black/20 p-4 text-xs text-white/40">
          <p className="font-medium text-white/60">Restauração segura</p>
          <p className="mt-1">Pare o ERP e execute no PowerShell:</p>
          <code className="mt-2 block overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-[#d8f45a]">npm run db:restore -- &quot;C:\caminho\backup.sqlite&quot;</code>
        </div>
      </div>
    </div>
  )
}
