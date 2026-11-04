"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Layers3,
  LayoutGrid,
  Printer,
} from "lucide-react";
import type { PlanejamentoProducao } from "@/app/actions/planejamento";
import type { LoteProducao } from "@/app/actions/lotes-producao";
import type { PedidoResumo } from "@/app/actions/pedidos";
import { PrinterGlyph } from "@/app/components/PrinterGlyph";

const views = [
  { id: "pedidos", label: "Pedidos", icon: LayoutGrid },
  { id: "lotes", label: "Lotes e plates", icon: Layers3 },
  { id: "planejamento", label: "Planejamento", icon: CalendarClock },
] as const;

export function ProducaoWorkspace({
  plano,
  pedidos,
  lotes,
  board,
  batches,
  planning,
}: {
  plano: PlanejamentoProducao;
  pedidos: PedidoResumo[];
  lotes: LoteProducao[];
  board: ReactNode;
  batches: ReactNode;
  planning: ReactNode;
}) {
  const [view, setView] = useState<(typeof views)[number]["id"]>("pedidos");
  const fila = lotes.filter((lote) => lote.status === "Planejado");
  const filaPedidos = pedidos.filter((pedido) => pedido.status === "Fila");
  const metrics = [
    ["Na fila", filaPedidos.length],
    ["Imprimindo", pedidos.filter((p) => p.status === "Imprimindo").length],
    ["Em acabamento", pedidos.filter((p) => p.status === "Acabamento").length],
    ["Lotes planejados", fila.length],
  ];
  return (
    <div className="ops-workspace">
      <div className="ops-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{String(value).padStart(2, "0")}</strong>
          </div>
        ))}
      </div>
      <div className="ops-production-overview">
        <section
          className="ops-panel ops-machines"
          aria-labelledby="ops-machines-title"
        >
          <div className="ops-panel-heading">
            <div>
              <h2 id="ops-machines-title">Impressoras</h2>
              <p>Pedidos e lotes atribuídos no ERP.</p>
            </div>
            <Link href="/impressoras" className="ops-text-link">
              Gerenciar <ArrowRight size={14} />
            </Link>
          </div>
          <div className="ops-machine-grid">
            {plano.impressoras.map((machine) => {
              const currentBatch = lotes.find(
                (l) =>
                  l.impressora_id === machine.id && l.status === "Imprimindo",
              );
              const currentOrder = pedidos.find(
                (p) =>
                  p.impressora_nome === machine.nome &&
                  p.status === "Imprimindo",
              );
              const busy = Boolean(currentBatch || currentOrder);
              const planned =
                currentBatch?.quantidade_planejada ??
                currentOrder?.quantidade ??
                0;
              const produced =
                currentBatch?.quantidade_produzida ??
                currentOrder?.quantidade_produzida ??
                0;
              return (
                <article className="ops-machine" key={machine.id}>
                  <div className="ops-machine-visual">
                    <PrinterGlyph
                      name={`${machine.nome} ${machine.modelo ?? ""}`}
                    />
                    <span
                      className={`ops-status ${busy ? "accent" : "success"}`}
                    >
                      {busy ? "Imprimindo" : "Sem impressão registrada"}
                    </span>
                  </div>
                  <h3>{machine.nome}</h3>
                  <p className="ops-machine-project">
                    {currentBatch?.nome_da_peca ??
                      currentOrder?.nome_da_peca ??
                      "Nenhum trabalho em andamento"}
                  </p>
                  {busy && (
                    <>
                      <div className="ops-progress">
                        <span
                          style={{
                            width: `${planned > 0 ? Math.max(0, Math.min(100, (produced / planned) * 100)) : 0}%`,
                          }}
                        />
                      </div>
                      <div className="ops-machine-meta">
                        <span>
                          {currentBatch?.placa_referencia ?? "Pedido atribuído"}
                        </span>
                        <span>
                          {produced}/{planned} peças
                        </span>
                      </div>
                    </>
                  )}
                  <div className="ops-machine-bottom">
                    <span>{machine.pedidos.length} na fila</span>
                    <span>
                      {machine.horas_planejadas.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      h previstas
                    </span>
                  </div>
                </article>
              );
            })}
            {plano.impressoras.length === 0 && (
              <div className="ops-empty">
                <Printer size={26} />
                <p>Nenhuma impressora disponível para planejamento.</p>
                <Link href="/impressoras">Gerenciar impressoras</Link>
              </div>
            )}
          </div>
        </section>
        <section
          className="ops-panel ops-upcoming"
          aria-labelledby="ops-upcoming-title"
        >
          <div className="ops-panel-heading">
            <div>
              <h2 id="ops-upcoming-title">Próximas plates</h2>
              <p>Lotes planejados para impressão.</p>
            </div>
            <Layers3 size={19} />
          </div>
          {fila.slice(0, 4).map((lote) => (
            <Link
              href={`/pedidos/${lote.pedido_id}`}
              key={lote.id}
              className="ops-queue-item"
            >
              <span className="ops-icon-tile">
                <Layers3 size={20} />
              </span>
              <div>
                <strong>{lote.nome_da_peca}</strong>
                <p>
                  {lote.placa_referencia || lote.codigo} ·{" "}
                  {lote.quantidade_planejada} peças
                </p>
                <small>
                  {lote.impressora_nome ?? "Impressora não definida"}
                </small>
              </div>
              <ArrowRight size={14} />
            </Link>
          ))}
          {fila.length === 0 && (
            <div className="ops-empty">
              <Layers3 size={25} />
              <p>Nenhuma plate planejada.</p>
              <button
                type="button"
                className="ops-text-link"
                onClick={() => setView("lotes")}
              >
                Organizar lotes e plates <ArrowRight size={14} />
              </button>
            </div>
          )}
          {fila.length > 4 && (
            <button
              type="button"
              className="ops-text-link ops-more"
              onClick={() => setView("lotes")}
            >
              Ver todos os {fila.length} lotes <ArrowRight size={14} />
            </button>
          )}
        </section>
      </div>
      <div
        className="ops-tabs"
        role="tablist"
        aria-label="Controle de produção"
      >
        {views.map(({ id, label, icon: Icon }) => (
          <button
            id={`production-tab-${id}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            aria-controls={`production-panel-${id}`}
            onClick={() => setView(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id="production-panel-pedidos"
        aria-labelledby="production-tab-pedidos"
        hidden={view !== "pedidos"}
      >
        {board}
      </section>
      <section
        role="tabpanel"
        id="production-panel-lotes"
        aria-labelledby="production-tab-lotes"
        hidden={view !== "lotes"}
      >
        {batches}
      </section>
      <section
        role="tabpanel"
        id="production-panel-planejamento"
        aria-labelledby="production-tab-planejamento"
        hidden={view !== "planejamento"}
      >
        {planning}
      </section>
    </div>
  );
}
