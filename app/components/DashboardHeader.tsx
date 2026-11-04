"use client";

import { Box, ChevronRight, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { SessaoAtual } from "@/lib/session";
import { BuscaGlobal } from "@/app/components/BuscaGlobal";
import { ThemeToggle } from "@/app/components/ThemeToggle";

const labels: Record<string, string> = {
  orcamentos: "Orçamentos",
  produtos: "Catálogo e vendas",
  producao: "Produção",
  clientes: "Clientes",
  financeiro: "Financeiro",
  filamentos: "Filamentos",
  insumos: "Insumos",
  estoque: "Estoque",
  compras: "Compras",
  impressoras: "Impressoras",
  agenda: "Agenda",
  atendimento: "Qualidade e entrega",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  auditoria: "Auditoria",
  pedidos: "Detalhes do pedido",
};

export function DashboardHeader({ usuario }: { usuario: SessaoAtual }) {
  const pathname = usePathname();
  const label = labels[pathname.split("/")[1]] ?? "Visão geral";
  return (
    <header className="studio-header">
      <Link
        href="/"
        className="studio-mobile-brand"
        aria-label="Salge 3D, visão geral"
      >
        <Box size={25} strokeWidth={1.4} />
        <span>
          salge<b>3d</b>
        </span>
      </Link>
      <div className="studio-breadcrumb">
        <span>Salge 3D</span>
        <ChevronRight size={12} />
        <strong>{label}</strong>
      </div>
      <div className="studio-header-actions">
        <BuscaGlobal />
        <ThemeToggle />
        <span
          className="studio-avatar"
          title={usuario.nome}
          aria-label={usuario.nome}
        >
          {usuario.nome
            .split(/\s+/)
            .slice(0, 2)
            .map((parte) => parte[0])
            .join("")
            .toUpperCase()}
        </span>
        <a
          href="/logout"
          title="Sair"
          aria-label="Sair"
          className="studio-logout"
        >
          <LogOut size={14} />
        </a>
      </div>
    </header>
  );
}
