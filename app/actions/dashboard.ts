"use server";

import db from "@/lib/db";
import { exigirSessao } from "@/lib/session";
import { obterResumoVisualDashboard } from "@/lib/dashboard-resumo.mjs";

export interface DashboardVisual {
  dias: Array<{ dia: string; valor: number }>;
  filamentoGramas: number;
  impressoras: Array<{
    id: number;
    nome: string;
    modelo: string | null;
    status: string;
    trabalho: null | {
      pedidoId: number;
      projeto: string;
      referencia: string | null;
      status: string;
      planejado: number;
      produzido: number;
    };
  }>;
}

export async function getDashboardVisual(): Promise<DashboardVisual> {
  const sessao = await exigirSessao();
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return obterResumoVisualDashboard(db, sessao.tenantId, hoje);
}
