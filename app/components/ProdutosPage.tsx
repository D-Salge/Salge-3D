"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Copy,
  DollarSign,
  PackageSearch,
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ResumoProduto } from "@/app/actions/produtos";
import type { CatalogoDados } from "@/app/actions/catalogo";
import { StudioPageHeading } from "@/app/components/StudioPageHeading";
import { CatalogoTecnico } from "@/app/components/CatalogoTecnico";

type Ordenacao = "faturamento" | "lucro" | "unidades" | "margem" | "recente";

function fmtBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ProdutosPage({
  produtos,
  catalogo,
}: {
  produtos: ResumoProduto[];
  catalogo: CatalogoDados;
}) {
  const [aba, setAba] = useState<"catalogo" | "vendas">("catalogo");
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("faturamento");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return produtos
      .filter(
        (produto) =>
          !termo || produto.nome.toLocaleLowerCase("pt-BR").includes(termo),
      )
      .sort((a, b) => {
        if (ordenacao === "lucro") return b.lucro - a.lucro;
        if (ordenacao === "unidades") return b.unidades - a.unidades;
        if (ordenacao === "margem")
          return b.margem_percentual - a.margem_percentual;
        if (ordenacao === "recente")
          return b.ultima_venda.localeCompare(a.ultima_venda);
        return b.faturamento - a.faturamento;
      });
  }, [busca, ordenacao, produtos]);

  const totais = useMemo(
    () =>
      produtos.reduce(
        (acc, produto) => ({
          faturamento: acc.faturamento + produto.faturamento,
          lucro: acc.lucro + produto.lucro,
          unidades: acc.unidades + produto.unidades,
        }),
        { faturamento: 0, lucro: 0, unidades: 0 },
      ),
    [produtos],
  );
  const campeao = [...produtos].sort((a, b) => b.unidades - a.unidades)[0];

  return (
    <div className="studio-page mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-9 lg:px-10">
      <StudioPageHeading
        eyebrow="Produtos"
        title={aba === "catalogo" ? "Catálogo" : "Vendas por produto"}
        description={
          aba === "catalogo"
            ? "Fichas técnicas, materiais e perfis de impressão cadastrados."
            : "Unidades vendidas, faturamento e resultado por produto."
        }
      />
      <div className="ops-tabs" role="tablist" aria-label="Produtos">
        <button
          id="catalog-tab"
          role="tab"
          aria-selected={aba === "catalogo"}
          aria-controls="catalog-panel"
          onClick={() => setAba("catalogo")}
        >
          <PackageSearch size={18} /> Catálogo{" "}
          <span>{catalogo.produtos.length}</span>
        </button>
        <button
          id="sales-tab"
          role="tab"
          aria-selected={aba === "vendas"}
          aria-controls="sales-panel"
          onClick={() => setAba("vendas")}
        >
          <TrendingUp size={18} /> Vendas por produto
        </button>
      </div>
      <div
        id="catalog-panel"
        role="tabpanel"
        aria-labelledby="catalog-tab"
        hidden={aba !== "catalogo"}
      >
        <CatalogoTecnico dados={catalogo} />
      </div>
      <div
        id="sales-panel"
        role="tabpanel"
        aria-labelledby="sales-tab"
        hidden={aba !== "vendas"}
      >
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Produtos vendidos",
              value: String(produtos.length),
              icon: <PackageSearch size={17} />,
              cor: "text-foreground",
            },
            {
              label: "Unidades vendidas",
              value: String(totais.unidades),
              icon: <ShoppingBag size={17} />,
              cor: "text-foreground",
            },
            {
              label: "Faturamento",
              value: fmtBRL(totais.faturamento),
              icon: <DollarSign size={17} />,
              cor: "text-accent",
            },
            {
              label: "Lucro estimado",
              value: fmtBRL(totais.lucro),
              icon: <TrendingUp size={17} />,
              cor: totais.lucro >= 0 ? "text-success" : "text-destructive",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <span className="text-muted-foreground">{card.icon}</span>
              </div>
              <p className={`mt-3 text-2xl font-semibold ${card.cor}`}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {campeao && (
          <div className="mb-6 rounded-xl border border-accent/15 bg-accent/[0.04] px-4 py-3 text-xs text-secondary-foreground">
            <strong className="text-accent">Mais vendido:</strong>{" "}
            {campeao.nome}, com {campeao.unidades} unidade
            {campeao.unidades === 1 ? "" : "s"} em {campeao.pedidos} pedido
            {campeao.pedidos === 1 ? "" : "s"}.
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold">Desempenho por produto</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Agrupado mesmo quando há diferenças de acento, maiúsculas ou
                espaços no nome.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-3 text-muted-foreground"
                />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar produto"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-accent/50 sm:w-56"
                />
              </label>
              <select
                value={ordenacao}
                onChange={(event) =>
                  setOrdenacao(event.target.value as Ordenacao)
                }
                className="h-10 rounded-lg border border-border bg-background px-3 text-xs text-secondary-foreground outline-none"
              >
                <option value="faturamento">Maior faturamento</option>
                <option value="lucro">Maior lucro</option>
                <option value="unidades">Mais unidades</option>
                <option value="margem">Maior margem</option>
                <option value="recente">Venda mais recente</option>
              </select>
            </div>
          </div>

          {filtrados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              {produtos.length === 0
                ? "Nenhum pedido aprovado para analisar."
                : "Nenhum produto encontrado."}
            </div>
          ) : (
            <div className="erp-table-scroll">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {[
                      "Produto",
                      "Pedidos",
                      "Unidades",
                      "Clientes",
                      "Média/un.",
                      "Faturamento",
                      "Lucro",
                      "Margem",
                      "Última venda",
                      "Ação",
                    ].map((item) => (
                      <th
                        key={item}
                        className="px-2 pb-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground first:pl-0 last:pr-0 last:text-right"
                      >
                        {item}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtrados.map((produto) => (
                    <tr key={produto.chave} className="hover:bg-subtle">
                      <td className="max-w-[220px] truncate py-4 pl-0 pr-2 font-medium text-foreground">
                        {produto.nome}
                      </td>
                      <td className="px-2 py-4 text-muted-foreground">
                        {produto.pedidos}
                      </td>
                      <td className="px-2 py-4 text-secondary-foreground">
                        {produto.unidades}
                      </td>
                      <td className="px-2 py-4">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Users size={12} />
                          {produto.clientes}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-4 font-mono text-xs text-muted-foreground">
                        {fmtBRL(produto.receita_media_unidade)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-4 font-mono text-xs font-semibold text-accent">
                        {fmtBRL(produto.faturamento)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-4 font-mono text-xs ${produto.lucro >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {fmtBRL(produto.lucro)}
                      </td>
                      <td
                        className={`px-2 py-4 text-xs ${produto.margem_percentual >= 0 ? "text-secondary-foreground" : "text-destructive"}`}
                      >
                        {produto.margem_percentual.toFixed(1)}%
                      </td>
                      <td className="whitespace-nowrap px-2 py-4 text-xs text-muted-foreground">
                        {new Date(produto.ultima_venda).toLocaleDateString(
                          "pt-BR",
                        )}
                      </td>
                      <td className="py-4 pl-2 pr-0 text-right">
                        <Link
                          href={`/orcamentos/duplicar/${produto.ultimo_pedido_id}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-subtle px-2.5 py-2 text-xs text-secondary-foreground hover:bg-subtle hover:text-foreground"
                        >
                          <Copy size={12} /> Repetir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
