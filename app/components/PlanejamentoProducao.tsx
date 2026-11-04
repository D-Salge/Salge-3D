"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CalendarOff,
  Check,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  aplicarAtribuicoesSugeridas,
  aplicarPlanejamentoProducao,
  removerBloqueioImpressora,
  salvarBloqueioImpressora,
  type PlanejamentoProducao as Plano,
} from "@/app/actions/planejamento";

function fmtData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataHoraLocal(horasAdiante = 0) {
  const data = new Date(Date.now() + horasAdiante * 60 * 60 * 1000);
  const deslocamento = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 16);
}

export function PlanejamentoProducao({ plano }: { plano: Plano }) {
  const [isPending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState("");
  const [modalBloqueio, setModalBloqueio] = useState(false);
  const [bloqueio, setBloqueio] = useState({
    impressoraId: plano.impressoras[0]?.id ?? 0,
    inicioEm: dataHoraLocal(),
    fimEm: dataHoraLocal(2),
    motivo: "",
  });
  const router = useRouter();
  const totalPedidos = plano.impressoras.reduce(
    (total, impressora) => total + impressora.pedidos.length,
    0,
  );
  const bloqueios = plano.impressoras.flatMap(
    (impressora) => impressora.bloqueios,
  );

  function aplicar() {
    if (!confirm("Aplicar estes horários previstos aos pedidos atribuídos?"))
      return;
    startTransition(async () => {
      setMensagem((await aplicarPlanejamentoProducao()).message);
      router.refresh();
    });
  }

  function distribuir() {
    if (
      !confirm(
        "Atribuir os pedidos sem impressora à máquina que consegue terminá-los primeiro?",
      )
    )
      return;
    startTransition(async () => {
      setMensagem((await aplicarAtribuicoesSugeridas()).message);
      router.refresh();
    });
  }

  function salvarBloqueio(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const resultado = await salvarBloqueioImpressora({
        impressoraId: bloqueio.impressoraId,
        inicioEm: new Date(bloqueio.inicioEm).toISOString(),
        fimEm: new Date(bloqueio.fimEm).toISOString(),
        motivo: bloqueio.motivo,
      });
      setMensagem(resultado.message);
      if (resultado.success) {
        setModalBloqueio(false);
        router.refresh();
      }
    });
  }

  function removerBloqueio(id: number) {
    if (!confirm("Remover este bloqueio do planejamento?")) return;
    startTransition(async () => {
      setMensagem((await removerBloqueioImpressora(id)).message);
      router.refresh();
    });
  }

  return (
    <section className="ops-planning mb-7 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock size={17} className="text-accent" /> Previsão da
            produção
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Fila por prioridade e ordem manual, respeitando perfil técnico,
            bloqueios e preparação entre impressões.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModalBloqueio(true)}
            disabled={plano.impressoras.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-subtle px-4 text-xs text-secondary-foreground disabled:opacity-40"
          >
            <CalendarOff size={14} /> Bloquear horário
          </button>
          <button
            type="button"
            onClick={aplicar}
            disabled={isPending || totalPedidos === 0}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-accent-foreground disabled:opacity-40"
          >
            {isPending ? (
              <WandSparkles size={14} className="animate-pulse" />
            ) : (
              <Check size={14} />
            )}
            {isPending ? "Aplicando..." : "Aplicar horários"}
          </button>
        </div>
      </div>
      {mensagem && (
        <p className="mb-4 rounded-lg bg-subtle p-3 text-xs text-secondary-foreground">
          {mensagem}
        </p>
      )}

      {plano.semImpressora.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-xs text-warning">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={15}
                className="mt-0.5 shrink-0 text-warning"
              />
              <div>
                <p>
                  {plano.semImpressora.length} pedido
                  {plano.semImpressora.length === 1 ? "" : "s"} sem impressora.
                </p>
                <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                  {plano.semImpressora.map((pedido) => (
                    <p key={pedido.id}>
                      {pedido.numero_orcamento ?? `#${pedido.id}`} ·{" "}
                      {pedido.impressora_sugerida_nome
                        ? `sugestão ${pedido.impressora_sugerida_nome}, termina ${fmtData(pedido.fim_previsto_sugerido!)}`
                        : "sem máquina disponível"}
                      {pedido.atrasado_sugerido
                        ? " · ainda com risco de atraso"
                        : ""}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={distribuir}
              disabled={
                isPending ||
                plano.semImpressora.every(
                  (pedido) => !pedido.impressora_sugerida_id,
                )
              }
              className="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-[10px] font-semibold text-[#211b07] disabled:opacity-40"
            >
              <Sparkles size={13} /> Distribuir automaticamente
            </button>
          </div>
        </div>
      )}

      {bloqueios.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-400/15 bg-blue-500/[0.04] p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-info">
            <CalendarOff size={14} /> Indisponibilidades programadas
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {bloqueios.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-black/15 p-3 text-[10px]"
              >
                <div>
                  <p className="font-medium text-secondary-foreground">
                    {item.impressora_nome} · {item.motivo}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {fmtData(item.inicio_em)} → {fmtData(item.fim_em)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => removerBloqueio(item.id)}
                  className="p-2 text-destructive hover:text-destructive"
                  aria-label="Remover bloqueio"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {plano.impressoras.map((impressora) => (
          <div
            key={impressora.id}
            className="ops-planning-machine rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{impressora.nome}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {impressora.status} · {impressora.horas_planejadas.toFixed(1)}
                  h na fila · intervalo{" "}
                  {impressora.intervalo_entre_trabalhos_minutos}min
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Livre em</p>
                <p className="mt-1 font-mono text-xs text-accent">
                  {fmtData(impressora.livre_em)}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {impressora.pedidos.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  Sem pedidos atribuídos.
                </p>
              )}
              {impressora.pedidos.map((pedido, index) => (
                <Link
                  key={pedido.id}
                  href={`/pedidos/${pedido.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-subtle p-3 hover:bg-subtle"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-secondary-foreground">
                      {index + 1}. {pedido.nome_da_peca}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {pedido.cliente_nome} · {pedido.tempo_impressao_horas}h ·{" "}
                      <span
                        className={
                          pedido.prioridade_producao === "Urgente"
                            ? "text-destructive"
                            : pedido.prioridade_producao === "Alta"
                              ? "text-warning"
                              : ""
                        }
                      >
                        {pedido.prioridade_producao}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-mono text-[10px] ${pedido.atrasado ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {fmtData(pedido.fim_previsto_calculado)}
                    </p>
                    {pedido.atrasado && (
                      <p className="mt-1 text-[9px] uppercase text-destructive">
                        risco de atraso
                      </p>
                    )}
                    {pedido.incompatibilidade_tecnica && (
                      <p className="mt-1 text-[9px] uppercase text-warning">
                        perfil incompatível
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modalBloqueio && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-4">
          <form
            onSubmit={salvarBloqueio}
            className="my-6 w-full max-w-lg rounded-2xl border border-border bg-card p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <CalendarOff size={16} className="text-info" /> Bloquear
                  impressora
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  O período será desconsiderado ao calcular a fila.
                </p>
              </div>
              <button type="button" onClick={() => setModalBloqueio(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-xs text-muted-foreground">
                Impressora
                <select
                  required
                  value={bloqueio.impressoraId}
                  onChange={(event) =>
                    setBloqueio({
                      ...bloqueio,
                      impressoraId: Number(event.target.value),
                    })
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3"
                >
                  {plano.impressoras.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Início
                  <input
                    required
                    type="datetime-local"
                    value={bloqueio.inicioEm}
                    onChange={(event) =>
                      setBloqueio({ ...bloqueio, inicioEm: event.target.value })
                    }
                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Fim
                  <input
                    required
                    type="datetime-local"
                    value={bloqueio.fimEm}
                    onChange={(event) =>
                      setBloqueio({ ...bloqueio, fimEm: event.target.value })
                    }
                    className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3"
                  />
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">
                Motivo
                <input
                  required
                  maxLength={160}
                  placeholder="Ex.: manutenção, troca de bico, uso pessoal"
                  value={bloqueio.motivo}
                  onChange={(event) =>
                    setBloqueio({ ...bloqueio, motivo: event.target.value })
                  }
                  className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3"
                />
              </label>
              <button
                disabled={isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground disabled:opacity-40"
              >
                <Plus size={14} /> Salvar bloqueio
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
