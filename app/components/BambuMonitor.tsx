"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Link2,
  Loader2,
  Plus,
  Settings2,
  Thermometer,
  Unplug,
  X,
} from "lucide-react";
import type { ResumoBambu } from "@/lib/bambu-monitor";
import {
  desativarConexaoBambu,
  getLotesParaMonitorBambu,
  salvarConexaoBambu,
  vincularImpressaoBambu,
} from "@/app/actions/bambu";
import { PrinterGlyph } from "@/app/components/PrinterGlyph";

type Setup = {
  podeConfigurar: boolean;
  podeVincular: boolean;
  impressoras: Array<{ id: number; nome: string }>;
  configuracoes: Array<{ impressoraId: number; host: string; serial: string }>;
};
type Lote = {
  id: number;
  codigo: string;
  nome: string;
  pedido: string | null;
  referencia: string | null;
};
const graus = (n: number | undefined) =>
  n === undefined
    ? "—"
    : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} °C`;
const tempo = (n: number | undefined) =>
  n === undefined
    ? "—"
    : n >= 60
      ? `${Math.floor(n / 60)}h ${Math.round(n % 60)}min`
      : `${Math.round(n)} min`;

export function BambuMonitor({ setup }: { setup?: Setup }) {
  const router = useRouter();
  const [monitors, setMonitors] = useState<ResumoBambu[]>([]);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [configurando, setConfigurando] = useState(false);
  const [form, setForm] = useState({
    impressoraId: setup?.impressoras[0]?.id ?? 0,
    host: "",
    serial: "",
    accessCode: "",
  });
  const [vinculando, setVinculando] = useState<ResumoBambu | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [loteId, setLoteId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [pending, startTransition] = useTransition();
  const atualizar = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/impressoras/monitoramento", {
        cache: "no-store",
        signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Sessão expirada. Entre novamente no ERP."
            : "Não foi possível atualizar o monitoramento.",
        );
      const data = await response.json();
      setMonitors(data.impressoras);
      setErro("");
      setCarregando(false);
    } catch (e) {
      if (signal?.aborted) return;
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível atualizar o monitoramento.",
      );
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let cancelado = false;
    async function poll() {
      if (!document.hidden) await atualizar(controller.signal);
      if (!cancelado) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      cancelado = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [atualizar]);

  function configurar(id?: number) {
    const config = setup?.configuracoes.find((c) => c.impressoraId === id);
    setForm({
      impressoraId: id ?? setup?.impressoras[0]?.id ?? 0,
      host: config?.host ?? "",
      serial: config?.serial ?? "",
      accessCode: "",
    });
    setMensagem("");
    setConfigurando(true);
  }
  function salvar(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await salvarConexaoBambu(form);
      setMensagem(result.message);
      if (result.success) {
        setForm((f) => ({ ...f, accessCode: "" }));
        setConfigurando(false);
        router.refresh();
        await atualizar();
      }
    });
  }
  function desativar(id: number) {
    startTransition(async () => {
      const r = await desativarConexaoBambu(id);
      setMensagem(r.message);
      if (r.success) {
        router.refresh();
        await atualizar();
      }
    });
  }
  function abrirVinculo(monitor: ResumoBambu) {
    setMensagem("");
    setLoteId("");
    setReferencia("");
    setLotes([]);
    startTransition(async () => {
      try {
        setLotes(await getLotesParaMonitorBambu(monitor.impressoraId));
        setVinculando(monitor);
      } catch {
        setMensagem(
          "Seu perfil não permite vincular a impressão ou sua sessão expirou.",
        );
      }
    });
  }
  function salvarVinculo(event: React.FormEvent) {
    event.preventDefault();
    if (!vinculando?.jobKey) return;
    startTransition(async () => {
      const r = await vincularImpressaoBambu({
        impressoraId: vinculando.impressoraId,
        loteId: Number(loteId),
        referencia,
        jobKey: vinculando.jobKey!,
      });
      setMensagem(r.message);
      if (r.success) {
        setVinculando(null);
        await atualizar();
      }
    });
  }
  if (!setup && !monitors.length && !erro) return null;
  return (
    <section className="bambu-panel" aria-label="Monitoramento Bambu Lab">
      <header className="bambu-heading">
        <div>
          <h2>
            <Activity size={18} /> Monitoramento Bambu Lab
          </h2>
          <p>Dados recebidos da impressora pela rede local.</p>
        </div>
        {setup?.podeConfigurar && (
          <button
            type="button"
            className="studio-button"
            onClick={() => configurar()}
          >
            <Plus size={15} /> Conectar impressora
          </button>
        )}
        {!setup && (
          <Link href="/impressoras" className="ops-text-link">
            Configurar <Settings2 size={15} />
          </Link>
        )}
      </header>
      {erro && (
        <p role="alert" className="bambu-notice">
          {erro} Os valores anteriores podem estar desatualizados.
        </p>
      )}
      {mensagem && (
        <p role="status" className="bambu-notice">
          {mensagem}
        </p>
      )}
      {carregando && (
        <p className="bambu-empty">
          <Loader2 size={16} className="animate-spin" /> Verificando conexão…
        </p>
      )}
      {!carregando && !monitors.length && !erro && (
        <div className="bambu-empty">
          <Unplug size={26} />
          <div>
            <h3>Nenhuma impressora conectada</h3>
            <p>
              Cadastre o IP, o número de série e o código de acesso local da
              P2S. O PC do ERP precisa alcançar a impressora na mesma rede.
            </p>
            <p>
              Continue usando o Bambu Handy e o Studio normalmente. Não é
              necessário trocar para LAN Only para tentar a leitura dos dados.
            </p>
          </div>
        </div>
      )}
      <div className="bambu-grid">
        {monitors.map((m) => (
          <article
            key={m.impressoraId}
            className={`bambu-machine ${!m.dadosAtuais || erro ? "bambu-stale" : ""}`}
          >
            <div className="bambu-machine-header">
              <PrinterGlyph name={m.nome} />
              <div>
                <h3>{m.nome}</h3>
                <p>{m.dadosAtuais && !erro ? m.estadoTexto : m.conexao}</p>
              </div>
              <span
                className={`ops-status ${m.dadosAtuais && !erro ? "success" : "accent"}`}
              >
                {m.dadosAtuais && !erro ? "Ao vivo" : "Sem leitura atual"}
              </span>
            </div>
            {m.mensagem && <p className="bambu-notice">{m.mensagem}</p>}
            <p className="bambu-file">
              {m.dados.arquivo ||
                m.dados.caminhoArquivo?.split(/[\\/]/).pop() ||
                "Arquivo não informado pela impressora"}
            </p>
            <div className="bambu-progress-label">
              <span>Progresso da impressão</span>
              <strong>
                {m.dados.progresso === undefined
                  ? "—"
                  : `${m.dados.progresso}%`}
              </strong>
            </div>
            <div className="ops-progress">
              <span style={{ width: `${m.dados.progresso ?? 0}%` }} />
            </div>
            <div className="bambu-data">
              <div>
                <span>Tempo restante</span>
                <strong>{tempo(m.dados.minutosRestantes)}</strong>
              </div>
              <div>
                <span>Camada</span>
                <strong>
                  {m.dados.camada === undefined
                    ? "—"
                    : `${m.dados.camada} / ${m.dados.camadasTotal ?? "—"}`}
                </strong>
              </div>
            </div>
            <div className="bambu-temps">
              <div>
                <Thermometer size={15} />
                <span>Bico</span>
                <strong>
                  {graus(m.dados.bicoAtual)}
                  <small> / {graus(m.dados.bicoAlvo)}</small>
                </strong>
              </div>
              <div>
                <Thermometer size={15} />
                <span>Mesa</span>
                <strong>
                  {graus(m.dados.mesaAtual)}
                  <small> / {graus(m.dados.mesaAlvo)}</small>
                </strong>
              </div>
              <div>
                <Thermometer size={15} />
                <span>Câmara</span>
                <strong>{graus(m.dados.camaraAtual)}</strong>
              </div>
            </div>
            {Boolean(m.dados.erroImpressao) && (
              <p className="bambu-notice">
                A impressora reportou o erro 0x
                {m.dados.erroImpressao!.toString(16).toUpperCase()}. Confira a
                tela da P2S.
              </p>
            )}
            {m.vinculo && (
              <div className="bambu-link">
                <Link2 size={16} />
                <div>
                  <Link href={`/pedidos/${m.vinculo.pedidoId}`}>
                    {m.vinculo.pedido || m.vinculo.codigo} · {m.vinculo.nome}
                  </Link>
                  <p>{m.vinculo.referencia}</p>
                  {!m.vinculo.ativo && (
                    <small>
                      Vínculo anterior. Confirme a plate da impressão atual.
                    </small>
                  )}
                </div>
              </div>
            )}
            <footer>
              <span>
                {m.atualizadoEm
                  ? `Última leitura: ${new Date(m.atualizadoEm).toLocaleTimeString("pt-BR")}`
                  : "Aguardando o primeiro relatório"}
              </span>
              <div>
                {setup?.podeVincular && (
                  <button
                    type="button"
                    disabled={
                      pending ||
                      !m.dadosAtuais ||
                      Boolean(erro) ||
                      !["RUNNING", "PREPARE", "SLICING", "PAUSE"].includes(
                        m.estado ?? "",
                      )
                    }
                    onClick={() => abrirVinculo(m)}
                  >
                    <Link2 size={15} /> Vincular plate
                  </button>
                )}
                {setup?.podeConfigurar && (
                  <>
                    <button
                      type="button"
                      aria-label={`Configurar conexão de ${m.nome}`}
                      onClick={() => configurar(m.impressoraId)}
                    >
                      <Settings2 size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`Desativar monitoramento de ${m.nome}`}
                      onClick={() => desativar(m.impressoraId)}
                    >
                      <Unplug size={16} />
                    </button>
                  </>
                )}
              </div>
            </footer>
          </article>
        ))}
      </div>
      {monitors.length > 0 && (
        <p className="bambu-hint">
          O fim da impressão não conclui o pedido nem movimenta estoque. Confira
          as peças e registre a produção no ERP.
        </p>
      )}
      {configurando && (
        <div
          className="bambu-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bambu-config-title"
        >
          <form onSubmit={salvar}>
            <header>
              <div>
                <h2 id="bambu-config-title">Conectar impressora Bambu</h2>
                <p>Apenas acompanhamento da impressão.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar configuração"
                onClick={() => {
                  setConfigurando(false);
                  setForm((f) => ({ ...f, accessCode: "" }));
                }}
              >
                <X size={20} />
              </button>
            </header>
            <label>
              Impressora no ERP
              <select
                required
                value={form.impressoraId}
                onChange={(e) => {
                  const id = Number(e.target.value),
                    c = setup?.configuracoes.find((x) => x.impressoraId === id);
                  setForm({
                    impressoraId: id,
                    host: c?.host ?? "",
                    serial: c?.serial ?? "",
                    accessCode: "",
                  });
                }}
              >
                <option value={0}>Selecione</option>
                {setup?.impressoras.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              IP local da impressora
              <input
                required
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="192.168.1.100"
                inputMode="decimal"
                autoComplete="off"
              />
            </label>
            <label>
              Número de série
              <input
                required
                minLength={10}
                maxLength={32}
                value={form.serial}
                onChange={(e) => setForm({ ...form, serial: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label>
              Código de acesso local
              <input
                type="password"
                minLength={8}
                maxLength={8}
                value={form.accessCode}
                onChange={(e) =>
                  setForm({ ...form, accessCode: e.target.value })
                }
                autoComplete="new-password"
              />
              <small>
                8 caracteres. Ao editar, deixe vazio para manter o código salvo.
                Não é a senha da conta Bambu.
              </small>
            </label>
            <p className="bambu-hint">
              Consulte esses dados nas configurações de rede da P2S ou no Bambu
              Studio. Mantenha o modo de conexão atual.
            </p>
            {mensagem && (
              <p role="status" className="bambu-notice">
                {mensagem}
              </p>
            )}
            <button
              disabled={pending || !form.impressoraId}
              className="studio-button primary"
            >
              {pending ? "Salvando…" : "Salvar conexão"}
            </button>
          </form>
        </div>
      )}
      {vinculando && (
        <div
          className="bambu-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bambu-link-title"
        >
          <form onSubmit={salvarVinculo}>
            <header>
              <div>
                <h2 id="bambu-link-title">Vincular impressão à plate</h2>
                <p>
                  {vinculando.nome} ·{" "}
                  {vinculando.dados.arquivo || "impressão atual"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar vínculo"
                onClick={() => setVinculando(null)}
              >
                <X size={20} />
              </button>
            </header>
            <label>
              Lote / plate do pedido
              <select
                required
                value={loteId}
                onChange={(e) => {
                  setLoteId(e.target.value);
                  const l = lotes.find((l) => l.id === Number(e.target.value));
                  setReferencia(l?.referencia ?? "");
                }}
              >
                <option value="">Selecione</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.pedido || l.codigo} · {l.nome} ·{" "}
                    {l.referencia || l.codigo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plate e execução
              <input
                required
                maxLength={120}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Plate 2 · Tampas · Execução 1"
              />
            </label>
            {!lotes.length && (
              <p className="bambu-hint">
                Nenhum lote ativo disponível para esta máquina. Crie o lote em{" "}
                <Link href="/producao">Produção → Lotes e plates</Link>.
              </p>
            )}
            <p className="bambu-hint">
              Esse vínculo identifica somente esta impressão. Outras plates do
              mesmo pedido podem usar outra máquina.
            </p>
            {mensagem && (
              <p role="status" className="bambu-notice">
                {mensagem}
              </p>
            )}
            <button
              disabled={pending || !loteId}
              className="studio-button primary"
            >
              {pending ? "Salvando…" : "Vincular impressão"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
