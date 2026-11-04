import { isIP } from "node:net";

export const ESTADOS_BAMBU = {
  IDLE: "Ociosa",
  RUNNING: "Imprimindo",
  PAUSE: "Pausada",
  FINISH: "Impressão concluída",
  FAILED: "Falha",
  PREPARE: "Preparando",
  SLICING: "Preparando",
  INIT: "Inicializando",
};

export function validarConexaoBambu({ host, serial, accessCode }) {
  if (typeof host !== "string" || isIP(host) !== 4)
    throw new Error("IP_LOCAL_INVALIDO");
  const [a, b, c, d] = host.split(".").map(Number);
  if (
    !(
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) ||
    d === 0 ||
    d === 255 ||
    (a === 10 && b === 0 && c === 0 && d === 0)
  )
    throw new Error("IP_LOCAL_INVALIDO");
  if (typeof serial !== "string" || !/^[A-Za-z0-9]{10,32}$/.test(serial))
    throw new Error("SERIAL_INVALIDO");
  if (typeof accessCode !== "string" || !/^[A-Za-z0-9]{8}$/.test(accessCode))
    throw new Error("CODIGO_INVALIDO");
  return { host, serial, accessCode };
}

const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const numero = (v, max) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
const texto = (v, max = 200) =>
  typeof v === "string"
    ? v.replace(/[\u0000-\u001f]/g, "").slice(0, max)
    : null;

/** Whitelist sensor fields. Reports are partial; absence is different from zero. */
export function lerRelatorioBambu(payload) {
  if (!Buffer.isBuffer(payload) || payload.length > 262144) return null;
  let raw;
  try {
    raw = JSON.parse(payload.toString("utf8"));
  } catch {
    return null;
  }
  if (!object(raw) || !object(raw.print)) return null;
  const data = raw.print;
  if (data.command && data.command !== "push_status") return null;
  const patch = {};
  const map = {
    mc_percent: ["progresso", 100],
    mc_remaining_time: ["minutosRestantes", 525600],
    layer_num: ["camada", 1000000],
    total_layer_num: ["camadasTotal", 1000000],
    nozzle_temper: ["bicoAtual", 500],
    nozzle_target_temper: ["bicoAlvo", 500],
    bed_temper: ["mesaAtual", 200],
    bed_target_temper: ["mesaAlvo", 200],
    chamber_temper: ["camaraAtual", 200],
    print_error: ["erroImpressao", 0xffffffff],
  };
  for (const [key, [field, max]] of Object.entries(map)) {
    const n = numero(data[key], max);
    if (n !== null) patch[field] = n;
  }
  const state = texto(data.gcode_state, 32);
  if (state) patch.estado = state.toUpperCase();
  for (const [key, target] of Object.entries({
    subtask_name: "arquivo",
    gcode_file: "caminhoArquivo",
    task_id: "taskId",
    subtask_id: "subtaskId",
  })) {
    const value = texto(data[key]);
    if (value !== null) patch[target] = value;
  }
  if (
    data.gcode_start_time !== undefined &&
    /^(?:\d{1,15})$/.test(String(data.gcode_start_time))
  )
    patch.inicioImpressao = String(data.gcode_start_time);
  const device = object(data.device) ? data.device : {};
  // P2S firmware: current temperature in low 16 bits, target in high 16 bits.
  const packed = (value, current, target, max) => {
    if (numero(value, 0xffffffff) === null || !Number.isInteger(value)) return;
    const now = value & 0xffff,
      goal = value >>> 16;
    if (now <= max) patch[current] = now;
    if (goal <= max) patch[target] = goal;
  };
  packed(
    device.bed?.info?.temp ?? device.bed_temp,
    "mesaAtual",
    "mesaAlvo",
    200,
  );
  packed(device.ctc?.info?.temp, "camaraAtual", "camaraAlvo", 200);
  const extruders = device.extruder?.info;
  if (Array.isArray(extruders)) {
    const nozzle = extruders.find((e) => object(e) && e.id === 0);
    if (nozzle) packed(nozzle.temp, "bicoAtual", "bicoAlvo", 500);
  }
  if (!Object.keys(patch).length) return null;
  return patch;
}

export function mesclarRelatorioBambu(previous, patch) {
  const active = ["RUNNING", "PREPARE", "SLICING"];
  const final = ["FINISH", "FAILED", "IDLE"];
  const identityChanged = [
    "inicioImpressao",
    "taskId",
    "subtaskId",
    "caminhoArquivo",
    "arquivo",
  ].some(
    (key) =>
      patch[key] &&
      patch[key] !== "0" &&
      previous[key] &&
      patch[key] !== previous[key],
  );
  const newJob =
    identityChanged ||
    (active.includes(patch.estado ?? previous.estado) && previous.progresso >= 50 && patch.progresso <= 5) ||
    (active.includes(patch.estado) && final.includes(previous.estado));
  // A new print must not inherit the previous job's progress, filename or layers.
  const base = newJob
    ? Object.fromEntries(
        Object.entries(previous).filter(([key]) =>
          /^(?:bico|mesa|camara)/.test(key),
        ),
      )
    : previous;
  return { dados: { ...base, ...patch }, novoTrabalho: newJob };
}

export function mensagemErroBambu(code) {
  if (
    [
      "ENOTFOUND",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ECONNRESET",
    ].includes(code)
  )
    return "Não foi possível alcançar a impressora. Confira o IP e a rede do PC.";
  if (
    String(code).includes("CERT") ||
    String(code).includes("SELF_SIGNED") ||
    String(code).includes("ISSUER")
  )
    return "Certificado da impressora não validado. Confira o número de série e o firmware.";
  if ([4, 5, 134, 135].includes(code))
    return "A impressora recusou o acesso. Confira o código local e as permissões de monitoramento.";
  return "Conexão interrompida. Confira a impressora e os dados de conexão.";
}
