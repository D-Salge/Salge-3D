"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Box, ChevronRight } from "lucide-react";
import type { PedidoResumo } from "@/app/actions/pedidos";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const filtros = ["Todos", "Em produção", "Orçamentos", "Finalizados"] as const;
const estado = (pedido: PedidoResumo) =>
  pedido.orcamento_status === "Aprovado"
    ? pedido.status
    : pedido.orcamento_status;

export function DashboardOrders({ pedidos }: { pedidos: PedidoResumo[] }) {
  const [filtro, setFiltro] = useState<(typeof filtros)[number]>("Todos");
  const visiveis = pedidos.filter(
    (p) =>
      filtro === "Todos" ||
      (filtro === "Em produção" &&
        p.orcamento_status === "Aprovado" &&
        ["Fila", "Imprimindo", "Acabamento"].includes(p.status)) ||
      (filtro === "Orçamentos" &&
        ["Rascunho", "Enviado"].includes(p.orcamento_status)) ||
      (filtro === "Finalizados" &&
        p.orcamento_status === "Aprovado" &&
        p.status === "Finalizado"),
  );
  return (
    <section
      className="studio-card studio-orders"
      aria-labelledby="pedidos-title"
    >
      <div className="studio-card-heading">
        <div>
          <h2 id="pedidos-title">Pedidos recentes</h2>
          <p>Da primeira ideia à última camada.</p>
        </div>
        <Link className="studio-text-link" href="/produtos">
          Ver produtos e vendas <ArrowRight size={13} />
        </Link>
      </div>
      <div
        className="studio-tabs"
        role="group"
        aria-label="Filtrar pedidos recentes"
      >
        {filtros.map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={filtro === item}
            onClick={() => setFiltro(item)}
            className={filtro === item ? "active" : ""}
          >
            {item}
            {item === "Todos" && <span>{pedidos.length}</span>}
          </button>
        ))}
      </div>
      <div className="studio-orders-scroll">
        <table>
          <thead>
            <tr>
              <th>Pedido / Produto</th>
              <th>Cliente</th>
              <th>Entrega</th>
              <th>Valor</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Detalhes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((pedido) => {
              const status = estado(pedido);
              const cor = ["Finalizado", "Aprovado"].includes(status)
                ? "success"
                : ["Cancelado", "Recusado", "Expirado"].includes(status)
                  ? "danger"
                  : ["Fila", "Rascunho", "Enviado"].includes(status)
                    ? "warning"
                    : "accent";
              return (
                <tr key={pedido.id}>
                  <td>
                    <div className="studio-order-product">
                      <span className="studio-product-icon">
                        <Box size={17} strokeWidth={1.5} />
                      </span>
                      <div>
                        <Link
                          href={`/pedidos/${pedido.id}`}
                          className="studio-order-name"
                        >
                          {pedido.nome_da_peca}
                        </Link>
                        <small>
                          {pedido.numero_orcamento ?? `#${pedido.id}`} ·{" "}
                          {pedido.quantidade} un.
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {pedido.cliente_nome}
                    <small className="studio-order-material">
                      {pedido.materiais}
                    </small>
                  </td>
                  <td>
                    {pedido.data_entrega
                      ? new Date(
                          `${pedido.data_entrega.slice(0, 10)}T12:00:00Z`,
                        ).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          timeZone: "UTC",
                        })
                      : "Sem previsão"}
                  </td>
                  <td className="studio-order-value">
                    {moeda(pedido.valor_total_cobrado)}
                  </td>
                  <td>
                    <span className={`studio-pill ${cor}`}>
                      <i />
                      {status}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/pedidos/${pedido.id}`}
                      className="studio-row-link"
                      aria-label={`Abrir pedido ${pedido.numero_orcamento ?? pedido.id}`}
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visiveis.length === 0 && (
        <div className="studio-empty">
          {pedidos.length === 0
            ? "Seu próximo projeto começa em Novo orçamento."
            : "Nenhum pedido recente neste filtro."}
        </div>
      )}
      <div className="studio-orders-footer">
        <span>
          {visiveis.length} de {pedidos.length} registros recentes
        </span>
        <Link href="/orcamentos" className="studio-text-link">
          Novo orçamento <ArrowRight size={12} />
        </Link>
      </div>
    </section>
  );
}
