/**
 * app/(dashboard)/layout.tsx
 *
 * Layout compartilhado entre todas as páginas do dashboard.
 * Server Component: busca os dados da sidebar (contagem de produção, total de orçamentos)
 * e passa para o Sidebar Client Component.
 *
 * Este arquivo NÃO substitui o root layout (app/layout.tsx).
 * Route group (dashboard) não afeta as URLs:
 *   app/(dashboard)/page.tsx         → /
 *   app/(dashboard)/orcamentos/...   → /orcamentos
 */

import { getDashboardStats } from '@/app/actions/pedidos'
import { getConfiguracoes } from '@/app/actions/configuracoes'
import { Sidebar } from '@/app/components/Sidebar'
import { DashboardHeader } from '@/app/components/DashboardHeader'
import { autenticacaoConfigurada, getSessaoAtual } from '@/lib/session'
import { redirect } from 'next/navigation'
import { garantirBackupDiario } from '@/lib/backup'

// O dashboard depende de dados operacionais do SQLite em cada requisição.
export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!autenticacaoConfigurada()) redirect('/setup')
  const sessao = await getSessaoAtual()
  if (!sessao) redirect('/login')
  await garantirBackupDiario(sessao).catch((error) => console.error('[backup-diario]', error))
  const stats = await getDashboardStats()
  const config = await getConfiguracoes()

  return (
    <div className="flex min-h-screen bg-[#101114] text-[#f4f4f5]">
      <Sidebar
        pedidosEmProducao={stats.pedidosEmProducao}
        faturamentoMes={stats.faturamentoBruto}
        metaMensal={config.meta_mensal}
        perfil={sessao.perfil}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <DashboardHeader usuario={sessao} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
