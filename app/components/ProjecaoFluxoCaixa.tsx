import { AlertTriangle, CalendarRange, TrendingDown, TrendingUp } from 'lucide-react'
import type { ProjecaoFluxoCaixa as Projecao } from '@/app/actions/financeiro'

function fmtBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtMes(chave: string) {
  const [ano, mes] = chave.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(ano, mes - 1, 1)))
    .replace('.', '')
}

export function ProjecaoFluxoCaixa({ projecao }: { projecao: Projecao }) {
  const maiorMovimento = Math.max(1, ...projecao.periodos.flatMap((periodo) => [periodo.entradas, periodo.saidas]))
  const riscoCaixa = projecao.menorSaldo < 0

  return (
    <section className="mb-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 font-semibold"><CalendarRange size={17} className="text-[#d8f45a]" /> Previsão de caixa — 6 meses</h2><p className="mt-1 text-xs text-white/35">Parcelas a receber, contas a pagar e movimentações futuras nas datas de vencimento.</p></div>
        <div className="text-right"><p className="text-[10px] uppercase tracking-wider text-white/30">Menor saldo previsto</p><p className={`mt-1 font-mono text-lg font-semibold ${riscoCaixa ? 'text-red-300' : 'text-emerald-400'}`}>{fmtBRL(projecao.menorSaldo)}</p></div>
      </div>
      {riscoCaixa && <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3 text-xs text-red-100/70"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-300" /> A projeção indica caixa negativo. Revise vencimentos, cobranças ou despesas antes desse período.</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projecao.periodos.map((periodo) => (
          <div key={periodo.chave} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
            <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase text-white/55">{fmtMes(periodo.chave)}</p><p className={`font-mono text-xs ${periodo.saldo < 0 ? 'text-red-300' : 'text-[#d8f45a]'}`}>{fmtBRL(periodo.saldo)}</p></div>
            <div className="mt-4 space-y-3">
              <div><div className="mb-1 flex justify-between text-[10px] text-white/40"><span className="flex items-center gap-1"><TrendingUp size={10} className="text-emerald-400" /> Entradas</span><span>{fmtBRL(periodo.entradas)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${periodo.entradas / maiorMovimento * 100}%` }} /></div></div>
              <div><div className="mb-1 flex justify-between text-[10px] text-white/40"><span className="flex items-center gap-1"><TrendingDown size={10} className="text-red-400" /> Saídas</span><span>{fmtBRL(periodo.saidas)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-red-400" style={{ width: `${periodo.saidas / maiorMovimento * 100}%` }} /></div></div>
            </div>
            <div className="mt-4 flex justify-between border-t border-white/[0.05] pt-3 text-xs"><span className="text-white/35">Resultado</span><b className={periodo.resultado < 0 ? 'text-red-300' : 'text-emerald-400'}>{periodo.resultado > 0 ? '+' : ''}{fmtBRL(periodo.resultado)}</b></div>
          </div>
        ))}
      </div>
    </section>
  )
}
