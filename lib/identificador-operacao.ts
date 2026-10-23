export function gerarIdentificadorOperacao(prefixo?: string): string {
  const valores = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(valores)
  } else {
    for (let indice = 0; indice < valores.length; indice += 1) {
      valores[indice] = Math.floor(Math.random() * 256)
    }
  }
  valores[6] = (valores[6] & 0x0f) | 0x40
  valores[8] = (valores[8] & 0x3f) | 0x80
  const hexadecimal = Array.from(valores, valor => valor.toString(16).padStart(2, '0')).join('')
  const uuid = `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`
  return prefixo ? `${prefixo}-${uuid}` : uuid
}
