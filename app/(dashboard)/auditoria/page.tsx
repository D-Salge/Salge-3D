import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { getEventosAuditoria } from '@/app/actions/auditoria'
import { exigirPerfil } from '@/lib/session'

export const metadata: Metadata = { title: 'Auditoria · Salge 3D' }

export default async function AuditoriaPage() {
  await exigirPerfil(['admin'])
  const eventos = await getEventosAuditoria()
  return <div className="studio-page mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
    <div className="mb-8">
      <p className="mb-3 text-xs text-muted-foreground">Sistema / Auditoria</p>
      <h1 className="text-3xl font-semibold tracking-tight">Trilha de auditoria</h1>
      <p className="mt-2 text-sm text-muted-foreground">Alterações financeiras e operacionais críticas, sem apagar o histórico.</p>
    </div>
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-6 py-5"><ShieldCheck size={17} className="text-accent" /><div><h2 className="text-sm font-semibold">Eventos recentes</h2><p className="text-xs text-muted-foreground">Últimos 300 registros</p></div></div>
      <div className="erp-table-scroll p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-[10px] uppercase text-muted-foreground"><th className="pb-3">Data</th><th className="pb-3">Entidade</th><th className="pb-3">Ação</th><th className="pb-3">Descrição</th><th className="pb-3">Usuário</th></tr></thead>
      <tbody className="divide-y divide-border">{eventos.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">Os próximos eventos críticos aparecerão aqui.</td></tr>}{eventos.map(evento => <tr key={evento.id}><td className="py-3 text-xs text-muted-foreground">{new Date(evento.criado_em).toLocaleString('pt-BR')}</td><td className="py-3">{evento.entidade}{evento.entidade_id ? ` #${evento.entidade_id}` : ''}</td><td className="py-3"><span className="rounded bg-subtle px-2 py-1 text-[10px] text-accent">{evento.acao}</span></td><td className="py-3 text-xs text-secondary-foreground">{evento.descricao}</td><td className="py-3 text-xs text-muted-foreground">{evento.usuario_nome}</td></tr>)}</tbody></table></div>
    </div>
  </div>
}
