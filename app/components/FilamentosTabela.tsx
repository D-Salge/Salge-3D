"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Database,
  X,
  AlertTriangle,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { StudioPageHeading } from "@/app/components/StudioPageHeading";
import {
  salvarFilamento,
  deletarFilamento,
  type FilamentoCompleto,
} from "@/app/actions/filamentos";

export function FilamentosTabela({
  filamentos,
}: {
  filamentos: FilamentoCompleto[];
}) {
  const [isPending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [visao, setVisao] = useState<"cards" | "table">("cards");
  const visiveis = filamentos.filter((f) =>
    `${f.material} ${f.cor} ${f.marca ?? ""} ${f.fornecedor ?? ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(busca.toLocaleLowerCase("pt-BR")),
  );
  const amostra = (cor: string) => {
    const c = cor.toLocaleLowerCase("pt-BR");
    return (
      Object.entries({
        branco: "#f4f4f5",
        preto: "#24262d",
        vermelho: "#d65b61",
        rosa: "#e6a5c4",
        azul: "#759fce",
        verde: "#7aa58d",
        amarelo: "#e4c76b",
        bege: "#d1bd9b",
        marrom: "#8c715d",
        laranja: "#df9a66",
        roxo: "#a18abb",
        cinza: "#9a9da8",
      }).find(([nome]) => c.includes(nome))?.[1] ?? "var(--subtle)"
    );
  };

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FilamentoCompleto>({
    id: 0,
    material: "",
    cor: "",
    peso_rolo_gramas: 1000,
    preco_rolo: 90,
    estoque_gramas: 1000,
    estoque_minimo_gramas: 150,
    marca: null,
    fornecedor: null,
  });
  const [errorMsg, setErrorMsg] = useState("");

  function openNew() {
    setForm({
      id: 0,
      material: "PLA",
      cor: "",
      peso_rolo_gramas: 1000,
      preco_rolo: 90,
      estoque_gramas: 1000,
      estoque_minimo_gramas: 150,
      marca: null,
      fornecedor: null,
    });
    setErrorMsg("");
    setModalOpen(true);
  }

  function openEdit(f: FilamentoCompleto) {
    setForm({ ...f });
    setErrorMsg("");
    setModalOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    startTransition(async () => {
      const res = await salvarFilamento(form.id || null, {
        material: form.material,
        cor: form.cor,
        peso_rolo_gramas: Number(form.peso_rolo_gramas),
        preco_rolo: Number(form.preco_rolo),
        estoque_gramas: Number(form.estoque_gramas),
        estoque_minimo_gramas: Number(form.estoque_minimo_gramas),
        marca: form.marca,
        fornecedor: form.fornecedor,
      });
      if (res.success) {
        setModalOpen(false);
      } else {
        setErrorMsg(res.message);
      }
    });
  }

  function handleDelete(id: number) {
    if (!confirm("Deseja realmente excluir este filamento?")) return;
    startTransition(async () => {
      const res = await deletarFilamento(id);
      if (!res.success) alert(res.message);
    });
  }

  const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
  const fmtGramas = (v: number) =>
    v.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  return (
    <>
      <StudioPageHeading
        eyebrow="Materiais e organização"
        title="Cada grama conta."
        description="Seus filamentos, cores e disponibilidade em um só lugar."
        action={
          <button
            type="button"
            onClick={openNew}
            className="studio-button primary"
          >
            <Plus size={16} /> Novo filamento
          </button>
        }
      />
      <div className="studio-inventory-toolbar">
        <label className="studio-search-field">
          <Search size={17} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar material, cor ou marca"
            aria-label="Buscar filamento"
          />
        </label>
        <span>Materiais: {visiveis.length}</span>
        <div
          className="studio-view-toggle"
          role="group"
          aria-label="Visualização dos filamentos"
        >
          <button
            type="button"
            aria-label="Ver filamentos em cartões"
            aria-pressed={visao === "cards"}
            onClick={() => setVisao("cards")}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            aria-label="Ver filamentos em tabela"
            aria-pressed={visao === "table"}
            onClick={() => setVisao("table")}
          >
            <List size={16} />
          </button>
        </div>
      </div>
      {visao === "cards" && (
        <div className="studio-material-grid">
          {visiveis.map((f) => {
            const estoque = f.estoque_gramas ?? f.peso_rolo_gramas;
            const baixo = estoque <= f.estoque_minimo_gramas;
            const percentual = Math.max(
              0,
              Math.min(
                100,
                f.peso_rolo_gramas > 0
                  ? (estoque / f.peso_rolo_gramas) * 100
                  : 0,
              ),
            );
            return (
              <article className="studio-material-card" key={f.id}>
                <div className="studio-material-top">
                  <div
                    className="studio-material-swatch"
                    style={{ background: amostra(f.cor) }}
                    aria-hidden="true"
                  />
                  <span
                    className={`studio-pill ${baixo ? "warning" : "success"}`}
                  >
                    {baixo ? "Estoque baixo" : "Disponível"}
                  </span>
                </div>
                <h2>
                  {f.material} <span>{f.cor}</span>
                </h2>
                <p>
                  {f.marca ?? "Marca não informada"}
                  {f.fornecedor ? ` · ${f.fornecedor}` : ""}
                </p>
                <div className="studio-material-weight">
                  <strong>{fmtGramas(estoque)}</strong>
                  <span>g disponíveis</span>
                </div>
                <div className="studio-progress">
                  <span
                    style={{
                      width: `${percentual}%`,
                      background: baixo ? "var(--warning)" : "var(--accent)",
                    }}
                  />
                </div>
                <div className="studio-material-meta">
                  <span>Rolo de {fmtGramas(f.peso_rolo_gramas)} g</span>
                  <span>{fmtBRL(f.preco_rolo)}</span>
                </div>
                <div className="studio-material-actions">
                  <button type="button" onClick={() => openEdit(f)}>
                    <Pencil size={14} />
                    Editar material
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${f.material} ${f.cor}`}
                    onClick={() => handleDelete(f.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
          {visiveis.length === 0 && (
            <div className="studio-empty">Nenhum material encontrado.</div>
          )}
        </div>
      )}
      {visao === "table" && (
        <div className="studio-data-card rounded-2xl border border-border bg-card shadow-2xl shadow-black/10">
          <div className="flex items-center gap-3 border-b border-border px-6 py-5 sm:px-8">
            <div className="flex size-9 items-center justify-center rounded-lg bg-subtle text-accent">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Inventário de Materiais</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {filamentos.length} cadastrados
              </p>
            </div>
          </div>

          <div className="erp-table-scroll p-6 sm:p-8">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {[
                    "ID",
                    "Material e Cor",
                    "Peso do Rolo",
                    "Preço",
                    "Estoque Atual",
                    "Ações",
                  ].map((h) => (
                    <th
                      key={h}
                      className="pb-3.5 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground first:pl-0 last:pr-0 last:text-right"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visiveis.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      Nenhum filamento cadastrado.
                    </td>
                  </tr>
                )}
                {visiveis.map((f) => {
                  const estoqueAtual = f.estoque_gramas ?? f.peso_rolo_gramas;
                  const estoqueBaixo = estoqueAtual <= f.estoque_minimo_gramas;
                  const percent = Math.min(
                    (estoqueAtual / f.peso_rolo_gramas) * 100,
                    100,
                  );

                  return (
                    <tr
                      key={f.id}
                      className="group hover:bg-subtle transition-colors"
                    >
                      <td className="py-4 pl-0 pr-3 font-mono text-muted-foreground text-xs">
                        #{f.id}
                      </td>
                      <td className="py-4 px-3 font-medium text-foreground">
                        <div>
                          <span>{f.material}</span>{" "}
                          <span className="text-muted-foreground font-normal ml-1">
                            {f.cor}
                          </span>
                          {f.marca && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {f.marca}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-3 text-muted-foreground">
                        {f.peso_rolo_gramas}g
                      </td>
                      <td className="py-4 px-3 text-accent font-mono">
                        {fmtBRL(f.preco_rolo)}
                      </td>
                      <td className="py-4 px-3">
                        <div className="flex flex-col gap-1.5 w-32">
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className={
                                estoqueBaixo
                                  ? "text-destructive font-medium flex items-center gap-1"
                                  : "text-secondary-foreground"
                              }
                            >
                              {estoqueBaixo && <AlertTriangle size={12} />}
                              {fmtGramas(estoqueAtual)} g
                            </span>
                            <span className="text-muted-foreground text-[10px]">
                              {Math.round(percent)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-subtle overflow-hidden">
                            <div
                              className={`h-full rounded-full ${estoqueBaixo ? "bg-red-500" : "bg-emerald-400"}`}
                              style={{ width: `${Math.max(percent, 2)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pl-3 pr-0 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <button
                            onClick={() => openEdit(f)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-subtle hover:text-foreground transition"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(f.id)}
                            className="rounded-md p-1.5 text-destructive hover:bg-red-500/10 hover:text-destructive transition"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {form.id ? "Editar Filamento" : "Novo Filamento"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">
                    Material
                  </span>
                  <input
                    autoFocus
                    required
                    value={form.material}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        material: e.target.value.toUpperCase(),
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60 uppercase"
                    placeholder="Ex: PLA"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">
                    Cor
                  </span>
                  <input
                    required
                    value={form.cor}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cor: e.target.value }))
                    }
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                    placeholder="Ex: Preto"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">
                    Peso do Rolo (g)
                  </span>
                  <input
                    required
                    type="number"
                    min="100"
                    value={form.peso_rolo_gramas}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        peso_rolo_gramas: Number(e.target.value),
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">
                    Preço Total (R$)
                  </span>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.preco_rolo}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        preco_rolo: Number(e.target.value),
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">
                    Marca / fabricante
                  </span>
                  <input
                    value={form.marca ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, marca: e.target.value || null }))
                    }
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                    placeholder="Ex: Voolt3D"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-secondary-foreground">
                    Fornecedor
                  </span>
                  <input
                    value={form.fornecedor ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        fornecedor: e.target.value || null,
                      }))
                    }
                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/60"
                    placeholder="Ex: TikTok Shop"
                  />
                </label>
              </div>

              <div className="h-px w-full bg-subtle my-1" />

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-accent">
                  Estoque Atual (g)
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.estoque_gramas ?? 0}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      estoque_gramas: Number(e.target.value),
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-accent/30 bg-accent/[0.05] px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent"
                  placeholder="Estoque em gramas"
                />
                <span className="text-[10px] text-muted-foreground">
                  Atualize este valor ao abrir um novo rolo (ex: redefinir para
                  1000g).
                </span>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-medium text-secondary-foreground">
                  Alerta de estoque mínimo (g)
                </span>
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={form.estoque_minimo_gramas}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      estoque_minimo_gramas: Number(e.target.value),
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>

              {errorMsg && (
                <p className="text-xs text-destructive">{errorMsg}</p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                >
                  {isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
