"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  BarChart3,
  Boxes,
  CheckSquare2,
  Clock3,
  History,
  Layers3,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
  Box,
  ArrowRight,
} from "lucide-react";
import {
  arquivarProdutoCatalogo,
  restaurarVersaoProduto,
  salvarProdutoCatalogo,
  type CatalogoDados,
  type ProdutoCatalogo,
} from "@/app/actions/catalogo";
import { salvarChecklistProduto } from "@/app/actions/arquivos-checklists";

type LinhaFicha = {
  chave: string;
  tipoItem: "Filamento" | "Insumo";
  itemId: number;
  quantidadePorUnidade: number;
};

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CatalogoTecnico({ dados }: { dados: CatalogoDados }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState("");
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const categorias = [
    ...new Set(dados.produtos.map((p) => p.categoria || "Sem categoria")),
  ].sort();
  const visiveis = dados.produtos.filter(
    (p) =>
      (categoria === "Todas" ||
        (p.categoria || "Sem categoria") === categoria) &&
      `${p.nome} ${p.codigo} ${p.categoria || ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(busca.trim().toLocaleLowerCase("pt-BR")),
  );
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState({
    nome: "",
    categoria: "",
    descricao: "",
    precoBaseUnitario: 0,
    tempoImpressaoHorasUnidade: 0,
    observacoesVersao: "",
    impressoraPreferidaId: null as number | null,
    diametroBicoMm: null as number | null,
    alturaCamadaMm: null as number | null,
    unidadesPorPlaca: null as number | null,
    perfilFatiamento: "",
    placaReferencia: "",
  });
  const [itens, setItens] = useState<LinhaFicha[]>([]);
  const [checklistProduto, setChecklistProduto] =
    useState<ProdutoCatalogo | null>(null);
  const [checklistProducao, setChecklistProducao] = useState("");
  const [checklistQualidade, setChecklistQualidade] = useState("");
  const [historicoProduto, setHistoricoProduto] =
    useState<ProdutoCatalogo | null>(null);

  const materiaisPorChave = useMemo(
    () =>
      new Map(
        dados.materiais.map((item) => [
          `${item.tipo_item}:${item.item_id}`,
          item,
        ]),
      ),
    [dados.materiais],
  );

  function abrir(produto?: ProdutoCatalogo) {
    setEditando(produto?.id ?? null);
    setForm(
      produto
        ? {
            nome: produto.nome,
            categoria: produto.categoria || "",
            descricao: produto.descricao || "",
            precoBaseUnitario: produto.preco_base_unitario,
            tempoImpressaoHorasUnidade: produto.tempo_impressao_horas_unidade,
            observacoesVersao: produto.observacoes_versao || "",
            impressoraPreferidaId: produto.impressora_preferida_id,
            diametroBicoMm: produto.diametro_bico_mm,
            alturaCamadaMm: produto.altura_camada_mm,
            unidadesPorPlaca: produto.unidades_por_placa,
            perfilFatiamento: produto.perfil_fatiamento || "",
            placaReferencia: produto.placa_referencia || "",
          }
        : {
            nome: "",
            categoria: "",
            descricao: "",
            precoBaseUnitario: 0,
            tempoImpressaoHorasUnidade: 0,
            observacoesVersao: "",
            impressoraPreferidaId: null,
            diametroBicoMm: null,
            alturaCamadaMm: null,
            unidadesPorPlaca: null,
            perfilFatiamento: "",
            placaReferencia: "",
          },
    );
    setItens(
      produto?.itens.map((item) => ({
        chave: `${item.tipo_item}-${item.item_id}-${Math.random()}`,
        tipoItem: item.tipo_item,
        itemId: item.item_id,
        quantidadePorUnidade: item.quantidade_por_unidade,
      })) ?? [],
    );
    setMensagem("");
    setAberto(true);
  }

  function adicionarItem() {
    const disponivel = dados.materiais.find(
      (material) =>
        !itens.some(
          (item) =>
            item.tipoItem === material.tipo_item &&
            item.itemId === material.item_id,
        ),
    );
    if (!disponivel) return;
    setItens((atuais) => [
      ...atuais,
      {
        chave: `${disponivel.tipo_item}-${disponivel.item_id}-${Date.now()}`,
        tipoItem: disponivel.tipo_item,
        itemId: disponivel.item_id,
        quantidadePorUnidade: 1,
      },
    ]);
  }

  function trocarItem(indice: number, valor: string) {
    const [tipo, id] = valor.split(":");
    setItens((atuais) =>
      atuais.map((item, i) =>
        i === indice
          ? {
              ...item,
              tipoItem: tipo as LinhaFicha["tipoItem"],
              itemId: Number(id),
            }
          : item,
      ),
    );
  }

  function salvar(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const resultado = await salvarProdutoCatalogo(editando, {
        ...form,
        itens: itens.map((item) => ({
          tipoItem: item.tipoItem,
          itemId: item.itemId,
          quantidadePorUnidade: item.quantidadePorUnidade,
        })),
      });
      setMensagem(resultado.message);
      if (resultado.success) {
        setAberto(false);
        router.refresh();
      }
    });
  }

  function arquivar(produto: ProdutoCatalogo) {
    if (
      !confirm(
        `Arquivar a ficha de ${produto.nome}? O histórico será preservado.`,
      )
    )
      return;
    startTransition(async () => {
      const resultado = await arquivarProdutoCatalogo(produto.id);
      setMensagem(resultado.message);
      if (resultado.success) router.refresh();
    });
  }

  function abrirChecklist(produto: ProdutoCatalogo) {
    setChecklistProduto(produto);
    setChecklistProducao(
      produto.checklist
        .filter((item) => item.etapa === "Produção")
        .map((item) => item.texto)
        .join("\n"),
    );
    setChecklistQualidade(
      produto.checklist
        .filter((item) => item.etapa === "Qualidade")
        .map((item) => item.texto)
        .join("\n"),
    );
    setMensagem("");
  }

  function salvarChecklist(event: React.FormEvent) {
    event.preventDefault();
    if (!checklistProduto) return;
    startTransition(async () => {
      const resultado = await salvarChecklistProduto({
        produtoId: checklistProduto.id,
        producao: checklistProducao.split("\n"),
        qualidade: checklistQualidade.split("\n"),
      });
      setMensagem(resultado.message);
      if (resultado.success) {
        setChecklistProduto(null);
        router.refresh();
      }
    });
  }

  function restaurar(
    produto: ProdutoCatalogo,
    versaoId: number,
    versao: number,
  ) {
    if (
      !confirm(
        `Restaurar a versão ${versao}? Ela será copiada como uma nova versão ativa.`,
      )
    )
      return;
    startTransition(async () => {
      const resultado = await restaurarVersaoProduto(produto.id, versaoId);
      setMensagem(resultado.message);
      if (resultado.success) {
        setHistoricoProduto(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      {mensagem && !aberto && (
        <p className="mb-4 rounded-xl border border-border bg-subtle px-4 py-3 text-xs text-secondary-foreground">
          {mensagem}
        </p>
      )}
      <section className="ops-catalog" aria-label="Catálogo técnico">
        <div className="ops-catalog-toolbar">
          <label className="ops-search">
            <Search size={18} />
            <input
              aria-label="Buscar no catálogo"
              placeholder="Buscar nome, código ou categoria"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </label>
          <select
            aria-label="Categoria do produto"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            <option>Todas</option>
            {categorias.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="ops-result-count">
            {visiveis.length} produto{visiveis.length === 1 ? "" : "s"}
          </span>
          <button onClick={() => abrir()} className="studio-button primary">
            <Plus size={16} /> Novo produto
          </button>
        </div>
        <div className="ops-catalog-grid">
          {visiveis.map((produto) => {
            const custoMateriais = produto.itens.reduce(
              (total, item) =>
                total + item.quantidade_por_unidade * item.custo_unitario,
              0,
            );
            return (
              <article key={produto.id} className="ops-product-card">
                <div className="ops-product-visual">
                  <Box size={58} strokeWidth={1} />
                  <span className="ops-product-category">
                    {produto.categoria || "Sem categoria"}
                  </span>
                  <span className="ops-version">v{produto.versao || 0}</span>
                </div>
                <div className="ops-product-body">
                  <p className="ops-product-code">{produto.codigo}</p>
                  <h3>{produto.nome}</h3>
                  {produto.descricao && (
                    <p className="ops-product-description">
                      {produto.descricao}
                    </p>
                  )}
                  <div className="ops-product-price">
                    <div>
                      <small>Preço base / un.</small>
                      <strong>{moeda(produto.preco_base_unitario)}</strong>
                    </div>
                    <span>
                      <Clock3 size={14} />
                      {produto.tempo_impressao_horas_unidade.toLocaleString(
                        "pt-BR",
                      )}{" "}
                      h / un.
                    </span>
                  </div>
                  <div className="ops-product-stock">
                    <Boxes size={16} />
                    <span>
                      <b>{produto.estoque_acabado_disponivel}</b> disponíveis
                      {produto.estoque_acabado_reservado > 0 &&
                        ` · ${produto.estoque_acabado_reservado} reservados`}
                    </span>
                  </div>
                  <details className="ops-product-details">
                    <summary>
                      Ficha técnica <ArrowRight size={14} />
                    </summary>
                    <div>
                      <p>
                        <Layers3 size={14} />
                        {produto.itens.length} materiais · custo{" "}
                        {moeda(custoMateriais)}
                      </p>
                      <p>
                        <Printer size={14} />
                        {produto.impressora_preferida_nome ||
                          "Impressora não definida"}
                      </p>
                      <p>
                        {[
                          produto.diametro_bico_mm
                            ? `Bico ${produto.diametro_bico_mm.toLocaleString("pt-BR")} mm`
                            : null,
                          produto.altura_camada_mm
                            ? `camada ${produto.altura_camada_mm.toLocaleString("pt-BR")} mm`
                            : null,
                          produto.unidades_por_placa
                            ? `${produto.unidades_por_placa} un./plate`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Perfil técnico não informado"}
                      </p>
                      {produto.perfil_fatiamento && (
                        <p>{produto.perfil_fatiamento}</p>
                      )}
                      <p>
                        {produto.total_versoes} versões ·{" "}
                        {produto.unidades_vendidas} un. vendidas
                      </p>
                      {produto.unidades_vendidas > 0 && (
                        <div className="ops-product-history">
                          <p>
                            <BarChart3 size={14} />
                            Preço médio: {moeda(produto.preco_medio_vendido)}
                          </p>
                          <p>
                            Tempo real/un.:{" "}
                            {produto.tempo_real_medio_unidade
                              ? `${produto.tempo_real_medio_unidade.toLocaleString("pt-BR")} h`
                              : "—"}
                          </p>
                          <p>Pedidos com falha: {produto.pedidos_com_falha}</p>
                        </div>
                      )}
                    </div>
                  </details>
                </div>
                <div className="ops-product-actions">
                  <button
                    onClick={() => abrir(produto)}
                    aria-label={`Editar ficha de ${produto.nome}`}
                  >
                    <Pencil size={16} /> Editar
                  </button>
                  <button
                    onClick={() => setHistoricoProduto(produto)}
                    aria-label={`Ver versões de ${produto.nome}`}
                    title="Versões"
                  >
                    <History size={17} />
                  </button>
                  <button
                    onClick={() => abrirChecklist(produto)}
                    aria-label={`Editar checklist de ${produto.nome}`}
                    title={`${produto.checklist.length} itens de checklist`}
                  >
                    <CheckSquare2 size={17} />
                  </button>
                  <button
                    onClick={() => arquivar(produto)}
                    aria-label={`Arquivar ficha de ${produto.nome}`}
                    title="Arquivar"
                  >
                    <Archive size={17} />
                  </button>
                </div>
              </article>
            );
          })}
          {visiveis.length === 0 && (
            <div className="ops-empty ops-catalog-empty">
              <Box size={35} />
              <h3>
                {dados.produtos.length
                  ? "Nenhum produto encontrado"
                  : "Nenhum produto cadastrado"}
              </h3>
              <p>
                {dados.produtos.length
                  ? "Altere a busca ou a categoria."
                  : "Cadastre uma ficha com os materiais e o perfil de impressão."}
              </p>
              {dados.produtos.length === 0 && (
                <button
                  type="button"
                  onClick={() => abrir()}
                  className="studio-button primary"
                >
                  <Plus size={16} /> Novo produto
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {aberto && (
        <div className="ops-modal fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-4">
          <form
            onSubmit={salvar}
            className="mx-auto my-5 w-full max-w-3xl rounded-2xl border border-border bg-card p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  {editando ? "Nova versão da ficha" : "Novo produto"}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Editar uma ficha existente cria uma nova versão e preserva a
                  anterior.
                </p>
              </div>
              <button type="button" onClick={() => setAberto(false)}>
                <X size={18} />
              </button>
            </div>
            {mensagem && (
              <p className="mb-4 rounded-lg bg-red-400/10 p-3 text-xs text-destructive">
                {mensagem}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Nome
                <input
                  required
                  maxLength={160}
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Categoria
                <input
                  maxLength={80}
                  placeholder="Ex.: Chaveiro, decoração..."
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value })
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Preço base por unidade
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precoBaseUnitario}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      precoBaseUnitario: Number(e.target.value),
                    })
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Tempo por unidade (horas)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.tempoImpressaoHorasUnidade}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tempoImpressaoHorasUnidade: Number(e.target.value),
                    })
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground sm:col-span-2">
                Descrição
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={form.descricao}
                  onChange={(e) =>
                    setForm({ ...form, descricao: e.target.value })
                  }
                  className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"
                />
              </label>
            </div>
            <div className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Printer size={14} className="text-info" /> Perfil de impressão
              </h3>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Salve o setup que deu certo e use a capacidade para criar as
                placas automaticamente.
              </p>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-muted-foreground">
                Impressora preferida
                <select
                  value={form.impressoraPreferidaId ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      impressoraPreferidaId: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">Definir no pedido</option>
                  {dados.impressoras.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                      {item.modelo ? ` · ${item.modelo}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Bico (mm)
                <input
                  type="number"
                  min="0.1"
                  max="2"
                  step="0.05"
                  value={form.diametroBicoMm ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      diametroBicoMm: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="0,2"
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Altura de camada (mm)
                <input
                  type="number"
                  min="0.01"
                  max="1"
                  step="0.01"
                  value={form.alturaCamadaMm ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      alturaCamadaMm: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="0,10"
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Unidades por placa
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  value={form.unidadesPorPlaca ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      unidadesPorPlaca: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="24"
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Perfil do Bambu Studio
                <input
                  maxLength={160}
                  value={form.perfilFatiamento}
                  onChange={(e) =>
                    setForm({ ...form, perfilFatiamento: e.target.value })
                  }
                  placeholder="Ex.: 0.10mm High Quality"
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Placa/arquivo padrão
                <input
                  maxLength={120}
                  value={form.placaReferencia}
                  onChange={(e) =>
                    setForm({ ...form, placaReferencia: e.target.value })
                  }
                  placeholder="Ex.: Plate 2"
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Materiais por unidade</h3>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  A quantidade fica salva nesta versão da ficha.
                </p>
              </div>
              <button
                type="button"
                onClick={adicionarItem}
                disabled={itens.length >= dados.materiais.length}
                className="rounded-lg bg-subtle px-3 py-2 text-xs text-secondary-foreground disabled:opacity-30"
              >
                <Plus size={12} className="mr-1 inline" /> Material
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {itens.map((item, indice) => (
                <div
                  key={item.chave}
                  className="grid grid-cols-[1fr_130px_auto] gap-2 rounded-lg bg-black/20 p-3"
                >
                  <select
                    value={`${item.tipoItem}:${item.itemId}`}
                    onChange={(e) => trocarItem(indice, e.target.value)}
                    className="h-10 rounded-lg border border-border bg-background px-2 text-xs"
                  >
                    {dados.materiais.map((material) => (
                      <option
                        key={`${material.tipo_item}:${material.item_id}`}
                        value={`${material.tipo_item}:${material.item_id}`}
                      >
                        {material.tipo_item} · {material.nome}
                      </option>
                    ))}
                  </select>
                  <label className="relative">
                    <input
                      required
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantidadePorUnidade}
                      onChange={(e) =>
                        setItens((atuais) =>
                          atuais.map((linha, i) =>
                            i === indice
                              ? {
                                  ...linha,
                                  quantidadePorUnidade: Number(e.target.value),
                                }
                              : linha,
                          ),
                        )
                      }
                      className="h-10 w-full rounded-lg border border-border bg-background px-2 pr-9 text-xs"
                    />
                    <span className="absolute right-2 top-3 text-[9px] text-muted-foreground">
                      {
                        materiaisPorChave.get(`${item.tipoItem}:${item.itemId}`)
                          ?.unidade
                      }
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setItens((atuais) =>
                        atuais.filter((_, i) => i !== indice),
                      )
                    }
                    className="p-2 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <label className="mt-5 block text-xs text-muted-foreground">
              Observações desta versão
              <textarea
                rows={3}
                maxLength={1000}
                value={form.observacoesVersao}
                onChange={(e) =>
                  setForm({ ...form, observacoesVersao: e.target.value })
                }
                className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"
              />
            </label>
            <button
              disabled={isPending}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              <Save size={14} />{" "}
              {isPending
                ? "Salvando..."
                : editando
                  ? "Salvar nova versão"
                  : "Cadastrar produto"}
            </button>
          </form>
        </div>
      )}

      {checklistProduto && (
        <div className="fixed inset-0 z-[85] overflow-y-auto bg-black/80 p-4">
          <form
            onSubmit={salvarChecklist}
            className="mx-auto my-8 w-full max-w-2xl rounded-2xl border border-border bg-card p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  Checklist · {checklistProduto.nome}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Um item por linha. Ele aparecerá em todos os pedidos deste
                  produto.
                </p>
              </div>
              <button type="button" onClick={() => setChecklistProduto(null)}>
                <X size={18} />
              </button>
            </div>
            {mensagem && (
              <p className="mb-4 rounded-lg bg-subtle p-3 text-xs text-secondary-foreground">
                {mensagem}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">
                Produção
                <textarea
                  rows={10}
                  maxLength={5000}
                  value={checklistProducao}
                  onChange={(e) => setChecklistProducao(e.target.value)}
                  placeholder={
                    "Conferir bico e placa\nValidar cores\nFatiar arquivo correto"
                  }
                  className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm leading-6"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Qualidade
                <textarea
                  rows={10}
                  maxLength={5000}
                  value={checklistQualidade}
                  onChange={(e) => setChecklistQualidade(e.target.value)}
                  placeholder={
                    "Remover rebarbas\nConferir medidas\nTestar encaixes"
                  }
                  className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm leading-6"
                />
              </label>
            </div>
            <button
              disabled={isPending}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
            >
              <Save size={14} /> Salvar checklist
            </button>
          </form>
        </div>
      )}

      {historicoProduto && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto my-8 w-full max-w-3xl rounded-2xl border border-border bg-card p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <History size={16} className="text-info" /> Versões ·{" "}
                  {historicoProduto.nome}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pedidos antigos permanecem ligados à versão usada na venda.
                  Restaurar cria uma nova versão, sem apagar o histórico.
                </p>
              </div>
              <button type="button" onClick={() => setHistoricoProduto(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {historicoProduto.versoes.map((versao) => (
                <article
                  key={versao.id}
                  className={`rounded-xl border p-4 ${versao.ativa ? "border-accent/25 bg-accent/[0.04]" : "border-border bg-black/15"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Versão {versao.versao}{" "}
                        {versao.ativa ? (
                          <span className="ml-2 rounded bg-accent/15 px-2 py-1 text-[9px] uppercase text-accent">
                            ativa
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(versao.criado_em).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    {!versao.ativa && (
                      <button
                        disabled={isPending}
                        onClick={() =>
                          restaurar(historicoProduto, versao.id, versao.versao)
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-info disabled:opacity-40"
                      >
                        <RotateCcw size={13} /> Restaurar
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <p>
                      <span className="text-muted-foreground">Preço:</span>{" "}
                      {moeda(versao.preco_base_unitario)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Tempo/un.:</span>{" "}
                      {versao.tempo_impressao_horas_unidade.toLocaleString(
                        "pt-BR",
                      )}{" "}
                      h
                    </p>
                    <p>
                      <span className="text-muted-foreground">Impressora:</span>{" "}
                      {versao.impressora_preferida_nome || "não definida"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Bico:</span>{" "}
                      {versao.diametro_bico_mm
                        ? `${versao.diametro_bico_mm.toLocaleString("pt-BR")} mm`
                        : "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Camada:</span>{" "}
                      {versao.altura_camada_mm
                        ? `${versao.altura_camada_mm.toLocaleString("pt-BR")} mm`
                        : "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Capacidade:</span>{" "}
                      {versao.unidades_por_placa
                        ? `${versao.unidades_por_placa} un./placa`
                        : "—"}
                    </p>
                  </div>
                  {(versao.perfil_fatiamento ||
                    versao.placa_referencia ||
                    versao.observacoes) && (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {[
                        versao.perfil_fatiamento,
                        versao.placa_referencia,
                        versao.observacoes,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
