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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const stats = await getDashboardStats()
  const config = await getConfiguracoes()

  return (
    <div className="flex min-h-screen bg-[#101114] text-[#f4f4f5]">
      <Sidebar
        pedidosEmProducao={stats.pedidosEmProducao}
        faturamentoMes={stats.faturamentoBruto}
        metaMensal={config.meta_mensal}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <DashboardHeader />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
