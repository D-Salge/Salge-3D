function textoTag(bloco, tag) {
  const match = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

export function normalizarDataBancaria(valor) {
  const texto = String(valor ?? '').trim()
  let match = texto.match(/^(\d{4})(\d{2})(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = texto.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  return null
}

export function numeroBancario(valor) {
  let texto = String(valor ?? '').trim().replace(/R\$\s*/gi, '').replace(/\s/g, '')
  const negativo = texto.startsWith('(') && texto.endsWith(')')
  texto = texto.replace(/[()]/g, '')
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.')
  const numero = Number(texto)
  if (!Number.isFinite(numero)) return null
  return Math.round((negativo ? -numero : numero) * 100) / 100
}

function separarCsv(linha, separador) {
  const partes = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i += 1) {
    const char = linha[i]
    if (char === '"' && linha[i + 1] === '"' && aspas) { atual += '"'; i += 1; continue }
    if (char === '"') { aspas = !aspas; continue }
    if (char === separador && !aspas) { partes.push(atual.trim()); atual = ''; continue }
    atual += char
  }
  partes.push(atual.trim())
  return partes
}

function parseCsv(conteudo) {
  const linhas = conteudo.replace(/^\uFEFF/, '').split(/\r?\n/).filter((linha) => linha.trim())
  if (linhas.length < 2) return []
  const separador = (linhas[0].match(/;/g)?.length ?? 0) >= (linhas[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const cabecalhos = separarCsv(linhas[0], separador).map((item) => item.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
  const indiceData = cabecalhos.findIndex((item) => ['data', 'date', 'dtposted', 'data lancamento'].includes(item))
  const indiceDescricao = cabecalhos.findIndex((item) => ['descricao', 'historico', 'memo', 'description', 'lancamento'].includes(item))
  const indiceValor = cabecalhos.findIndex((item) => ['valor', 'amount', 'trnamt'].includes(item))
  if (indiceData < 0 || indiceDescricao < 0 || indiceValor < 0) throw new Error('CSV_HEADERS')
  return linhas.slice(1).map((linha, index) => {
    const colunas = separarCsv(linha, separador)
    return {
      identificador: `CSV-${index + 2}`,
      data: normalizarDataBancaria(colunas[indiceData]),
      descricao: colunas[indiceDescricao]?.trim(),
      valor: numeroBancario(colunas[indiceValor]),
    }
  })
}

function parseOfx(conteudo) {
  return [...conteudo.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi)].map((match, index) => ({
    identificador: textoTag(match[1], 'FITID') || `OFX-${index + 1}`,
    data: normalizarDataBancaria(textoTag(match[1], 'DTPOSTED')),
    descricao: textoTag(match[1], 'MEMO') || textoTag(match[1], 'NAME') || 'Lançamento bancário',
    valor: numeroBancario(textoTag(match[1], 'TRNAMT')),
  }))
}

export function parseExtrato(conteudo, nomeArquivo = '') {
  const texto = String(conteudo ?? '')
  const bruto = /\.ofx$/i.test(nomeArquivo) || /<OFX>/i.test(texto) ? parseOfx(texto) : parseCsv(texto)
  const vistos = new Set()
  return bruto.map((item) => ({
    identificador: String(item.identificador || '').slice(0, 120),
    data: item.data,
    descricao: String(item.descricao || '').trim().slice(0, 300),
    valor: item.valor,
  })).filter((item) => {
    if (!item.data || !item.descricao || !item.valor) return false
    const chave = `${item.identificador}|${item.data}|${item.valor}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}

export function distanciaDias(a, b) {
  return Math.round(Math.abs(new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86_400_000)
}

export function sugerirConciliacao(lancamento, candidatos) {
  const tipo = lancamento.valor > 0 ? 'Recebimento' : 'Despesa'
  const valor = Math.abs(lancamento.valor)
  return candidatos
    .filter((item) => item.tipo === tipo && Math.abs(item.valor - valor) < 0.01)
    .map((item) => ({ ...item, distanciaDias: distanciaDias(lancamento.data, item.data) }))
    .filter((item) => item.distanciaDias <= 7)
    .sort((a, b) => a.distanciaDias - b.distanciaDias || a.id - b.id)[0] ?? null
}
