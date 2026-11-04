"use server";

import db from "@/lib/db";
import { exigirPerfil, exigirSessao } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { validarConexaoBambu } from "@/lib/bambu-telemetria.mjs";
import {
  chaveBambu,
  cifrarCodigoBambu,
  decifrarCodigoBambu,
} from "@/lib/bambu-segredos.mjs";
import {
  listarConfiguracoesBambu,
  opcoesLotesBambu,
  salvarConfiguracaoBambu,
  vincularLoteBambu,
} from "@/lib/bambu-repositorio.mjs";
import {
  desconectarMonitorBambu,
  obterMonitoramentoBambu,
} from "@/lib/bambu-monitor";
import { revalidatePath } from "next/cache";

const mensagens: Record<string, string> = {
  IP_LOCAL_INVALIDO:
    "Informe o IPv4 local da impressora (10.x, 172.16–31.x ou 192.168.x).",
  SERIAL_INVALIDO: "Informe o número de série da impressora, sem espaços.",
  CODIGO_INVALIDO: "Informe o código de acesso local com 8 letras ou números.",
  IMPRESSORA_NAO_ENCONTRADA: "Impressora não encontrada.",
  SERIAL_JA_VINCULADO:
    "Esse número de série já está configurado em outra impressora.",
  LOTE_INVALIDO: "Selecione um lote ativo deste pedido e desta impressora.",
  UNAUTHORIZED: "Faça login novamente.",
  FORBIDDEN: "Seu perfil não permite essa alteração.",
};
const erro = (e: unknown) => ({
  success: false,
  message:
    mensagens[e instanceof Error ? e.message : ""] ??
    "Não foi possível salvar. Confira os dados; se a chave local foi perdida, informe novamente o código de acesso.",
});
const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;

export async function getConfiguracoesBambu() {
  const session = await exigirSessao();
  if (session.perfil !== "admin") return [];
  return listarConfiguracoesBambu(db, session.tenantId).map(
    (c: { impressora_id: number; host: string; serial: string }) => ({
      impressoraId: c.impressora_id,
      host: c.host,
      serial: c.serial,
    }),
  );
}

export async function getBambuSetup() {
  const session = await exigirSessao();
  return {
    podeConfigurar: session.perfil === "admin",
    podeVincular: session.perfil !== "visualizador",
    impressoras:
      session.perfil === "admin"
        ? (db
            .prepare(
              "SELECT id, nome FROM impressoras WHERE tenant_id = ? AND ativo = 1 ORDER BY nome",
            )
            .all(session.tenantId) as Array<{ id: number; nome: string }>)
        : [],
    configuracoes: await getConfiguracoesBambu(),
  };
}

export async function salvarConexaoBambu(input: {
  impressoraId: number;
  host: string;
  serial: string;
  accessCode: string;
}) {
  try {
    const session = await exigirPerfil(["admin"]);
    if (!idValido(input.impressoraId))
      throw new Error("IMPRESSORA_NAO_ENCONTRADA");
    const atual = listarConfiguracoesBambu(db, session.tenantId).find(
      (c: { impressora_id: number }) => c.impressora_id === input.impressoraId,
    );
    const context = `${session.tenantId}:${input.impressoraId}`;
    let code =
      typeof input.accessCode === "string" ? input.accessCode.trim() : "";
    const serial = typeof input.serial === "string" ? input.serial.trim() : "";
    if (!code && atual && atual.serial === serial)
      code = decifrarCodigoBambu(
        atual.codigo_cifrado,
        chaveBambu(db.name),
        context,
      );
    const validated = validarConexaoBambu({
      host: typeof input.host === "string" ? input.host.trim() : "",
      serial,
      accessCode: code,
    });
    const key = chaveBambu(db.name, { criar: true });
    salvarConfiguracaoBambu(db, session.tenantId, {
      ...validated,
      impressoraId: input.impressoraId,
      codigoCifrado: cifrarCodigoBambu(validated.accessCode, key, context),
    });
    desconectarMonitorBambu(session.tenantId, input.impressoraId);
    registrarAuditoria(db, {
      tenantId: session.tenantId,
      usuarioId: session.usuarioId,
      entidade: "Impressora",
      entidadeId: input.impressoraId,
      acao: "CONFIGURAR_MONITOR_BAMBU",
      descricao: "Monitoramento local Bambu configurado. Credenciais omitidas.",
    });
    revalidatePath("/impressoras");
    return {
      success: true,
      message: "Configuração salva. Aguardando dados da impressora.",
    };
  } catch (e) {
    return erro(e);
  }
}

export async function desativarConexaoBambu(impressoraId: number) {
  try {
    const session = await exigirPerfil(["admin"]);
    if (!idValido(impressoraId)) throw new Error("IMPRESSORA_NAO_ENCONTRADA");
    db.prepare(
      "UPDATE impressoras_bambu SET ativo = 0 WHERE tenant_id = ? AND impressora_id = ?",
    ).run(session.tenantId, impressoraId);
    desconectarMonitorBambu(session.tenantId, impressoraId);
    registrarAuditoria(db, {
      tenantId: session.tenantId,
      usuarioId: session.usuarioId,
      entidade: "Impressora",
      entidadeId: impressoraId,
      acao: "DESATIVAR_MONITOR_BAMBU",
      descricao: "Monitoramento local Bambu desativado.",
    });
    revalidatePath("/impressoras");
    return {
      success: true,
      message:
        "Monitoramento desativado. A impressão em andamento não foi alterada.",
    };
  } catch (e) {
    return erro(e);
  }
}

export async function getLotesParaMonitorBambu(impressoraId: number) {
  const session = await exigirPerfil(["admin", "operador"]);
  if (!idValido(impressoraId)) return [];
  return opcoesLotesBambu(db, session.tenantId, impressoraId);
}

export async function vincularImpressaoBambu(input: {
  impressoraId: number;
  loteId: number;
  referencia: string;
  jobKey: string;
}) {
  try {
    const session = await exigirPerfil(["admin", "operador"]);
    if (!idValido(input.impressoraId) || !idValido(input.loteId))
      throw new Error("LOTE_INVALIDO");
    if (
      typeof input.referencia !== "string" ||
      !input.referencia.trim() ||
      input.referencia.trim().length > 120
    )
      return {
        success: false,
        message: "Informe a plate e a execução (até 120 caracteres).",
      };
    const current = obterMonitoramentoBambu(session.tenantId).find(
      (c) => c.impressoraId === input.impressoraId,
    );
    if (
      !current?.dadosAtuais ||
      current.jobKey !== input.jobKey ||
      !["RUNNING", "PREPARE", "SLICING", "PAUSE"].includes(current.estado ?? "")
    )
      return {
        success: false,
        message:
          "A impressão ou a conexão mudou. Atualize o painel e vincule a impressão atual.",
      };
    vincularLoteBambu(db, session.tenantId, {
      ...input,
      referencia: input.referencia.trim(),
    });
    registrarAuditoria(db, {
      tenantId: session.tenantId,
      usuarioId: session.usuarioId,
      entidade: "Impressora",
      entidadeId: input.impressoraId,
      acao: "VINCULAR_MONITOR_BAMBU",
      descricao: "Impressão vinculada a um lote para acompanhamento.",
      detalhes: { loteId: input.loteId, referencia: input.referencia.trim() },
    });
    return {
      success: true,
      message:
        "Vínculo salvo para esta impressão. A conclusão continuará pela conferência do ERP.",
    };
  } catch (e) {
    return erro(e);
  }
}
