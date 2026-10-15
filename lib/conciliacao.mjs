function textoTag(bloco, tag) {
  const match = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

export function normalizarDataBancaria(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, '0')}-${String(valor.getUTCDate()).padStart(2, '0')}`
  }
  const texto = String(valor ?? '').trim()
  let match = texto.match(/^(\d{4})(\d{2})(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = texto.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  return null
}

function normalizarCabecalho(valor) {
  return String(valor ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim()
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

export function parseExtratoMercadoPago(linhas) {
  if (!Array.isArray(linhas)) throw new Error('MERCADO_PAGO_HEADERS')
  const cabecalhosEsperados = [
    'release_date',
    'transaction_type',
    'reference_id',
    'transaction_net_amount',
  ]
  const indiceCabecalho = linhas.findIndex((linha) => {
    if (!Array.isArray(linha)) return false
    const normalizados = linha.map(normalizarCabecalho)
    return cabecalhosEsperados.every((cabecalho) => normalizados.includes(cabecalho))
  })
  if (indiceCabecalho < 0) throw new Error('MERCADO_PAGO_HEADERS')

  const cabecalhos = linhas[indiceCabecalho].map(normalizarCabecalho)
  const indiceData = cabecalhos.indexOf('release_date')
  const indiceDescricao = cabecalhos.indexOf('transaction_type')
  const indiceIdentificador = cabecalhos.indexOf('reference_id')
  const indiceValor = cabecalhos.indexOf('transaction_net_amount')
  const vistos = new Set()

  return linhas.slice(indiceCabecalho + 1).map((linha) => ({
    identificador: String(linha?.[indiceIdentificador] ?? '').trim().slice(0, 120),
    data: normalizarDataBancaria(linha?.[indiceData]),
    descricao: String(linha?.[indiceDescricao] ?? '').trim().slice(0, 300),
    valor: numeroBancario(linha?.[indiceValor]),
  })).filter((item) => {
    if (!item.identificador || !item.data || !item.descricao || !item.valor) return false
    const chave = `${item.identificador}|${item.data}|${item.valor}`
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })
}

export function detectarTransferenciaMercadoPago(descricao, valor) {
  const texto = normalizarCabecalho(descricao)
  if (texto.startsWith('dinheiro reservado ') && valor < 0) return 'ParaReserva'
  if (texto.startsWith('dinheiro retirado ') && valor > 0) return 'DaReserva'
  return null
}

export function valoresFechamConciliacao(valorLancamento, valores) {
  if (!Array.isArray(valores) || valores.length === 0) return false
  const alvo = Math.round(Math.abs(Number(valorLancamento)) * 100)
  if (!Number.isSafeInteger(alvo) || alvo <= 0) return false
  let total = 0
  for (const valor of valores) {
    const centavos = Math.round(Number(valor) * 100)
    if (!Number.isSafeInteger(centavos) || centavos <= 0) return false
    total += centavos
  }
  return total === alvo
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

/**
 * Reabre um lançamento tratado e desfaz somente o efeito criado pela
 * conciliação. Registros financeiros que já existiam são preservados.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} tenantId
 * @param {number} lancamentoId
 */
export function desfazerConciliacaoExtrato(db, tenantId, lancamentoId) {
  const linha = db.prepare(`SELECT id, status, classificacao, entidade_tipo, entidade_id,
      transferencia_financeira_id, fluxo_capital_id
    FROM extrato_lancamentos
    WHERE id = ? AND tenant_id = ? AND status <> 'Pendente'`)
    .get(lancamentoId, tenantId)
  if (!linha) throw new Error('NOT_FOUND')

  let despesaCriadaPeloExtrato = false
  if (linha.classificacao === 'Despesa' && linha.entidade_tipo === 'Despesa' && linha.entidade_id) {
    despesaCriadaPeloExtrato = Boolean(db.prepare(`SELECT 1 FROM auditoria
      WHERE tenant_id = ? AND entidade = 'Despesa' AND entidade_id = ?
        AND acao = 'CRIAR_DO_EXTRATO' LIMIT 1`).get(tenantId, linha.entidade_id))
  }

  if (linha.transferencia_financeira_id) {
    db.prepare(`UPDATE transferencias_financeiras
      SET estornada_em = COALESCE(estornada_em, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      WHERE id = ? AND tenant_id = ?`)
      .run(linha.transferencia_financeira_id, tenantId)
  }
  if (linha.fluxo_capital_id) {
    db.prepare(`DELETE FROM fluxo_capital WHERE id = ? AND tenant_id = ?`)
      .run(linha.fluxo_capital_id, tenantId)
  }
  if (despesaCriadaPeloExtrato) {
    db.prepare(`UPDATE despesas
      SET estornada_em = COALESCE(estornada_em, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          estorno_motivo = COALESCE(estorno_motivo, 'Classificação do extrato desfeita')
      WHERE id = ? AND tenant_id = ?`)
      .run(linha.entidade_id, tenantId)
  }

  db.prepare(`DELETE FROM extrato_conciliacoes
    WHERE tenant_id = ? AND extrato_lancamento_id = ?`).run(tenantId, linha.id)
  db.prepare(`UPDATE extrato_lancamentos
    SET status = 'Pendente', classificacao = NULL, entidade_tipo = NULL,
      entidade_id = NULL, transferencia_financeira_id = NULL,
      fluxo_capital_id = NULL, conciliado_em = NULL
    WHERE id = ? AND tenant_id = ?`).run(linha.id, tenantId)

  return {
    classificacaoAnterior: linha.classificacao,
    despesaCriadaPeloExtrato,
    transferenciaEstornada: Boolean(linha.transferencia_financeira_id),
    fluxoCapitalRemovido: Boolean(linha.fluxo_capital_id),
  }
}
