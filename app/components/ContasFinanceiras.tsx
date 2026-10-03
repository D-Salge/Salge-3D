'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, Landmark, Pencil, RotateCcw, X } from 'lucide-react'
import {
  atualizarSaldoInicial,
  estornarTransferencia,
  registrarTransferencia,
  type ContaFinanceira,
  type TransferenciaFinanceira,
} from '@/app/actions/contas-financeiras'

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ContasFinanceiras({ contas, transferencias }: {
  contas: ContaFinanceira[]
  transferencias: TransferenciaFinanceira[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const [editando, setEditando] = useState<ContaFinanceira | null>(null)
  const [saldoInicial, setSaldoInicial] = useState('')
  const [transferir, setTransferir] = useState(false)
  const [form, setForm] = useState({
    contaOrigemId: contas[0]?.id ?? 0,
    contaDestinoId: contas[1]?.id ?? contas[0]?.id ?? 0,
    valor: '',
    dataTransferencia: new Date().toISOString().slice(0, 10),
    descricao: '',
  })

  function abrirSaldo(conta: ContaFinanceira) {
    setEditando(conta)
    setSaldoInicial(String(conta.saldo_inicial))
  }

  function salvarSaldo(event: React.FormEvent) {
    event.preventDefault()
    if (!editando) return
    startTransition(async () => {
      const resultado = await atualizarSaldoInicial(editando.id, Number(saldoInicial))
      setMensagem(resultado.message)
      if (resultado.success) { setEditando(null); router.refresh() }
    })
  }

  function salvarTransferencia(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const resultado = await registrarTransferencia({ ...form, valor: Number(form.valor) })
      setMensagem(resultado.message)
      if (resultado.success) {
        setTransferir(false)
        setForm((atual) => ({ ...atual, valor: '', descricao: '' }))
        router.refresh()
      }
    })
  }

  function estornar(id: number) {
    if (!confirm('Estornar esta transferência? Os saldos das duas contas serão recalculados.')) return
    startTransition(async () => {
      const resultado = await estornarTransferencia(id)
      setMensagem(resultado.message)
      if (resultado.success) router.refresh()
    })
  }

  return <section className="mb-8 rounded-2xl border border-white/[0.08] bg-[#15171b]">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Landmark size={16} className="text-[#d8f45a]" /> Contas financeiras</h2><p className="mt-1 text-xs text-white/35">Transferências entre contas não entram como receita ou despesa.</p></div>
      {contas.length > 1 && <button onClick={() => setTransferir(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d]"><ArrowRightLeft size={14} /> Transferir</button>}
    </div>
    <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      {contas.map((conta) => <div key={conta.id} className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-white/80">{conta.nome}</p><p className="mt-1 text-[10px] text-white/30">{conta.instituicao} · {conta.tipo}{conta.padrao_recebimento ? ' · recebimentos padrão' : ''}</p></div><button onClick={() => abrirSaldo(conta)} title="Ajustar saldo inicial" className="rounded-lg p-2 text-white/30 hover:bg-white/[0.05] hover:text-white/65"><Pencil size={13} /></button></div>
        <p className={`mt-4 font-mono text-2xl font-semibold ${conta.saldo_atual < 0 ? 'text-red-300' : 'text-[#d8f45a]'}`}>{moeda(conta.saldo_atual)}</p>
        <p className="mt-1 text-[10px] text-white/25">Saldo inicial: {moeda(conta.saldo_inicial)}</p>
      </div>)}
    </div>
    {mensagem && <p className="mx-5 mb-5 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-white/60 sm:mx-6">{mensagem}</p>}
    {transferencias.length > 0 && <div className="border-t border-white/[0.07] px-5 py-4 sm:px-6"><p className="mb-3 text-[10px] uppercase tracking-wider text-white/30">Transferências recentes</p><div className="space-y-2">{transferencias.slice(0, 8).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-3 py-2 text-xs"><span className="text-white/55">{item.conta_origem} → {item.conta_destino}<small className="ml-2 text-white/25">{item.data_transferencia.split('-').reverse().join('/')}</small></span><div className="flex items-center gap-2"><b className="font-mono text-white/75">{moeda(item.valor)}</b><button disabled={isPending} onClick={() => estornar(item.id)} title="Estornar transferência" className="p-1.5 text-white/25 hover:text-red-300"><RotateCcw size={12} /></button></div></div>)}</div></div>}

    {editando && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"><form onSubmit={salvarSaldo} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex justify-between"><div><h3 className="font-semibold">Saldo inicial · {editando.nome}</h3><p className="mt-1 text-xs text-white/35">Use o saldo existente antes de começar a registrar movimentos no ERP.</p></div><button type="button" onClick={() => setEditando(null)}><X size={18} /></button></div><label className="text-xs text-white/50">Valor inicial<input required autoFocus type="number" step="0.01" value={saldoInicial} onChange={(event) => setSaldoInicial(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><button disabled={isPending} className="mt-5 w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-50">Salvar saldo inicial</button></form></div>}

    {transferir && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"><form onSubmit={salvarTransferencia} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#15171b] p-6"><div className="mb-5 flex justify-between"><div><h3 className="font-semibold">Transferir entre contas</h3><p className="mt-1 text-xs text-white/35">Ex.: retirar do Mercado Pago e enviar para o Nubank PJ.</p></div><button type="button" onClick={() => setTransferir(false)}><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs text-white/50">Origem<select required value={form.contaOrigemId} onChange={(event) => setForm({ ...form, contaOrigemId: Number(event.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3">{contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome} · {moeda(conta.saldo_atual)}</option>)}</select></label><label className="text-xs text-white/50">Destino<select required value={form.contaDestinoId} onChange={(event) => setForm({ ...form, contaDestinoId: Number(event.target.value) })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3">{contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}</option>)}</select></label><label className="text-xs text-white/50">Valor<input required type="number" min="0.01" step="0.01" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label><label className="text-xs text-white/50">Data<input required type="date" value={form.dataTransferencia} onChange={(event) => setForm({ ...form, dataTransferencia: event.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" /></label></div><label className="mt-4 block text-xs text-white/50">Descrição<input maxLength={300} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-[#101114] px-3" placeholder="Opcional" /></label><button disabled={isPending || form.contaOrigemId === form.contaDestinoId} className="mt-5 w-full rounded-lg bg-[#d8f45a] py-3 text-sm font-semibold text-[#15180d] disabled:opacity-40">Confirmar transferência</button></form></div>}
  </section>
}
