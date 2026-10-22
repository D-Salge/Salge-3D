'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  BarChart3, Box, Boxes, CalendarDays, Database, DollarSign, Factory, Landmark,
  Layers, LayoutDashboard, Menu, Package, PackageCheck, Printer, ReceiptText, Settings2,
  ShieldAlert, ShieldCheck, ShoppingCart, Sparkles, TrendingUp, Users, X,
} from 'lucide-react'

interface SidebarProps {
  pedidosEmProducao?: number
  faturamentoMes?: number
  metaMensal?: number
  perfil?: 'admin' | 'operador' | 'visualizador'
}

type NavItemData = { href: string; icon: ReactNode; label: string; badge?: string }

function estaAtivo(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  if (href === '/financeiro') return pathname === href || pathname === '/financeiro/conciliacao'
  if (href === '/producao' || href === '/estoque') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavItem({ item, pathname, onNavigate }: {
  item: NavItemData
  pathname: string
  onNavigate?: () => void
}) {
  const active = estaAtivo(pathname, item.href)
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition ${
        active
          ? 'bg-white/[0.07] font-medium text-white'
          : 'text-white/45 hover:bg-white/[0.04] hover:text-white/80'
      }`}
    >
      <span className={active ? 'text-[#d8f45a]' : 'text-white/35'}>{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {item.badge && <span className="rounded bg-[#d8f45a]/10 px-1.5 py-0.5 text-[10px] text-[#d8f45a]">{item.badge}</span>}
    </Link>
  )
}

function Marca() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="flex size-9 items-center justify-center rounded-xl bg-[#d8f45a] text-[#16180f] shadow-[0_0_24px_rgba(216,244,90,0.18)]">
        <Box size={19} strokeWidth={2.5} />
      </div>
      <div>
        <p className="text-[15px] font-semibold tracking-tight">Salge<span className="text-[#d8f45a]">3D</span></p>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Print studio</p>
      </div>
    </div>
  )
}

function Navegacao({ pathname, perfil, pedidosEmProducao, onNavigate }: Pick<SidebarProps, 'perfil' | 'pedidosEmProducao'> & {
  pathname: string
  onNavigate?: () => void
}) {
  const grupos: Array<{ titulo: string; itens: NavItemData[] }> = [
    { titulo: 'Visão geral', itens: [
      { href: '/', icon: <LayoutDashboard size={15} />, label: 'Dashboard' },
      { href: '/orcamentos', icon: <ReceiptText size={15} />, label: 'Novo orçamento' },
      { href: '/producao', icon: <Layers size={15} />, label: 'Produção', badge: pedidosEmProducao ? String(pedidosEmProducao) : undefined },
      { href: '/producao/estoque', icon: <Factory size={15} />, label: 'Produzir para estoque' },
      { href: '/produtos', icon: <BarChart3 size={15} />, label: 'Produtos e vendas' },
      { href: '/relatorios', icon: <TrendingUp size={15} />, label: 'Relatórios' },
      { href: '/agenda', icon: <CalendarDays size={15} />, label: 'Agenda' },
      { href: '/atendimento', icon: <ShieldAlert size={15} />, label: 'Qualidade e entrega' },
    ] },
    { titulo: 'Cadastros', itens: [
      { href: '/clientes', icon: <Users size={15} />, label: 'Clientes' },
      { href: '/filamentos', icon: <Database size={15} />, label: 'Filamentos' },
      { href: '/insumos', icon: <Package size={15} />, label: 'Insumos' },
      { href: '/estoque', icon: <Boxes size={15} />, label: 'Movimentações' },
      { href: '/estoque/produtos-acabados', icon: <PackageCheck size={15} />, label: 'Produtos acabados' },
      { href: '/compras', icon: <ShoppingCart size={15} />, label: 'Compras' },
      { href: '/impressoras', icon: <Printer size={15} />, label: 'Impressoras' },
    ] },
    { titulo: 'Financeiro', itens: [
      { href: '/financeiro', icon: <DollarSign size={15} />, label: 'Painel financeiro' },
      { href: '/financeiro/fiscal', icon: <Landmark size={15} />, label: 'Fiscal e MEI' },
    ] },
  ]
  if (perfil === 'admin') {
    grupos.push({ titulo: 'Sistema', itens: [
      { href: '/configuracoes', icon: <Settings2 size={15} />, label: 'Configurações' },
      { href: '/auditoria', icon: <ShieldCheck size={15} />, label: 'Auditoria' },
    ] })
  }
  return (
    <nav className="mt-9 space-y-8">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="space-y-1">
          <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">{grupo.titulo}</p>
          {grupo.itens.map((item) => <NavItem key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
        </div>
      ))}
    </nav>
  )
}

function Meta({ faturamentoMes = 0, metaMensal = 2000 }: Pick<SidebarProps, 'faturamentoMes' | 'metaMensal'>) {
  const percentual = Math.min((faturamentoMes / metaMensal) * 100, 100)
  const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return (
    <div className="mt-auto pt-8">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-white/50">Progresso mensal</span>
          <Sparkles size={15} className="text-[#d8f45a]" />
        </div>
        <p className="text-sm font-medium">Meta de faturamento</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#d8f45a] transition-all duration-500" style={{ width: `${Math.max(percentual, 2)}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-white/35">{moeda(faturamentoMes)} de {moeda(metaMensal)}</p>
      </div>
    </div>
  )
}

export function Sidebar({
  pedidosEmProducao = 0,
  faturamentoMes = 0,
  metaMensal = 2000,
  perfil = 'visualizador',
}: SidebarProps) {
  const pathname = usePathname()
  const [menuAberto, setMenuAberto] = useState(false)
  const primarios = [
    { href: '/', icon: <LayoutDashboard size={18} />, label: 'Início' },
    { href: '/orcamentos', icon: <ReceiptText size={18} />, label: 'Orçamentos' },
    { href: '/producao', icon: <Layers size={18} />, label: 'Produção' },
    { href: '/financeiro', icon: <DollarSign size={18} />, label: 'Financeiro' },
  ]
  const menuAtivo = !primarios.some((item) => estaAtivo(pathname, item.href))

  useEffect(() => {
    if (!menuAberto) return
    const overflowAnterior = document.body.style.overflow
    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuAberto(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', fecharComEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', fecharComEsc)
    }
  }, [menuAberto])

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 overflow-y-auto border-r border-white/[0.07] bg-[#0d0e10] px-5 py-6 lg:flex lg:flex-col">
        <Marca />
        <Navegacao pathname={pathname} perfil={perfil} pedidosEmProducao={pedidosEmProducao} />
        <Meta faturamentoMes={faturamentoMes} metaMensal={metaMensal} />
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t border-white/[0.08] bg-[#0d0e10]/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {primarios.map((item) => {
          const active = estaAtivo(pathname, item.href)
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-1 text-[10px] ${active ? 'text-[#d8f45a]' : 'text-white/40'}`}>
              {item.icon}<span>{item.label}</span>
            </Link>
          )
        })}
        <button type="button" aria-expanded={menuAberto} aria-controls="menu-mobile" onClick={() => setMenuAberto(true)} className={`flex flex-col items-center justify-center gap-1 text-[10px] ${menuAtivo ? 'text-[#d8f45a]' : 'text-white/40'}`}>
          <Menu size={18} /><span>Menu</span>
        </button>
      </nav>

      {menuAberto && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button type="button" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <aside id="menu-mobile" aria-label="Menu principal" className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col overflow-y-auto border-r border-white/10 bg-[#0d0e10] px-5 py-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <Marca />
              <button type="button" onClick={() => setMenuAberto(false)} className="rounded-lg p-2 text-white/50 hover:bg-white/[0.06] hover:text-white"><X size={18} /></button>
            </div>
            <Navegacao pathname={pathname} perfil={perfil} pedidosEmProducao={pedidosEmProducao} onNavigate={() => setMenuAberto(false)} />
            <Meta faturamentoMes={faturamentoMes} metaMensal={metaMensal} />
          </aside>
        </div>
      )}
    </>
  )
}
