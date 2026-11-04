import "server-only";
import { connect } from "mqtt";
import { createHash } from "node:crypto";
import db from "@/lib/db";
import { criarMonitorBambu } from "@/lib/bambu-conexao.mjs";
import { chaveBambu, decifrarCodigoBambu } from "@/lib/bambu-segredos.mjs";
import {
  listarConfiguracoesBambu,
  obterVinculoBambu,
} from "@/lib/bambu-repositorio.mjs";

export interface DadosBambu {
  progresso?: number;
  minutosRestantes?: number;
  camada?: number;
  camadasTotal?: number;
  bicoAtual?: number;
  bicoAlvo?: number;
  mesaAtual?: number;
  mesaAlvo?: number;
  camaraAtual?: number;
  arquivo?: string;
  caminhoArquivo?: string;
  erroImpressao?: number;
}
export interface ResumoBambu {
  impressoraId: number;
  nome: string;
  conexao: string;
  atualizadoEm: string | null;
  dadosAtuais: boolean;
  mensagem: string;
  estado: string | null;
  estadoTexto: string;
  jobKey: string | null;
  dados: DadosBambu;
  vinculo: {
    ativo: boolean;
    loteId: number;
    codigo: string;
    referencia: string;
    nome: string;
    pedidoId: number;
    pedido: string | null;
  } | null;
}
type Configuracao = {
  impressora_id: number;
  tenant_id: number;
  nome: string;
  host: string;
  serial: string;
  codigo_cifrado: string;
};
type Monitor = ReturnType<typeof criarMonitorBambu>;
type Entry = { monitor: Monitor; signature: string; ultimoAcesso: number };
declare global {
  var __salgeBambu:
    | { entradas: Map<string, Entry>; limpeza: ReturnType<typeof setInterval> }
    | undefined;
}

function pool() {
  if (!globalThis.__salgeBambu) {
    const entradas = new Map<string, Entry>();
    const limpeza = setInterval(() => {
      for (const [id, entry] of entradas)
        if (Date.now() - entry.ultimoAcesso > 120000) {
          entry.monitor.fechar();
          entradas.delete(id);
        }
    }, 30000);
    limpeza.unref();
    globalThis.__salgeBambu = { entradas, limpeza };
  }
  return globalThis.__salgeBambu.entradas;
}

export function desconectarMonitorBambu(
  tenantId: number,
  impressoraId: number,
) {
  const entries = pool(),
    id = `${tenantId}:${impressoraId}`;
  entries.get(id)?.monitor.fechar();
  entries.delete(id);
}

export function obterMonitoramentoBambu(tenantId: number): ResumoBambu[] {
  const configs = listarConfiguracoesBambu(db, tenantId) as Configuracao[];
  const entries = pool(),
    validos = new Set(configs.map((c) => `${tenantId}:${c.impressora_id}`));
  for (const [id, entry] of entries)
    if (id.startsWith(`${tenantId}:`) && !validos.has(id)) {
      entry.monitor.fechar();
      entries.delete(id);
    }
  return configs.map((config) => {
    const id = `${tenantId}:${config.impressora_id}`;
    const signature = createHash("sha256")
      .update(`${config.host}|${config.serial}|${config.codigo_cifrado}`)
      .digest("hex");
    try {
      let entry = entries.get(id);
      if (entry && entry.signature !== signature) {
        entry.monitor.fechar();
        entries.delete(id);
        entry = undefined;
      }
      if (!entry) {
        const accessCode = decifrarCodigoBambu(
          config.codigo_cifrado,
          chaveBambu(db.name),
          id,
        );
        entry = {
          monitor: criarMonitorBambu(
            { host: config.host, serial: config.serial, accessCode },
            { conectar: connect },
          ),
          signature,
          ultimoAcesso: Date.now(),
        };
        entries.set(id, entry);
      }
      entry.ultimoAcesso = Date.now();
      const snapshot = entry.monitor.snapshot();
      const link = obterVinculoBambu(db, tenantId, config.impressora_id);
      return {
        impressoraId: config.impressora_id,
        nome: config.nome,
        ...snapshot,
        vinculo: link
          ? {
              loteId: link.loteId,
              codigo: link.codigo,
              referencia: link.referencia,
              nome: link.nome,
              pedidoId: link.pedidoId,
              pedido: link.pedido,
              ativo: snapshot.dadosAtuais && link.jobKey === snapshot.jobKey,
            }
          : null,
      } as ResumoBambu;
    } catch {
      return {
        impressoraId: config.impressora_id,
        nome: config.nome,
        conexao: "Erro",
        atualizadoEm: null,
        dadosAtuais: false,
        mensagem:
          "Reconfigure o código de acesso local em Impressoras. A chave local pode ter sido movida ou restaurada separadamente.",
        estado: null,
        estadoTexto: "Sem dados",
        jobKey: null,
        dados: {},
        vinculo: null,
      };
    }
  });
}
