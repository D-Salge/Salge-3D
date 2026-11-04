import { randomUUID } from "node:crypto";
import {
  lerRelatorioBambu,
  mesclarRelatorioBambu,
  mensagemErroBambu,
  validarConexaoBambu,
  ESTADOS_BAMBU,
} from "./bambu-telemetria.mjs";
import { BAMBU_CA } from "./bambu-ca.mjs";

/**
 * Injecting the MQTT factory lets tests assert that no control command is sent.
 * @param {{host:string,serial:string,accessCode:string}} config
 * @param {{conectar:(options:import('mqtt').IClientOptions)=>import('mqtt').MqttClient,agora?:()=>number,uuid?:()=>string}} options
 */
export function criarMonitorBambu(
  config,
  { conectar, agora = Date.now, uuid = randomUUID },
) {
  validarConexaoBambu(config);
  const topic = `device/${config.serial}/report`;
  let dados = {},
    recebidoEm = null,
    conectado = false,
    inscrito = false,
    erro = "",
    parado = false;
  let jobKey = uuid();
  const client = conectar({
    protocol: "mqtts",
    host: config.host,
    port: 8883,
    username: "bblp",
    password: config.accessCode,
    servername: config.serial,
    ca: BAMBU_CA,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.2",
    clientId: `salge-${uuid()}`,
    clean: true,
    protocolVersion: 4,
    connectTimeout: 10000,
    reconnectPeriod: 15000,
    keepalive: 30,
    resubscribe: false,
    queueQoSZero: false,
    reconnectOnConnackError: false,
  });
  client.on("connect", () => {
    if (parado) return;
    conectado = true;
    inscrito = false;
    erro = "";
    dados = {};
    recebidoEm = null;
    jobKey = uuid();
    client.subscribe(topic, { qos: 0 }, (error, granted) => {
      if (parado) return;
      if (
        error ||
        !granted?.length ||
        granted.some((item) => item.qos === 128)
      ) {
        inscrito = false;
        erro = "A impressora recusou a leitura dos dados.";
      } else inscrito = true;
    });
  });
  client.on("message", (incomingTopic, payload, packet) => {
    if (parado || !conectado || incomingTopic !== topic || packet?.retain)
      return;
    const patch = lerRelatorioBambu(payload);
    if (!patch) return;
    const merged = mesclarRelatorioBambu(dados, patch);
    if (merged.novoTrabalho) jobKey = uuid();
    dados = merged.dados;
    // Retained messages can describe a print that finished hours ago.
    if (!packet?.retain) recebidoEm = agora();
    erro = "";
  });
  client.on("error", (error) => {
    if (!parado) erro = mensagemErroBambu(error.code ?? error.returnCode);
  });
  client.on("close", () => {
    conectado = false;
    inscrito = false;
  });
  return {
    snapshot() {
      const fresco =
        conectado &&
        inscrito &&
        recebidoEm !== null &&
        agora() - recebidoEm < 90000;
      return {
        conexao: fresco
          ? "Online"
          : erro
            ? "Erro"
            : conectado && inscrito
              ? "Aguardando dados"
              : "Conectando",
        atualizadoEm:
          recebidoEm === null ? null : new Date(recebidoEm).toISOString(),
        dadosAtuais: fresco,
        mensagem: erro,
        estado: dados.estado ?? null,
        estadoTexto: ESTADOS_BAMBU[dados.estado] ?? "Estado não informado",
        jobKey: recebidoEm === null ? null : jobKey,
        dados: { ...dados },
      };
    },
    fechar() {
      parado = true;
      conectado = false;
      inscrito = false;
      client.end(true);
    },
  };
}
