"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Box,
  Boxes,
  CalendarDays,
  Database,
  DollarSign,
  Factory,
  Landmark,
  Layers,
  LayoutDashboard,
  Menu,
  Package,
  PackageCheck,
  Printer,
  ReceiptText,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

interface SidebarProps {
  pedidosEmProducao?: number;
  faturamentoMes?: number;
  metaMensal?: number;
  usuario?: { nome: string; perfil: string };
  perfil?: "admin" | "operador" | "visualizador";
}

type NavItemData = {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: string;
};

function estaAtivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/financeiro")
    return pathname === href || pathname === "/financeiro/conciliacao";
  if (href === "/producao" || href === "/estoque") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItemData;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = estaAtivo(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition ${
        active
          ? "bg-accent/10 font-medium text-accent"
          : "text-muted-foreground hover:bg-subtle hover:text-secondary-foreground"
      }`}
    >
      <span className={active ? "text-accent" : "text-muted-foreground"}>
        {item.icon}
      </span>
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function Marca() {
  return (
    <Link href="/" className="studio-brand" aria-label="Salge 3D, visão geral">
      <Box size={31} strokeWidth={1.4} />
      <span>
        salge<b>3d</b>
        <sup>®</sup>
      </span>
    </Link>
  );
}

function Navegacao({
  pathname,
  perfil,
  pedidosEmProducao,
  onNavigate,
}: Pick<SidebarProps, "perfil" | "pedidosEmProducao"> & {
  pathname: string;
  onNavigate?: () => void;
}) {
  const principais: NavItemData[] = [
    { href: "/", icon: <LayoutDashboard size={16} />, label: "Visão geral" },
    {
      href: "/orcamentos",
      icon: <ReceiptText size={16} />,
      label: "Novo orçamento",
    },
    {
      href: "/produtos",
      icon: <BarChart3 size={16} />,
      label: "Produtos e vendas",
    },
    {
      href: "/producao",
      icon: <Layers size={16} />,
      label: "Produção",
      badge: pedidosEmProducao ? String(pedidosEmProducao) : undefined,
    },
    { href: "/filamentos", icon: <Database size={16}/>, label: "Estoque de materiais" },
    { href: "/clientes", icon: <Users size={16} />, label: "Clientes" },
    {
      href: "/financeiro",
      icon: <DollarSign size={16} />,
      label: "Financeiro",
    },
  ];
  const grupos: Array<{ titulo: string; itens: NavItemData[] }> = [
    {
      titulo: "Estoque e cadastros",
      itens: [
        {
          href: "/filamentos",
          icon: <Database size={15} />,
          label: "Filamentos",
        },
        { href: "/insumos", icon: <Package size={15} />, label: "Insumos" },
        { href: "/estoque", icon: <Boxes size={15} />, label: "Movimentações" },
        {
          href: "/estoque/produtos-acabados",
          icon: <PackageCheck size={15} />,
          label: "Produtos acabados",
        },
        {
          href: "/compras",
          icon: <ShoppingCart size={15} />,
          label: "Compras",
        },
      ],
    },
    {
      titulo: "Operação e relatórios",
      itens: [
        {
          href: "/producao/estoque",
          icon: <Factory size={15} />,
          label: "Produzir para estoque",
        },
        {
          href: "/impressoras",
          icon: <Printer size={15} />,
          label: "Impressoras",
        },
        { href: "/agenda", icon: <CalendarDays size={15} />, label: "Agenda" },
        {
          href: "/atendimento",
          icon: <ShieldAlert size={15} />,
          label: "Qualidade e entrega",
        },
        {
          href: "/relatorios",
          icon: <TrendingUp size={15} />,
          label: "Relatórios",
        },
        {
          href: "/financeiro/fiscal",
          icon: <Landmark size={15} />,
          label: "Fiscal e MEI",
        },
      ],
    },
  ];
  if (perfil === "admin")
    grupos.push({
      titulo: "Sistema",
      itens: [
        {
          href: "/configuracoes",
          icon: <Settings2 size={15} />,
          label: "Configurações",
        },
        {
          href: "/auditoria",
          icon: <ShieldCheck size={15} />,
          label: "Auditoria",
        },
      ],
    });
  return (
    <nav className="studio-navigation">
      <p className="studio-nav-label">Workspace</p>
      {principais.map((item) => (
        <NavItem
          key={item.href}
          item={item}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
      <p className="studio-nav-label studio-nav-management">Gestão do ateliê</p>
      {grupos.map((grupo) => (
        <details
          className="studio-nav-group"
          key={grupo.titulo}
          open={grupo.itens.some((item) => estaAtivo(pathname, item.href))}
        >
          <summary>{grupo.titulo}</summary>
          <div>
            {grupo.itens.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </details>
      ))}
    </nav>
  );
}

function Meta({
  faturamentoMes = 0,
  metaMensal = 2000,
}: Pick<SidebarProps, "faturamentoMes" | "metaMensal">) {
  const percentual =
    metaMensal > 0
      ? Math.max(0, Math.min((faturamentoMes / metaMensal) * 100, 100))
      : 0;
  const moeda = (valor: number) =>
    valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="studio-sidebar-goal">
      <div className="rounded-2xl border border-border bg-subtle p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Seu ateliê crescendo
          </span>
          <Sparkles size={15} className="text-accent" />
        </div>
        <p className="text-sm font-medium">Meta do mês</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${percentual}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {moeda(faturamentoMes)} de {moeda(metaMensal)}
        </p>
      </div>
    </div>
  );
}

export function Sidebar({
  pedidosEmProducao = 0,
  faturamentoMes = 0,
  metaMensal = 2000,
  usuario,
  perfil = "visualizador",
}: SidebarProps) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const primarios = [
    { href: "/", icon: <LayoutDashboard size={18} />, label: "Início" },
    {
      href: "/orcamentos",
      icon: <ReceiptText size={18} />,
      label: "Orçamentos",
    },
    { href: "/producao", icon: <Layers size={18} />, label: "Produção" },
    {
      href: "/financeiro",
      icon: <DollarSign size={18} />,
      label: "Financeiro",
    },
  ];
  const menuAtivo = !primarios.some((item) => estaAtivo(pathname, item.href));

  useEffect(() => {
    if (!menuAberto) return;
    const overflowAnterior = document.body.style.overflow;
    const fecharComEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuAberto(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", fecharComEsc);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEsc);
    };
  }, [menuAberto]);

  return (
    <>
      <aside className="studio-sidebar sticky top-0 hidden h-screen w-[252px] shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <Marca />
        <div className="studio-workspace-badge">
          <span>S3</span>
          <div>
            <strong>Salge 3D</strong>
            <small>Meu ateliê</small>
          </div>
        </div>
        <div className="studio-sidebar-scroll">
          <Navegacao
            pathname={pathname}
            perfil={perfil}
            pedidosEmProducao={pedidosEmProducao}
          />
        </div>
        <div className="studio-sidebar-bottom">
          <Meta faturamentoMes={faturamentoMes} metaMensal={metaMensal} />
          {usuario && (
            <div className="studio-sidebar-profile">
              <span className="studio-avatar">
                {usuario.nome
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((parte) => parte[0])
                  .join("")
                  .toUpperCase()}
              </span>
              <div>
                <strong>{usuario.nome}</strong>
                <small>
                  {perfil === "admin"
                    ? "Administrador"
                    : perfil === "operador"
                      ? "Operador"
                      : "Visualizador"}
                </small>
              </div>
            </div>
          )}
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {primarios.map((item) => {
          const active = estaAtivo(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] ${active ? "text-accent" : "text-muted-foreground"}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={menuAberto}
          aria-controls="menu-mobile"
          onClick={() => setMenuAberto(true)}
          className={`flex flex-col items-center justify-center gap-1 text-[10px] ${menuAtivo ? "text-accent" : "text-muted-foreground"}`}
        >
          <Menu size={18} />
          <span>Menu</span>
        </button>
      </nav>

      {menuAberto && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMenuAberto(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <aside
            id="menu-mobile"
            aria-label="Menu principal"
            className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col overflow-y-auto border-r border-border bg-card px-5 py-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <Marca />
              <button
                type="button"
                onClick={() => setMenuAberto(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-subtle hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            <Navegacao
              pathname={pathname}
              perfil={perfil}
              pedidosEmProducao={pedidosEmProducao}
              onNavigate={() => setMenuAberto(false)}
            />
            <Meta faturamentoMes={faturamentoMes} metaMensal={metaMensal} />
          </aside>
        </div>
      )}
    </>
  );
}
