'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Box,
  CircleHelp,
  LayoutDashboard,
  ReceiptText,
  Settings2,
  Sparkles,
  Users,
  Database,
  Package,
  Layers,
  Settings,
  DollarSign
} from 'lucide-react'

interface SidebarProps {
  pedidosEmProducao?: number
  faturamentoMes?: number
  metaMensal?: number
}

function NavItem({
  href,
  icon,
  label,
  active,
  badge,
}: {
  href: string
  icon: React.ReactNode
  label: string
  active?: boolean
  badge?: string
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition ${
        active
          ? 'bg-white/[0.07] font-medium text-white'
          : 'text-white/40 hover:bg-white/[0.04] hover:text-white/75'
      }`}
    >
      <span className={active ? 'text-[#d8f45a]' : 'text-white/35'}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="rounded bg-[#d8f45a]/10 px-1.5 py-0.5 text-[10px] text-[#d8f45a]">
          {badge}
        </span>
      )}
    </Link>
  )
}

export function Sidebar({ pedidosEmProducao = 0, faturamentoMes = 0, metaMensal = 2000 }: SidebarProps) {
  const pathname = usePathname()
  
  const percentual = Math.min((faturamentoMes / metaMensal) * 100, 100)
  
  const fmtBRL = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')

  return (
    <aside className="hidden w-[248px] shrink-0 border-r border-white/[0.07] bg-[#0d0e10] px-5 py-6 lg:flex lg:flex-col overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#d8f45a] text-[#16180f] shadow-[0_0_24px_rgba(216,244,90,0.18)]">
          <Box size={19} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[15px] font-semibold tracking-tight">
            Salge<span className="text-[#d8f45a]">3D</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Print studio</p>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-1">
        <p className="px-3 pb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">Visão Geral</p>
        <NavItem href="/" icon={<LayoutDashboard size={15} />} label="Dashboard" active={pathname === '/'} />
        <NavItem href="/orcamentos" icon={<ReceiptText size={15} />} label="Novo Orçamento" active={pathname === '/orcamentos'} />
        <NavItem href="/producao" icon={<Layers size={15} />} label="Produção" active={pathname === '/producao'} badge={pedidosEmProducao > 0 ? String(pedidosEmProducao) : undefined} />
      </div>

      <div className="mt-9 flex flex-col gap-1">
        <p className="px-3 pb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">Cadastros</p>
        <NavItem href="/clientes" icon={<Users size={15} />} label="Clientes" active={pathname === '/clientes'} />
        <NavItem href="/filamentos" icon={<Database size={15} />} label="Filamentos" active={pathname === '/filamentos'} />
        <NavItem href="/insumos" icon={<Package size={15} />} label="Insumos" active={pathname === '/insumos'} />
      </div>

      <div className="mt-9 flex flex-col gap-1">
        <p className="px-3 pb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">Financeiro</p>
        <NavItem href="/financeiro" icon={<DollarSign size={15} />} label="Painel Financeiro" active={pathname === '/financeiro'} />
      </div>

      <div className="mt-9 flex flex-col gap-1">
        <p className="px-3 pb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">Sistema</p>
        <NavItem href="/configuracoes" icon={<Settings2 size={15} />} label="Configurações" active={pathname === '/configuracoes'} />
      </div>

      {/* Meta de Faturamento */}
      <div className="mt-auto pt-8">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-white/50">Progresso mensal</span>
            <Sparkles size={15} className="text-[#d8f45a]" />
          </div>
          <p className="text-sm font-medium">Meta de Faturamento</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#d8f45a] transition-all duration-500"
              style={{ width: `${Math.max(percentual, 2)}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-white/35">
            {fmtBRL(faturamentoMes)} de {fmtBRL(metaMensal)}
          </p>
        </div>
      </div>
    </aside>
  )
}
