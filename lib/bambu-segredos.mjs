import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function chaveBambu(caminhoBanco, { criar = false } = {}) {
  const dir = join(dirname(caminhoBanco), "segredos-locais");
  const file = join(dir, "bambu.key");
  if (!existsSync(file) && criar) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      writeFileSync(file, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  let key;
  try {
    key = readFileSync(file);
  } catch {
    throw new Error("CHAVE_LOCAL_AUSENTE");
  }
  if (key.length !== 32) throw new Error("CHAVE_LOCAL_INVALIDA");
  return key;
}

export function cifrarCodigoBambu(code, key, contexto) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(contexto));
  const encrypted = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decifrarCodigoBambu(value, key, contexto) {
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length < 29 || bytes.length > 1024) throw new Error("invalid");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(contexto));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("CODIGO_LOCAL_ILEGIVEL");
  }
}
