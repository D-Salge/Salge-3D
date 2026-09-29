export const TAMANHO_MAXIMO_ARQUIVO = 25 * 1024 * 1024

const TIPOS = {
  '.3mf': 'Modelo 3MF',
  '.stl': 'Modelo STL',
  '.png': 'Imagem',
  '.jpg': 'Imagem',
  '.jpeg': 'Imagem',
  '.webp': 'Imagem',
  '.pdf': 'Documento PDF',
}

export function extensaoArquivo(nome) {
  const indice = String(nome || '').lastIndexOf('.')
  return indice >= 0 ? String(nome).slice(indice).toLowerCase() : ''
}

export function tipoArquivoProducao(nome) {
  return TIPOS[extensaoArquivo(nome)] || null
}

export function normalizarNomeArquivo(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function validarArquivoProducao({ nome, tamanho, primeirosBytes }) {
  const extensao = extensaoArquivo(nome)
  if (!TIPOS[extensao]) return { valido: false, erro: 'Use arquivos 3MF, STL, PNG, JPG, WEBP ou PDF.' }
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO_ARQUIVO) {
    return { valido: false, erro: 'O arquivo deve ter no máximo 25 MB.' }
  }
  const bytes = Buffer.from(primeirosBytes || [])
  const texto = bytes.subarray(0, 12).toString('latin1')
  const stlAscii = texto.trimStart().toLowerCase().startsWith('solid')
  const stlBinario = bytes.length >= 84
    && tamanho === 84 + (bytes.readUInt32LE(80) * 50)
  const assinaturas = {
    '.3mf': bytes[0] === 0x50 && bytes[1] === 0x4b,
    '.png': bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    '.jpg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    '.jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    '.webp': texto.startsWith('RIFF') && texto.slice(8, 12) === 'WEBP',
    '.pdf': texto.startsWith('%PDF'),
    '.stl': stlAscii || stlBinario,
  }
  if (!assinaturas[extensao]) return { valido: false, erro: 'O conteúdo do arquivo não corresponde à extensão informada.' }
  return { valido: true, extensao, tipo: TIPOS[extensao] }
}

export function formatarTamanhoArquivo(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
