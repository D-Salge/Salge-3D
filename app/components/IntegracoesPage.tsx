'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudCog, RefreshCw, Server, XCircle } from 'lucide-react'
import { reenviarWhatsAppOficial, type EnvioWhatsAppOficial } from '@/app/actions/whatsapp'
import type { DiagnosticoSistema } from '@/lib/readiness'

const cores = {
  Pronto: 'bg-emerald-500/10 text-success',
  Atenção: 'bg-amber-500/10 text-warning',
  Bloqueio: 'bg-red-500/10 text-destructive',
}

export function IntegracoesPage({ diagnostico, envios }: { diagnostico: DiagnosticoSistema; envios: EnvioWhatsAppOficial[] }) {
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  const router = useRouter()
  function reenviar(id: number) { startTransition(async () => { const resultado = await reenviarWhatsAppOficial(id); setMensagem(resultado.message); router.refresh() }) }
  return <div>
    <Link href="/configuracoes" className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft size={13} /> Configurações</Link>
    <div className="mb-7"><h1 className="flex items-center gap-2 text-xl font-semibold"><CloudCog className="text-accent" size={22} /> Integrações e hospedagem</h1><p className="mt-1 text-xs text-muted-foreground">Diagnóstico sem expor tokens e histórico da API oficial.</p></div>
    {mensagem && <p className="mb-5 rounded-lg bg-subtle p-3 text-xs text-secondary-foreground">{mensagem}</p>}

    <div className={`mb-6 rounded-2xl border p-5 ${diagnostico.prontoParaRede ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-red-500/20 bg-red-500/[0.04]'}`}><div className="flex items-center gap-3">{diagnostico.prontoParaRede ? <CheckCircle2 className="text-success" /> : <XCircle className="text-destructive" />}<div><p className="text-sm font-semibold">{diagnostico.prontoParaRede ? 'Sem bloqueios críticos para uma instância' : 'Há bloqueios antes de publicar'}</p><p className="mt-1 text-xs text-muted-foreground">SQLite continua limitado a uma única instância com disco persistente.</p></div></div></div>

    <div className="grid gap-3 md:grid-cols-2">{diagnostico.itens.map((item) => <div key={item.id} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{item.titulo}</p><span className={`rounded px-2 py-1 text-[10px] ${cores[item.status]}`}>{item.status}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detalhe}</p></div>)}</div>

    <div className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="flex items-center gap-2 text-sm font-semibold"><Server size={15} /> Variáveis de ambiente</h2><p className="mt-1 text-xs text-muted-foreground">Coloque no `.env.local` no PC ou no painel secreto da hospedagem. Nunca envie tokens ao GitHub.</p><pre className="mt-4 overflow-x-auto rounded-xl bg-black/30 p-4 text-[11px] leading-6 text-accent">{`APP_URL=https://seu-dominio.com
AUTH_COOKIE_SECURE=true
BACKUP_EXTERNAL_DIR=D:\\OneDrive\\Salge3D\\Backups

MERCADO_PAGO_TEST_MODE=true
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=

WHATSAPP_GRAPH_VERSION=vXX.X
WHATSAPP_TEST_MODE=true
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
META_APP_SECRET=
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
WHATSAPP_TEMPLATE_ORCAMENTO=salge_orcamento
WHATSAPP_TEMPLATE_FOLLOWUP=salge_followup
WHATSAPP_TEMPLATE_COBRANCA=salge_cobranca
WHATSAPP_TEMPLATE_PRODUCAO=salge_producao
WHATSAPP_TEMPLATE_PRONTO=salge_pronto
WHATSAPP_TEMPLATE_POS_VENDA=salge_pos_venda`}</pre><p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-warning"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> Nunca envie tokens ao GitHub. Webhooks públicos: <code>/api/webhooks/mercado-pago</code> e <code>/api/webhooks/whatsapp</code>.</p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">No modo de teste, pagamentos do sandbox devem ser confirmados pelo botão “Sincronizar” no pedido. Em produção, o webhook faz a baixa automaticamente.</p></div>

    <div className="mt-6 rounded-2xl border border-border bg-card"><div className="p-5 sm:p-6"><h2 className="text-sm font-semibold">Envios oficiais recentes</h2><p className="mt-1 text-xs text-muted-foreground">Estados “Entregue” e “Lido” chegam automaticamente pelo webhook assinado.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-y border-border text-muted-foreground"><tr><th className="px-5 py-3">Pedido</th><th>Cliente</th><th>Template</th><th>Status</th><th>Tentativas</th><th className="pr-5 text-right">Ação</th></tr></thead><tbody className="divide-y divide-border">{envios.map((envio) => <tr key={envio.id}><td className="px-5 py-3"><Link className="text-accent" href={`/pedidos/${envio.pedido_id}`}>{envio.numero_orcamento || `#${envio.pedido_id}`}</Link></td><td>{envio.cliente_nome}</td><td className="text-muted-foreground">{envio.template_nome}</td><td><span className={`rounded px-2 py-1 text-[10px] ${envio.status === 'Falhou' ? 'bg-red-500/10 text-destructive' : envio.status === 'Lido' || envio.status === 'Entregue' ? 'bg-emerald-500/10 text-success' : 'bg-blue-500/10 text-info'}`}>{envio.status}</span>{envio.erro && <p className="mt-1 max-w-[260px] truncate text-[10px] text-destructive" title={envio.erro}>{envio.erro}</p>}</td><td>{envio.tentativas}</td><td className="pr-5 text-right">{envio.status === 'Falhou' && <button disabled={isPending} onClick={() => reenviar(envio.id)} className="rounded p-2 text-muted-foreground hover:bg-subtle" title="Tentar novamente"><RefreshCw size={14} /></button>}</td></tr>)}{envios.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum envio pela API oficial.</td></tr>}</tbody></table></div></div>
  </div>
}
