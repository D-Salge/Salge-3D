import type { Metadata } from "next";
import { getDashboardStats, getPedidosRecentes } from "@/app/actions/pedidos";
import { getCentralPendencias } from "@/app/actions/pendencias";
import { getDespesasRecorrentes } from "@/app/actions/despesas";
import { getDashboardVisual } from "@/app/actions/dashboard";
import { DashboardOverview } from "@/app/components/DashboardOverview";
import { exigirSessao } from "@/lib/session";

export const metadata: Metadata = {
  title: "Visão Geral · Salge 3D",
  description: "Seu ateliê em um olhar: pedidos, recebimentos e produção.",
};

export default async function VisaoGeralPage() {
  const sessao = await exigirSessao();
  await getDespesasRecorrentes();
  const [stats, pedidos, pendencias, visual] = await Promise.all([
    getDashboardStats(),
    getPedidosRecentes(10),
    getCentralPendencias(),
    getDashboardVisual(),
  ]);
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <DashboardOverview
      stats={stats}
      pedidos={pedidos}
      pendencias={pendencias}
      visual={visual}
      nome={sessao.nome}
      hoje={hoje}
    />
  );
}
