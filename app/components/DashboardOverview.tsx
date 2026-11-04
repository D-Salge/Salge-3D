import Link from "next/link";
import { PrinterGlyph } from "@/app/components/PrinterGlyph";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Layers,
  Package,
  Plus,
  ReceiptText,
  Printer,
} from "lucide-react";
import type { DashboardStats, PedidoResumo } from "@/app/actions/pedidos";
import type { DashboardVisual } from "@/app/actions/dashboard";
import type { PendenciaCentral } from "@/app/actions/pendencias";
import { DashboardChart } from "@/app/components/DashboardChart";
import { DashboardOrders } from "@/app/components/DashboardOrders";
import { CentralPendencias } from "@/app/components/CentralPendencias";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nomesStatus: Record<string, string> = {
  Disponivel: "Disponível",
  Manutencao: "Manutenção",
  Inativa: "Inativa",
  "Em uso": "Em uso",
};

export interface DashboardOverviewProps {
  stats: DashboardStats;
  visual: DashboardVisual;
  pedidos: PedidoResumo[];
  pendencias: PendenciaCentral[];
  nome: string;
  hoje: string;
}

export function DashboardOverview({
  stats,
  visual,
  pedidos,
  pendencias,
  nome,
  hoje,
}: DashboardOverviewProps) {
  return (
    <div className="studio-overview">
      <section className="studio-welcome">
        <div>
          <p className="studio-eyebrow">Salge 3D</p>
          <h1>
            Visão geral
          </h1>
          <p>
            Olá, {nome.split(/\s+/)[0]}. Resumo dos pedidos, recebimentos e produção.
          </p>
        </div>
        <div className="studio-welcome-actions">
          <Link href="/agenda" className="studio-button">
            <CalendarDays size={14} />
            {new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}
          </Link>
          <Link href="/orcamentos" className="studio-button primary">
            <Plus size={14} />
            Novo orçamento
          </Link>
        </div>
      </section>
      <div className="studio-metrics">
        {[
          {
            label: "Recebido no mês",
            value: moeda(stats.totalRecebidoMes),
            sub: "Pagamentos registrados neste mês",
            icon: <CircleDollarSign size={16} />,
          },
          {
            label: "Pedidos em produção",
            value: String(stats.pedidosEmProducao).padStart(2, "0"),
            sub: `${stats.pedidosMes} pedidos aprovados no mês`,
            icon: <Package size={16} />,
          },
          {
            label: "A receber",
            value: moeda(stats.inadimplenciaTotal),
            sub: "Saldo dos pedidos aprovados",
            icon: <ReceiptText size={16} />,
          },
          {
            label: "Filamento disponível",
            value: `${(visual.filamentoGramas / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`,
            sub: stats.estoqueBaixo
              ? `${stats.estoqueBaixo} ${stats.estoqueBaixo === 1 ? "item precisa" : "itens precisam"} de reposição`
              : "Estoque sem alertas de reposição",
            icon: <Layers size={16} />,
          },
        ].map((item) => (
          <div className="studio-card studio-metric" key={item.label}>
            <div>
              <span>{item.label}</span>
              {item.icon}
            </div>
            <strong>{item.value}</strong>
            <p>{item.sub}</p>
          </div>
        ))}
      </div>
      <div className="studio-main-grid">
        <DashboardChart dias={visual.dias} />
        <section
          className="studio-card studio-printers"
          aria-labelledby="bancada-title"
        >
          <div className="studio-card-heading">
            <div>
              <h2 id="bancada-title">Impressoras</h2>
              <p>Registros de produção do ERP</p>
            </div>
            <Link href="/producao" className="studio-text-link">
              Ver produção <ArrowRight size={13} />
            </Link>
          </div>
          <div className="studio-printer-list">
            {visual.impressoras.length === 0 && (
              <div className="studio-empty">
                <Printer size={25} />
                <p>Sua bancada está pronta para começar.</p>
                <Link href="/impressoras" className="studio-text-link">
                  Cadastrar impressora <ArrowRight size={12} />
                </Link>
              </div>
            )}
            {visual.impressoras.slice(0, 2).map((impressora) => {
              const trabalho = impressora.trabalho;
              const imprimindo = trabalho?.status === "Imprimindo";
              const progresso = trabalho
                ? Math.max(
                    0,
                    Math.min(
                      100,
                      (trabalho.produzido / Math.max(1, trabalho.planejado)) *
                        100,
                    ),
                  )
                : 0;
              return (
                <article className="studio-printer" key={impressora.id}>
                  <div className="studio-printer-icon">
                    <PrinterGlyph name={`${impressora.nome} ${impressora.modelo ?? ""}`} />
                  </div>
                  <div className="studio-printer-info">
                    <div className="studio-printer-title">
                      <h3>{impressora.nome}</h3>
                      <span
                        className={`studio-pill ${imprimindo ? "accent" : impressora.status === "Disponivel" ? "success" : "neutral"}`}
                      >
                        <i />
                        {imprimindo
                          ? "Imprimindo"
                          : (nomesStatus[impressora.status] ??
                            impressora.status)}
                      </span>
                    </div>
                    {trabalho ? (
                      <>
                        <Link
                          href={`/pedidos/${trabalho.pedidoId}`}
                          className="studio-printer-project"
                        >
                          {trabalho.projeto}
                        </Link>
                        <div className="studio-progress">
                          <span style={{ width: `${progresso}%` }} />
                        </div>
                        <div className="studio-printer-meta">
                          <span>
                            {trabalho.referencia ?? "Pedido atribuído"}
                          </span>
                          <span>
                            {trabalho.produzido}/{trabalho.planejado} peças
                            registradas
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="studio-printer-project">
                          {impressora.status === "Disponivel"
                            ? "Sem impressão em andamento."
                            : "Nenhum trabalho em andamento registrado."}
                        </p>
                        <Link href="/producao" className="studio-text-link">
                          Ver fila de produção <ArrowRight size={12} />
                        </Link>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {visual.impressoras.length > 2 && (
            <>
              <Link
                className="studio-printers-footer studio-text-link"
                href="/impressoras"
              >
                Gerenciar {visual.impressoras.length} impressora
                {visual.impressoras.length === 1 ? "" : "s"}{" "}
                <ArrowRight size={12} />
              </Link>
            </>
          )}
        </section>
      </div>
      <DashboardOrders pedidos={pedidos} />
      <div className="studio-quick-grid">
        <Link href="/compras" className="studio-card studio-quick">
          <span className="studio-quick-icon">
            <Layers size={18} />
          </span>
          <div>
            <h3>Reposição de materiais</h3>
            <p>
              {stats.estoqueBaixo
                ? `${stats.estoqueBaixo} ${stats.estoqueBaixo === 1 ? "item precisa" : "itens precisam"} de reposição.`
                : "Consultar o estoque e as sugestões de compra."}
            </p>
          </div>
          <ArrowRight size={15} />
        </Link>
        <Link href="/orcamentos" className="studio-card studio-quick">
          <span className="studio-quick-icon">
            <ReceiptText size={18} />
          </span>
          <div>
            <h3>Novo orçamento</h3>
            <p>Cálculo tradicional ou por plates.</p>
          </div>
          <Plus size={15} />
        </Link>
      </div>
      <section
        className="studio-card studio-financial-summary"
        aria-label="Resultados do mês"
      >
        {[
          ["Faturamento bruto", moeda(stats.faturamentoBruto)],
          ["Custos totais", moeda(stats.custosTotais)],
          ["Lucro líquido", moeda(stats.lucroLiquido)],
          [
            "Margem média",
            `${stats.margemMedia.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
          ],
          ["Ticket médio", moeda(stats.ticketMedio)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <div className="studio-pending">
        <CentralPendencias pendencias={pendencias} />
      </div>
      <footer className="studio-footer">
        <span>Salge 3D</span>
        <span>ERP pessoal</span>
      </footer>
    </div>
  );
}
