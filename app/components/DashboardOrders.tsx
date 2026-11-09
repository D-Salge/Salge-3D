"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  CalendarDays,
  Layers,
  Search,
  UserRound,
} from "lucide-react";
import type { PedidoResumo } from "@/app/actions/pedidos";

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const filtros = ["Todos", "Em produção", "Orçamentos", "Finalizados"] as const;
type Filtro = (typeof filtros)[number];
const estado = (pedido: PedidoResumo) =>
  pedido.orcamento_status === "Aprovado"
    ? pedido.status
    : pedido.orcamento_status;
const corresponde = (p: PedidoResumo, filtro: Filtro) =>
  filtro === "Todos" ||
  (filtro === "Em produção" &&
    p.orcamento_status === "Aprovado" &&
    ["Fila", "Imprimindo", "Acabamento"].includes(p.status)) ||
  (filtro === "Orçamentos" &&
    ["Rascunho", "Enviado"].includes(p.orcamento_status)) ||
  (filtro === "Finalizados" &&
    p.orcamento_status === "Aprovado" &&
    p.status === "Finalizado");
const data = (valor: string | null) =>
  valor
    ? new Date(`${valor.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      })
    : "Sem previsão";
const normalizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
function corStatus(pedido: PedidoResumo) {
  const status = estado(pedido);
  return ["Finalizado", "Aprovado"].includes(status)
    ? "success"
    : ["Cancelado", "Recusado", "Expirado"].includes(status)
      ? "danger"
      : ["Fila", "Rascunho", "Enviado"].includes(status)
        ? "warning"
        : "accent";
}

export function DashboardOrders({ pedidos }: { pedidos: PedidoResumo[] }) {
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [busca, setBusca] = useState("");
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const termo = normalizar(busca.trim());
  const visiveis = pedidos.filter(
    (p) =>
      corresponde(p, filtro) &&
      normalizar(
        `${p.nome_da_peca} ${p.cliente_nome} ${p.numero_orcamento ?? p.id}`,
      ).includes(termo),
  );
  // A selection must always belong to the current filter, including after a refresh.
  const selecionado =
    visiveis.find((p) => p.id === selecionadoId) ?? visiveis[0];

  return (
    <section className="reference-orders" aria-labelledby="pedidos-title">
      <div className="reference-orders-toolbar">
        <div>
          <p className="studio-eyebrow">Seus pedidos</p>
          <h2 id="pedidos-title">Pedidos recentes</h2>
        </div>
        <label className="reference-order-search">
          <Search size={16} />
          <span className="sr-only">Buscar nos pedidos recentes</span>
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Pedido ou cliente..."
          />
        </label>
      </div>
      <div className="reference-orders-surface">
        <div className="reference-orders-topline">
          <span>Acompanhamento</span>
          <div
            className="reference-order-filters"
            role="group"
            aria-label="Filtrar pedidos recentes"
          >
            {filtros.map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={filtro === item}
                onClick={() => setFiltro(item)}
              >
                {item}
                <span>
                  {pedidos.filter((p) => corresponde(p, item)).length}
                </span>
              </button>
            ))}
          </div>
          <Link href="/produtos" className="reference-orders-all">
            Ver vendas <ArrowRight size={15} />
          </Link>
        </div>
        {selecionado ? (
          <div className="reference-orders-grid">
            <div
              className="reference-order-list"
              role="group"
              aria-label="Selecionar pedido"
            >
              {visiveis.map((pedido) => (
                <button
                  type="button"
                  key={pedido.id}
                  aria-pressed={selecionado.id === pedido.id}
                  aria-controls="pedido-preview"
                  onClick={() => setSelecionadoId(pedido.id)}
                >
                  <span className="reference-client-avatar" aria-hidden="true">
                    {pedido.cliente_nome.trim().slice(0, 1).toUpperCase() ||
                      "C"}
                  </span>
                  <span className="reference-order-list-name">
                    <strong>
                      {pedido.numero_orcamento ?? `#${pedido.id}`}
                    </strong>
                    <small>{pedido.nome_da_peca}</small>
                  </span>
                  <span className="reference-order-list-meta">
                    <strong>{moeda(pedido.valor_total_cobrado)}</strong>
                    <small>{estado(pedido)}</small>
                  </span>
                </button>
              ))}
            </div>
            <article
              className="reference-order-preview"
              id="pedido-preview"
              aria-label={`Prévia do pedido ${selecionado.numero_orcamento ?? selecionado.id}`}
            >
              <div className="reference-order-preview-heading">
                <div>
                  <p>Detalhes do pedido</p>
                  <h3>
                    {selecionado.numero_orcamento ?? `#${selecionado.id}`}
                  </h3>
                </div>
                <span className={`studio-pill ${corStatus(selecionado)}`}>
                  <i />
                  {estado(selecionado)}
                </span>
              </div>
              <div className="reference-order-customer">
                <UserRound size={18} />
                <div>
                  <span>Cliente</span>
                  <strong>{selecionado.cliente_nome}</strong>
                </div>
              </div>
              <div className="reference-order-items">
                <div>
                  <Box size={19} />
                  <span>Peça / produto</span>
                  <strong>{selecionado.nome_da_peca}</strong>
                  <small>{selecionado.quantidade} unidade(s)</small>
                </div>
                <div>
                  <Layers size={19} />
                  <span>Material</span>
                  <strong>{selecionado.materiais || "Não informado"}</strong>
                  <small>
                    {selecionado.impressora_nome || "Impressora não atribuída"}
                  </small>
                </div>
                <div>
                  <CalendarDays size={19} />
                  <span>Entrega prevista</span>
                  <strong>{data(selecionado.data_entrega)}</strong>
                  <small>
                    {selecionado.quantidade_entregue} unidade(s) entregue(s)
                  </small>
                </div>
              </div>
              <div className="reference-order-bottom">
                <dl>
                  <div>
                    <dt>Valor total</dt>
                    <dd>{moeda(selecionado.valor_total_cobrado)}</dd>
                  </div>
                  <div>
                    <dt>Recebido</dt>
                    <dd>{moeda(selecionado.total_recebido)}</dd>
                  </div>
                  <div>
                    <dt>
                      {selecionado.orcamento_status === "Aprovado" &&
                      selecionado.status !== "Cancelado"
                        ? "A receber"
                        : "Saldo estimado"}
                    </dt>
                    <dd>
                      {moeda(
                        Math.max(
                          0,
                          selecionado.valor_total_cobrado -
                            selecionado.total_recebido,
                        ),
                      )}
                    </dd>
                  </div>
                </dl>
                <Link
                  href={`/pedidos/${selecionado.id}`}
                  className="reference-order-open"
                >
                  Abrir pedido <ArrowRight size={15} />
                </Link>
              </div>
            </article>
          </div>
        ) : (
          <div className="reference-orders-empty">
            <Box size={30} />
            <p>
              {pedidos.length === 0
                ? "Cadastre seu primeiro pedido para acompanhar os detalhes por aqui."
                : "Nenhum pedido recente corresponde a esta busca ou filtro."}
            </p>
            <Link href="/orcamentos">
              Novo orçamento <ArrowRight size={14} />
            </Link>
          </div>
        )}
        <div className="reference-orders-footer">
          <span>
            {visiveis.length} de {pedidos.length} registros recentes
          </span>
          <Link href="/orcamentos">
            Novo orçamento <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
