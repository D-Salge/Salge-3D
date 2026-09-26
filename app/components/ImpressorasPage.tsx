'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Activity, AlertTriangle, CircleDollarSign, Gauge, Pencil, Plus,
  Printer, Trash2, Wrench, X,
} from 'lucide-react'
import {
  arquivarImpressora,
  registrarManutencaoImpressora,
  salvarImpressora,
  type Impressora,
  type IndicadoresQualidadeImpressora,
  type ManutencaoImpressora,
} from '@/app/actions/operacao'

const statusOptions: Impressora['status'][] = ['Disponivel', 'Em uso', 'Manutencao', 'Inativa']
const tiposManutencao = ['Preventiva', 'Limpeza', 'Lubrificacao', 'Troca de bico', 'Calibracao', 'Corretiva', 'Outro']

type FormImpressora = Pick<Impressora,
  'id' | 'nome' | 'modelo' | 'potencia_w' | 'custo_hora' | 'bico_atual' |
  'horas_base' | 'intervalo_manutencao_horas' | 'status'>

const formVazio: FormImpressora = {
  id: 0,
  nome: '',
  modelo: '',
  potencia_w: 0,
  custo_hora: 0,
  bico_atual: '',
  horas_base: 0,
  intervalo_manutencao_horas: 250,
  status: 'Disponivel',
}

function hojeLocal() {
  const agora = new Date()
  const deslocamento = agora.getTimezoneOffset() * 60_000
  return new Date(agora.getTime() - deslocamento).toISOString().slice(0, 10)
}

function moeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function horas(valor: number) {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

function classeManutencao(status: Impressora['manutencao_status']) {
  if (status === 'Vencida') return 'border-red-500/25 bg-red-500/10 text-red-300'
  if (status === 'Proxima') return 'border-amber-500/25 bg-amber-500/10 text-amber-300'
  return 'border-[#d8f45a]/20 bg-[#d8f45a]/10 text-[#d8f45a]'
}

export function ImpressorasPage({
  impressoras,
  indicadores,
  manutencoes,
}: {
  impressoras: Impressora[]
  indicadores: IndicadoresQualidadeImpressora[]
  manutencoes: ManutencaoImpressora[]
}) {
  const [isPending, startTransition] = useTransition()
  const [modal, setModal] = useState(false)
  const [modalManutencao, setModalManutencao] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState<FormImpressora>(formVazio)
  const [manutencao, setManutencao] = useState({
    impressoraId: 0,
    tipo: 'Preventiva',
    descricao: '',
    custo: 0,
    realizadaEm: hojeLocal(),
    lancarFinanceiro: true,
    formaPagamento: 'Pix',
  })
  const indicadoresPorImpressora = useMemo(
    () => new Map(indicadores.map((item) => [item.impressora_id, item])),
    [indicadores],
  )

  function abrir(impressora?: Impressora) {
    setErro('')
    setForm(impressora ? {
      id: impressora.id,
      nome: impressora.nome,
      modelo: impressora.modelo,
      potencia_w: impressora.potencia_w,
      custo_hora: impressora.custo_hora,
      bico_atual: impressora.bico_atual,
      horas_base: impressora.horas_base,
      intervalo_manutencao_horas: impressora.intervalo_manutencao_horas,
      status: impressora.status,
    } : formVazio)
    setModal(true)
  }

  function abrirManutencao(impressora: Impressora) {
    setErro('')
    setManutencao({
      impressoraId: impressora.id,
      tipo: 'Preventiva',
      descricao: '',
      custo: 0,
      realizadaEm: hojeLocal(),
      lancarFinanceiro: true,
      formaPagamento: 'Pix',
    })
    setModalManutencao(true)
  }

  function salvar(event: React.FormEvent) {
    event.preventDefault()
    setErro('')
    startTransition(async () => {
      const result = await salvarImpressora(form.id || null, {
        nome: form.nome,
        modelo: form.modelo,
        potencia_w: Number(form.potencia_w),
        custo_hora: Number(form.custo_hora),
        bico_atual: form.bico_atual,
        horas_base: Number(form.horas_base),
        intervalo_manutencao_horas: Number(form.intervalo_manutencao_horas),
        status: form.status,
      })
      if (result.success) setModal(false)
      else setErro(result.message)
    })
  }

  function salvarManutencao(event: React.FormEvent) {
    event.preventDefault()
    setErro('')
    startTransition(async () => {
      const result = await registrarManutencaoImpressora({ ...manutencao, custo: Number(manutencao.custo) })
      if (result.success) setModalManutencao(false)
      else setErro(result.message)
    })
  }

  function arquivar(id: number) {
    if (!confirm('Arquivar esta impressora? O histórico será mantido.')) return
    startTransition(async () => {
      const result = await arquivarImpressora(id)
      if (!result.success) alert(result.message)
    })
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 text-xs text-white/35">Produção / Equipamentos</p>
          <h1 className="text-3xl font-semibold">Impressoras</h1>
          <p className="mt-2 text-sm text-white/40">Capacidade, manutenção preventiva e qualidade por máquina.</p>
        </div>
        <button onClick={() => abrir()} className="flex items-center gap-2 rounded-lg bg-[#d8f45a] px-4 py-2.5 text-xs font-semibold text-[#15180d]"><Plus size={14} /> Nova impressora</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {impressoras.map((impressora) => {
          const percentualBarra = Math.min(impressora.percentual_manutencao, 100)
          return (
            <article key={impressora.id} className="rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#d8f45a]/10 text-[#d8f45a]"><Printer size={19} /></div>
                  <div className="min-w-0"><h2 className="truncate font-semibold">{impressora.nome}</h2><p className="truncate text-xs text-white/40">{impressora.modelo || 'Modelo não informado'}{impressora.bico_atual ? ` · bico ${impressora.bico_atual}` : ''}</p></div>
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-white/55">{impressora.status}</span>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Fila ativa</p><p className="mt-1 text-xl font-semibold">{impressora.pedidos_ativos ?? 0}</p></div>
                <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Horas planejadas</p><p className="mt-1 text-xl font-semibold">{horas(impressora.horas_planejadas ?? 0)}h</p></div>
                <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Horímetro</p><p className="mt-1 font-mono">{horas(impressora.horas_totais)}h</p></div>
                <div className="rounded-xl bg-white/[0.03] p-3"><p className="text-[10px] uppercase text-white/30">Custo/hora</p><p className="mt-1 font-mono">{moeda(impressora.custo_hora)}</p></div>
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.06] bg-[#101114] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-white/55"><Gauge size={14} /> Próxima revisão</div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] ${classeManutencao(impressora.manutencao_status)}`}>{impressora.manutencao_status}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${impressora.manutencao_status === 'Vencida' ? 'bg-red-400' : impressora.manutencao_status === 'Proxima' ? 'bg-amber-400' : 'bg-[#d8f45a]'}`} style={{ width: `${percentualBarra}%` }} /></div>
                <div className="mt-2 flex justify-between text-[10px] text-white/35">
                  <span>{horas(impressora.horas_desde_manutencao)}h desde a revisão</span>
                  <span>{impressora.manutencao_status === 'Vencida' ? `${horas(impressora.horas_desde_manutencao - impressora.intervalo_manutencao_horas)}h atrasada` : `faltam ${horas(impressora.horas_restantes_manutencao)}h`}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button onClick={() => abrirManutencao(impressora)} className="flex items-center gap-2 rounded-lg border border-[#d8f45a]/20 bg-[#d8f45a]/10 px-3 py-2 text-xs text-[#d8f45a] hover:bg-[#d8f45a]/15"><Wrench size={14} /> Registrar manutenção</button>
                <button aria-label={`Editar ${impressora.nome}`} onClick={() => abrir(impressora)} className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06] hover:text-white"><Pencil size={15} /></button>
                <button aria-label={`Arquivar ${impressora.nome}`} onClick={() => arquivar(impressora.id)} className="rounded-lg p-2 text-red-400/60 hover:bg-red-500/10"><Trash2 size={15} /></button>
              </div>
            </article>
          )
        })}
      </div>

      <section className="mt-8 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
        <div className="mb-5 flex items-center gap-3"><Activity className="text-[#d8f45a]" size={18} /><div><h2 className="font-semibold">Qualidade e custo por impressora</h2><p className="mt-1 text-xs text-white/35">Pedidos finalizados; melhora conforme você informa tempo real, falhas e custo extra.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2">
          {impressoras.map((impressora) => {
            const item = indicadoresPorImpressora.get(impressora.id)
            if (!item) return null
            return (
              <div key={impressora.id} className="rounded-xl border border-white/[0.06] bg-[#101114] p-4">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{impressora.nome}</h3><span className="text-[10px] text-white/30">{item.pedidosFinalizados} finalizados</span></div>
                <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-xs">
                  <div><p className="text-white/35">Pedidos com falha</p><p className={`mt-1 font-mono text-base ${item.taxaPedidosComFalha > 10 ? 'text-amber-300' : 'text-white/75'}`}>{item.taxaPedidosComFalha.toLocaleString('pt-BR')}%</p><p className="text-[10px] text-white/25">{item.totalFalhas} falhas registradas</p></div>
                  <div><p className="text-white/35">Tempo real × previsto</p><p className={`mt-1 font-mono text-base ${item.desvioHoras > 0 ? 'text-amber-300' : 'text-white/75'}`}>{item.desvioHoras > 0 ? '+' : ''}{horas(item.desvioHoras)}h</p><p className="text-[10px] text-white/25">{horas(item.horasReais)}h produzidas</p></div>
                  <div><p className="text-white/35">Custo extra</p><p className="mt-1 font-mono text-base text-white/75">{moeda(item.custoExtra)}</p></div>
                  <div><p className="text-white/35">Resultado estimado</p><p className={`mt-1 font-mono text-base ${item.lucroEstimado < 0 ? 'text-red-300' : 'text-[#d8f45a]'}`}>{moeda(item.lucroEstimado)}</p><p className="text-[10px] text-white/25">{moeda(item.faturamento)} faturados</p></div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
        <div className="mb-4 flex items-center gap-3"><Wrench className="text-[#d8f45a]" size={18} /><div><h2 className="font-semibold">Histórico de manutenção</h2><p className="mt-1 text-xs text-white/35">Últimos 20 registros de todas as impressoras.</p></div></div>
        {manutencoes.length === 0 ? <p className="rounded-xl bg-white/[0.03] p-4 text-sm text-white/35">Nenhuma manutenção registrada ainda.</p> : (
          <div className="divide-y divide-white/[0.06]">
            {manutencoes.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                <div><p className="font-medium text-white/75">{item.impressora_nome} · {item.tipo}</p><p className="mt-1 text-white/30">{new Date(`${item.realizada_em}T12:00:00`).toLocaleDateString('pt-BR')} · horímetro {horas(item.horas_no_momento)}h{item.descricao ? ` · ${item.descricao}` : ''}</p></div>
                <div className="text-right"><p className="font-mono text-white/65">{moeda(item.custo)}</p>{item.despesa_id && <p className="mt-1 text-[10px] text-[#d8f45a]">Lançada no financeiro</p>}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={salvar} className="my-6 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
            <div className="mb-6 flex items-center justify-between"><h2 className="font-semibold">{form.id ? 'Editar impressora' : 'Nova impressora'}</h2><button type="button" onClick={() => setModal(false)}><X size={18} /></button></div>
            <div className="space-y-4">
              <label className="block text-xs text-white/55">Nome<input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
              <label className="block text-xs text-white/55">Modelo<input value={form.modelo ?? ''} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-xs text-white/55">Potência (W)<input type="number" min="0" value={form.potencia_w} onChange={(e) => setForm({ ...form, potencia_w: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
                <label className="text-xs text-white/55">Custo/hora<input type="number" step="0.01" min="0" value={form.custo_hora} onChange={(e) => setForm({ ...form, custo_hora: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-xs text-white/55">Bico atual<input placeholder="Ex.: 0.2 mm" maxLength={40} value={form.bico_atual ?? ''} onChange={(e) => setForm({ ...form, bico_atual: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
                <label className="text-xs text-white/55">Revisão a cada (h)<input required type="number" step="1" min="1" value={form.intervalo_manutencao_horas} onChange={(e) => setForm({ ...form, intervalo_manutencao_horas: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
              </div>
              <label className="block text-xs text-white/55">Horímetro inicial (h)<input type="number" step="0.1" min="0" value={form.horas_base} onChange={(e) => setForm({ ...form, horas_base: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /><span className="mt-1 block text-[10px] text-white/25">Use para informar as horas acumuladas antes de começar a registrar pedidos no ERP.</span></label>
              <label className="block text-xs text-white/55">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Impressora['status'] })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
              {erro && <p className="text-xs text-red-400">{erro}</p>}
              <button disabled={isPending} className="w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50">{isPending ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {modalManutencao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={salvarManutencao} className="my-6 w-full max-w-lg rounded-2xl border border-white/[0.08] bg-[#15171b] p-6">
            <div className="mb-6 flex items-center justify-between"><div><h2 className="font-semibold">Registrar manutenção</h2><p className="mt-1 text-xs text-white/35">{impressoras.find((item) => item.id === manutencao.impressoraId)?.nome}</p></div><button type="button" onClick={() => setModalManutencao(false)}><X size={18} /></button></div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="text-xs text-white/55">Tipo<select value={manutencao.tipo} onChange={(e) => setManutencao({ ...manutencao, tipo: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm">{tiposManutencao.map((tipo) => <option key={tipo}>{tipo}</option>)}</select></label>
                <label className="text-xs text-white/55">Data<input required type="date" max={hojeLocal()} value={manutencao.realizadaEm} onChange={(e) => setManutencao({ ...manutencao, realizadaEm: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
              </div>
              <label className="block text-xs text-white/55">Descrição<textarea maxLength={500} rows={3} placeholder="Ex.: limpeza dos eixos e troca do bico 0.2 mm" value={manutencao.descricao} onChange={(e) => setManutencao({ ...manutencao, descricao: e.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101114] p-3 text-sm" /></label>
              <div className="grid grid-cols-2 gap-4">
                <label className="text-xs text-white/55">Custo<input type="number" step="0.01" min="0" value={manutencao.custo} onChange={(e) => setManutencao({ ...manutencao, custo: Number(e.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm" /></label>
                <label className="text-xs text-white/55">Pagamento<select disabled={!manutencao.lancarFinanceiro || manutencao.custo <= 0} value={manutencao.formaPagamento} onChange={(e) => setManutencao({ ...manutencao, formaPagamento: e.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3 text-sm disabled:opacity-40"><option>Pix</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>Dinheiro</option><option>Outro</option></select></label>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-white/55"><input type="checkbox" checked={manutencao.lancarFinanceiro} onChange={(e) => setManutencao({ ...manutencao, lancarFinanceiro: e.target.checked })} className="mt-0.5 accent-[#d8f45a]" /><span>Lançar automaticamente como despesa paga na categoria Manutenção.</span></label>
              <div className="flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] p-3 text-xs text-amber-100/70"><AlertTriangle className="mt-0.5 shrink-0" size={14} /><p>O horímetro será registrado pelas horas dos pedidos finalizados até esta data. Ajuste o horímetro inicial na impressora caso existam horas anteriores ao ERP.</p></div>
              {erro && <p className="text-xs text-red-400">{erro}</p>}
              <button disabled={isPending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50"><CircleDollarSign size={16} />{isPending ? 'Registrando...' : 'Registrar manutenção'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
