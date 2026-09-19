import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'

export const REQUIRED_SHEETS = [
  'Painel', 'Recebimentos', 'Vendas', 'Gastos', 'Clientes', 'Estoque',
  'Calculadora', 'Configurações', 'Aportes e retiradas', 'Como usar', 'Materiais',
]

export const DATA_HEADERS = {
  Recebimentos: ['ID do recebimento', 'Data', 'ID da venda', 'Cliente', 'Forma de pagamento', 'Valor', 'Observações'],
  Vendas: [
    'ID da venda', 'Data do pedido', 'Data de entrega', 'Status', 'ID do cliente', 'Cliente',
    'Tipo de venda', 'Produto / serviço', 'Categoria', 'Quantidade', 'Preço unitário',
    'Desconto total', 'Frete cobrado', 'Receita total', 'ID do filamento',
    'Material usado (g)', 'Custo do material', 'Horas de impressão', 'Custo de energia',
    'Embalagem', 'Frete pago', 'Taxas / comissões', 'Custos adicionais',
    'Custo completo total', 'Lucro estimado', 'Margem', 'Valor recebido',
    'Saldo a receber', 'Situação financeira', 'Canal', 'Observações',
    'ID do filamento 2', 'Material 2 usado (g)', 'ID do filamento 3',
    'Material 3 usado (g)', 'ID do filamento 4', 'Material 4 usado (g)',
    'ID material 1', 'Qtd. material 1', 'ID material 2', 'Qtd. material 2',
    'ID material 3', 'Qtd. material 3', 'ID material 4', 'Qtd. material 4',
    'Custo de materiais / insumos',
  ],
  Gastos: ['ID do gasto', 'Data da compra', 'Vencimento', 'Data do pagamento', 'Status', 'Categoria', 'Descrição', 'Fornecedor', 'Tipo', 'Forma de pagamento', 'Valor', 'ID da venda relacionada', 'Observações'],
  Clientes: ['ID do cliente', 'Nome / empresa', 'Tipo', 'WhatsApp', 'Instagram / e-mail', 'Cidade', 'Origem', 'Data de cadastro', 'Último contato', 'Pedidos', 'Total vendido', 'A receber', 'Observações'],
  Estoque: ['ID do filamento', 'Marca', 'Material', 'Cor', 'Peso inicial (g)', 'Material usado (g)', 'Saldo estimado (g)', 'Custo do rolo', 'Custo por kg', 'Data da compra', 'Status', 'Fornecedor', 'Observações'],
  'Aportes e retiradas': ['ID da movimentação', 'Data', 'Tipo', 'Descrição', 'Valor', 'Afeta caixa?', 'Forma / origem-destino', 'Observações'],
  Materiais: ['ID do material', 'Material / insumo', 'Categoria', 'Unidade de controle', 'Quantidade inicial', 'Quantidade usada', 'Saldo estimado', 'Valor total pago', 'Custo por unidade', 'Data da compra', 'Status', 'Fornecedor', 'Link / observações'],
}

const FILAMENT_FIELDS = [
  ['ID do filamento', 'Material usado (g)'],
  ['ID do filamento 2', 'Material 2 usado (g)'],
  ['ID do filamento 3', 'Material 3 usado (g)'],
  ['ID do filamento 4', 'Material 4 usado (g)'],
]

const MATERIAL_FIELDS = [
  ['ID material 1', 'Qtd. material 1'],
  ['ID material 2', 'Qtd. material 2'],
  ['ID material 3', 'Qtd. material 3'],
  ['ID material 4', 'Qtd. material 4'],
]

function text(value) {
  if (value === null || value === undefined) return null
  const result = String(value).trim()
  return result === '' ? null : result
}

function number(value) {
  if (value === null || value === undefined || value === '') return 0
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function round(value, digits = 4) {
  const factor = 10 ** digits
  return Math.round((number(value) + Number.EPSILON) * factor) / factor
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function rawCellValue(cell) {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value
  if ('result' in value) return rawFormulaResult(value.result)
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  if ('text' in value && typeof value.text === 'string') return value.text
  if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.text ?? value.hyperlink
  if ('error' in value) return value.error
  return String(value)
}

function rawFormulaResult(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value
  if ('error' in value) return value.error
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  return String(value)
}

function excelDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') {
    const iso = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (iso) return iso[1]
  }
  if (typeof value === 'number' && value > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000))
      .toISOString().slice(0, 10)
  }
  return null
}

function readHeaderSheet(workbook, sheetName, expectedHeaders, errors) {
  const sheet = workbook.getWorksheet(sheetName)
  if (!sheet) return []
  const actualHeaders = expectedHeaders.map((_, index) => text(rawCellValue(sheet.getCell(5, index + 1))))
  expectedHeaders.forEach((expected, index) => {
    if (actualHeaders[index] !== expected) {
      errors.push(`Aba ${sheetName}: coluna ${index + 1} deveria ser “${expected}”, mas foi encontrada “${actualHeaders[index] ?? 'vazia'}”.`)
    }
  })

  const rows = []
  for (let rowNumber = 6; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const first = rawCellValue(sheet.getCell(rowNumber, 1))
    if (text(first) === null) continue
    const values = expectedHeaders.map((_, index) => rawCellValue(sheet.getCell(rowNumber, index + 1)))
    rows.push({
      rowNumber,
      data: Object.fromEntries(expectedHeaders.map((header, index) => [header, values[index]])),
    })
  }
  return rows
}

function duplicateIds(rows, field) {
  const seen = new Map()
  for (const row of rows) {
    const id = text(row.data[field])
    if (!id) continue
    const list = seen.get(id) ?? []
    list.push(row.rowNumber)
    seen.set(id, list)
  }
  return [...seen.entries()].filter(([, lineNumbers]) => lineNumbers.length > 1)
}

function sum(rows, field) {
  return round(rows.reduce((total, row) => total + number(row.data[field]), 0), 2)
}

function isOwnerWithdrawal(row) {
  return normalize(row.data['Descrição']).includes('retirada do proprietario')
}

function splitContact(value) {
  const input = text(value)
  if (!input) return { email: null, instagram: null }
  const email = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null
  const remainder = email ? input.replace(email, '').replace(/^[\s,;|/-]+|[\s,;|/-]+$/g, '') : input
  return { email, instagram: text(remainder) }
}

function mapOrigin(value) {
  const key = normalize(value)
  return ({ instagram: 'Instagram', indicacao: 'Indicacao', google: 'Google', whatsapp: 'WhatsApp', presencial: 'Presencial' })[key] ?? 'Outro'
}

function mapPayment(value) {
  const key = normalize(value)
  return ({ pix: 'Pix', dinheiro: 'Dinheiro', 'cartao credito': 'Cartao Credito', 'cartao de credito': 'Cartao Credito', 'cartao debito': 'Cartao Debito', 'cartao de debito': 'Cartao Debito', transferencia: 'Transferencia' })[key] ?? 'Outro'
}

function mapExpenseCategory(value) {
  const key = normalize(value)
  if (key.includes('filamento')) return 'Filamentos'
  if (key.includes('embalagem')) return 'Embalagens'
  if (key.includes('ferrament') || key.includes('equipamento')) return 'Equipamento'
  if (key.includes('energia')) return 'Energia'
  if (key.includes('frete')) return 'Frete'
  if (key.includes('marketing')) return 'Marketing'
  if (key.includes('software')) return 'Software'
  if (key.includes('manutenc')) return 'Manutencao'
  if (key.includes('insumo') || key.includes('material')) return 'Insumos'
  return 'Outros'
}

function mapUnit(value) {
  const key = normalize(value).replaceAll('.', '')
  if (['unid', 'unidade', 'unidades'].includes(key)) return 'unid'
  if (['g', 'grama', 'gramas'].includes(key)) return 'g'
  if (['ml'].includes(key)) return 'ml'
  if (['cm'].includes(key)) return 'cm'
  if (['m', 'metro', 'metros'].includes(key)) return 'm'
  return 'unid'
}

export function mapearStatusPedido(status) {
  const key = normalize(status)
  if (key === 'entregue') return { status: 'Finalizado', quote: 'Aprovado' }
  if (key === 'aguardando pagamento') return { status: 'Finalizado', quote: 'Aprovado' }
  if (key === 'pronto') return { status: 'Acabamento', quote: 'Aprovado' }
  if (key === 'cancelado') return { status: 'Cancelado', quote: 'Recusado' }
  if (key === 'orcamento') return { status: 'Fila', quote: 'Enviado' }
  return { status: 'Fila', quote: 'Aprovado' }
}

function required(row, fields, sheet, errors) {
  const missing = fields.filter((field) => text(row.data[field]) === null)
  if (missing.length) errors.push(`${sheet}!${row.rowNumber}: campos obrigatórios vazios: ${missing.join(', ')}.`)
}

export async function analisarPlanilha(buffer, { nomeArquivo = 'planilha.xlsx' } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)

  const errors = []
  const warnings = []
  for (const sheetName of REQUIRED_SHEETS) {
    if (!workbook.getWorksheet(sheetName)) errors.push(`Aba obrigatória ausente: ${sheetName}.`)
  }

  const rows = Object.fromEntries(Object.entries(DATA_HEADERS).map(([sheet, headers]) => [sheet, readHeaderSheet(workbook, sheet, headers, errors)]))
  const configSheet = workbook.getWorksheet('Configurações')
  const config = {}
  const configRows = []
  if (configSheet) {
    for (let rowNumber = 5; rowNumber <= 17; rowNumber += 1) {
      const parameter = text(rawCellValue(configSheet.getCell(rowNumber, 1)))
      const value = rawCellValue(configSheet.getCell(rowNumber, 2))
      if (!parameter) continue
      config[parameter] = value
      configRows.push({ rowNumber, data: { Parâmetro: parameter, Valor: value, Orientação: rawCellValue(configSheet.getCell(rowNumber, 3)) } })
    }
  }

  const idFields = {
    Recebimentos: 'ID do recebimento', Vendas: 'ID da venda', Gastos: 'ID do gasto',
    Clientes: 'ID do cliente', Estoque: 'ID do filamento',
    'Aportes e retiradas': 'ID da movimentação', Materiais: 'ID do material',
  }
  for (const [sheet, field] of Object.entries(idFields)) {
    for (const [id, lineNumbers] of duplicateIds(rows[sheet], field)) {
      errors.push(`${sheet}: ID duplicado ${id} nas linhas ${lineNumbers.join(', ')}.`)
    }
  }

  rows.Clientes.forEach((row) => required(row, ['ID do cliente', 'Nome / empresa'], 'Clientes', errors))
  rows.Estoque.forEach((row) => required(row, ['ID do filamento', 'Material', 'Cor'], 'Estoque', errors))
  rows.Materiais.forEach((row) => required(row, ['ID do material', 'Material / insumo', 'Unidade de controle'], 'Materiais', errors))
  rows.Vendas.forEach((row) => required(row, ['ID da venda', 'Data do pedido', 'Status', 'ID do cliente', 'Produto / serviço'], 'Vendas', errors))
  rows.Recebimentos.forEach((row) => required(row, ['ID do recebimento', 'Data', 'ID da venda', 'Valor'], 'Recebimentos', errors))
  rows.Gastos.forEach((row) => required(row, ['ID do gasto', 'Data da compra', 'Status', 'Descrição', 'Valor'], 'Gastos', errors))

  const clientIds = new Set(rows.Clientes.map((row) => text(row.data['ID do cliente'])))
  const orderIds = new Set(rows.Vendas.map((row) => text(row.data['ID da venda'])))
  const filamentIds = new Set(rows.Estoque.map((row) => text(row.data['ID do filamento'])))
  const materialIds = new Set(rows.Materiais.map((row) => text(row.data['ID do material'])))

  for (const row of rows.Vendas) {
    const id = text(row.data['ID da venda'])
    const clientId = text(row.data['ID do cliente'])
    if (clientId && !clientIds.has(clientId)) errors.push(`Vendas!${row.rowNumber}: ${id} referencia cliente inexistente ${clientId}.`)
    for (const [field] of FILAMENT_FIELDS) {
      const value = text(row.data[field])
      if (value && !filamentIds.has(value)) errors.push(`Vendas!${row.rowNumber}: ${id} referencia filamento inexistente ${value}.`)
    }
    for (const [field] of MATERIAL_FIELDS) {
      const value = text(row.data[field])
      if (value && !materialIds.has(value)) errors.push(`Vendas!${row.rowNumber}: ${id} referencia material inexistente ${value}.`)
    }
    if (!excelDate(row.data['Data do pedido'])) errors.push(`Vendas!${row.rowNumber}: data do pedido inválida.`)
  }
  for (const row of rows.Recebimentos) {
    const saleId = text(row.data['ID da venda'])
    if (saleId && !orderIds.has(saleId)) errors.push(`Recebimentos!${row.rowNumber}: venda inexistente ${saleId}.`)
    if (!(number(row.data.Valor) > 0)) errors.push(`Recebimentos!${row.rowNumber}: valor deve ser maior que zero.`)
  }
  for (const row of rows.Gastos) {
    const saleId = text(row.data['ID da venda relacionada'])
    if (saleId && !orderIds.has(saleId)) errors.push(`Gastos!${row.rowNumber}: venda inexistente ${saleId}.`)
    if (!(number(row.data.Valor) > 0)) errors.push(`Gastos!${row.rowNumber}: valor deve ser maior que zero.`)
  }

  for (const row of rows.Estoque) {
    const initial = number(row.data['Peso inicial (g)'])
    const used = number(row.data['Material usado (g)'])
    const balance = number(row.data['Saldo estimado (g)'])
    if (!(initial > 0)) errors.push(`Estoque!${row.rowNumber}: peso inicial deve ser maior que zero.`)
    if (Math.abs(Math.max(0, initial - used) - balance) > 0.01) errors.push(`Estoque!${row.rowNumber}: saldo não confere com peso inicial menos consumo.`)
  }
  for (const row of rows.Materiais) {
    const initial = number(row.data['Quantidade inicial'])
    const used = number(row.data['Quantidade usada'])
    const balance = number(row.data['Saldo estimado'])
    if (!(initial > 0)) errors.push(`Materiais!${row.rowNumber}: quantidade inicial deve ser maior que zero.`)
    if (Math.abs(Math.max(0, initial - used) - balance) > 0.01) errors.push(`Materiais!${row.rowNumber}: saldo não confere com quantidade inicial menos consumo.`)
  }

  const receiptsBySale = new Map()
  for (const row of rows.Recebimentos) {
    const id = text(row.data['ID da venda'])
    receiptsBySale.set(id, round((receiptsBySale.get(id) ?? 0) + number(row.data.Valor), 2))
  }
  const receiptMismatches = []
  const overpayments = []
  for (const row of rows.Vendas) {
    const id = text(row.data['ID da venda'])
    const detail = number(row.data['Valor recebido'])
    const actual = receiptsBySale.get(id) ?? 0
    if (Math.abs(detail - actual) > 0.01) receiptMismatches.push({ id, linha: row.rowNumber, informado: detail, recebimentos: actual })
    const revenue = number(row.data['Receita total'])
    if (actual - revenue > 0.01) overpayments.push({ id, linha: row.rowNumber, receita: revenue, recebido: actual, credito: round(actual - revenue, 2) })
  }
  if (receiptMismatches.length) errors.push(`${receiptMismatches.length} venda(s) não conferem com a aba Recebimentos.`)
  if (overpayments.length) warnings.push(`${overpayments.length} venda possui pagamento acima do valor cobrado; o excedente será mantido como crédito não alocado.`)

  const usageByFilament = new Map()
  const usageByMaterial = new Map()
  for (const row of rows.Vendas) {
    for (const [idField, quantityField] of FILAMENT_FIELDS) {
      const id = text(row.data[idField])
      if (id) usageByFilament.set(id, round((usageByFilament.get(id) ?? 0) + number(row.data[quantityField])))
    }
    for (const [idField, quantityField] of MATERIAL_FIELDS) {
      const id = text(row.data[idField])
      if (id) usageByMaterial.set(id, round((usageByMaterial.get(id) ?? 0) + number(row.data[quantityField])))
    }
  }
  const filamentAdjustments = rows.Estoque.flatMap((row) => {
    const id = text(row.data['ID do filamento'])
    const total = number(row.data['Material usado (g)'])
    const linked = usageByFilament.get(id) ?? 0
    return Math.abs(total - linked) > 0.01 ? [{ id, consumoTotal: total, vinculadoPedidos: linked, ajuste: round(total - linked) }] : []
  })
  const materialAdjustments = rows.Materiais.flatMap((row) => {
    const id = text(row.data['ID do material'])
    const total = number(row.data['Quantidade usada'])
    const linked = usageByMaterial.get(id) ?? 0
    return Math.abs(total - linked) > 0.01 ? [{ id, consumoTotal: total, vinculadoPedidos: linked, ajuste: round(total - linked) }] : []
  })
  if (filamentAdjustments.length) warnings.push(`${filamentAdjustments.length} lote(s) de filamento exigem ajuste histórico para preservar o saldo da planilha.`)
  if (materialAdjustments.length) warnings.push(`${materialAdjustments.length} material(is) exigem ajuste histórico para preservar o saldo da planilha.`)

  let formulaErrors = 0
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => row.eachCell((cell) => {
      const value = cell.value
      if (value && typeof value === 'object' && 'formula' in value) {
        const result = rawFormulaResult(value.result)
        if (typeof result === 'string' && result.startsWith('#')) formulaErrors += 1
      }
    }))
  })
  if (formulaErrors) warnings.push(`${formulaErrors} fórmula(s) com erro foram detectadas; campos derivados serão recalculados pelo ERP.`)

  const missingProduction = rows.Vendas.filter((row) => !text(row.data['ID do filamento']) || !(number(row.data['Horas de impressão']) > 0)).length
  if (missingProduction) warnings.push(`${missingProduction} venda(s) históricas não têm detalhamento completo de filamento e/ou horas; os dados originais permanecerão arquivados.`)

  const withdrawals = rows.Gastos.filter(isOwnerWithdrawal)
  if (withdrawals.length) warnings.push(`${withdrawals.length} lançamento(s) serão reclassificados de gasto para retirada do proprietário.`)
  const personallyPaidLots = rows.Estoque.filter((row) => normalize(row.data.Observações).includes('recurso pessoal')).length
  if (personallyPaidLots) warnings.push(`${personallyPaidLots} compra(s) de filamento foram pagas com recurso pessoal e permanecerão sinalizadas nas observações.`)
  const deliveredAwaitingPayment = rows.Vendas.filter((row) => normalize(row.data.Status) === 'aguardando pagamento').length
  if (deliveredAwaitingPayment) warnings.push(`${deliveredAwaitingPayment} pedido(s) em “Aguardando pagamento” serão importados como produção finalizada, mantendo o saldo financeiro pendente.`)

  const productKeys = new Set(rows.Estoque.map((row) => [row.data.Marca, row.data.Material, row.data.Cor].map(normalize).join('|')))
  const report = {
    arquivo: { nome: nomeArquivo, tamanho: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    valido: errors.length === 0,
    erros: errors,
    avisos: warnings,
    contagens: {
      clientes: rows.Clientes.length,
      pedidos: rows.Vendas.length,
      recebimentos: rows.Recebimentos.length,
      despesas: rows.Gastos.length - withdrawals.length,
      retiradasReclassificadas: withdrawals.length,
      movimentosCapital: rows['Aportes e retiradas'].length,
      produtosFilamento: productKeys.size,
      lotesFilamento: rows.Estoque.length,
      insumos: rows.Materiais.length,
    },
    totais: {
      vendas: sum(rows.Vendas, 'Receita total'),
      recebido: sum(rows.Recebimentos, 'Valor'),
      saldoAbertoPlanilha: sum(rows.Vendas, 'Saldo a receber'),
      gastosOriginais: sum(rows.Gastos, 'Valor'),
      despesasOperacionais: round(rows.Gastos.filter((row) => !isOwnerWithdrawal(row)).reduce((total, row) => total + number(row.data.Valor), 0), 2),
      retiradasReclassificadas: round(withdrawals.reduce((total, row) => total + number(row.data.Valor), 0), 2),
    },
    reconciliacao: { recebimentosDivergentes: receiptMismatches, sobrepagamentos: overpayments, ajustesFilamento: filamentAdjustments, ajustesMaterial: materialAdjustments, errosFormula: formulaErrors },
    abas: REQUIRED_SHEETS.map((name) => ({ name, destino: DATA_HEADERS[name] ? 'Importada' : name === 'Configurações' ? 'Configuração' : 'Referência/derivada' })),
  }

  return { workbook, rows, config, configRows, report, buffer: bytes }
}

export function contarDadosOperacionais(db, tenantId = 1) {
  const tables = ['clientes', 'filamentos', 'insumos', 'pedidos', 'recebimentos', 'despesas', 'fluxo_capital']
  return Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE tenant_id = ?`).get(tenantId).total]))
}

function assertNoExternalIdCollisions(db, parsed, tenantId) {
  const checks = [
    ['clientes', parsed.rows.Clientes, 'ID do cliente'],
    ['pedidos', parsed.rows.Vendas, 'ID da venda'],
    ['recebimentos', parsed.rows.Recebimentos, 'ID do recebimento'],
    ['despesas', parsed.rows.Gastos.filter((row) => !isOwnerWithdrawal(row)), 'ID do gasto'],
    ['fluxo_capital', parsed.rows.Gastos.filter(isOwnerWithdrawal), 'ID do gasto'],
    ['fluxo_capital', parsed.rows['Aportes e retiradas'], 'ID da movimentação'],
    ['insumos', parsed.rows.Materiais, 'ID do material'],
  ]
  for (const [table, rows, field] of checks) {
    const query = db.prepare(`SELECT 1 FROM ${table} WHERE tenant_id = ? AND codigo_externo = ?`)
    for (const row of rows) {
      const code = text(row.data[field])
      if (code && query.get(tenantId, code)) throw new Error(`O ID ${code} já foi importado para ${table}.`)
    }
  }
  const lotQuery = db.prepare('SELECT 1 FROM lotes_filamento WHERE tenant_id = ? AND codigo = ?')
  for (const row of parsed.rows.Estoque) {
    const code = text(row.data['ID do filamento'])
    if (code && lotQuery.get(tenantId, code)) throw new Error(`O lote ${code} já existe no estoque.`)
  }
}

function rawJson(row) {
  return JSON.stringify(row.data)
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Awaited<ReturnType<typeof analisarPlanilha>>} parsed
 * @param {{ importacaoId: number, tenantId?: number, usuarioId?: number, permitirMesclar?: boolean }} options
 */
export function importarPlanilha(db, parsed, { importacaoId, tenantId = 1, usuarioId = 1, permitirMesclar = false }) {
  if (!importacaoId) throw new Error('Importação pendente não informada.')
  if (!parsed.report.valido) throw new Error('A planilha possui erros de validação e não pode ser importada.')
  const existing = contarDadosOperacionais(db, tenantId)
  if (!permitirMesclar && Object.values(existing).some((total) => total > 0)) {
    throw new Error('BASE_NAO_VAZIA')
  }
  assertNoExternalIdCollisions(db, parsed, tenantId)

  const archive = db.prepare(`INSERT INTO importacao_linhas
    (importacao_id, aba, linha, codigo_externo, entidade, entidade_id, dados_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  const clientMap = new Map()
  const orderMap = new Map()
  const lotMap = new Map()
  const materialMap = new Map()
  const lotBalances = new Map()
  const materialBalances = new Map()
  const result = { clientes: 0, pedidos: 0, recebimentos: 0, despesas: 0, retiradas: 0, movimentosCapital: 0, produtosFilamento: 0, lotesFilamento: 0, insumos: 0, ajustesEstoque: 0 }

  const execute = db.transaction(() => {
    const pending = db.prepare(`SELECT status FROM importacoes_planilha WHERE id = ? AND tenant_id = ?`).get(importacaoId, tenantId)
    if (!pending || pending.status !== 'Pendente') throw new Error('Importação não está mais pendente.')
    db.prepare(`UPDATE importacoes_planilha SET status = 'Importando', erro = NULL WHERE id = ?`).run(importacaoId)

    const cfg = parsed.config
    db.prepare(`UPDATE tenants SET
      nome = COALESCE(?, nome), saldo_inicial_caixa = ?, potencia_impressora_w = ?,
      tarifa_energia_kwh = ?, margem_perdas_padrao = ?, taxa_venda_padrao = ?,
      valor_hora_trabalho = ?, custo_hora_maquina = ?, fator_b2c_personalizado = ?,
      fator_b2c_lote = ?, fator_b2b_piloto = ?, fator_b2b_recorrente = ?, pedido_minimo_b2b = ?
      WHERE id = ?`).run(
      text(cfg['Nome do negócio']), number(cfg['Saldo inicial de caixa']), number(cfg['Potência média da impressora (W)']),
      number(cfg['Tarifa de energia (R$/kWh)']), number(cfg['Margem para perdas padrão']), number(cfg['Taxa de venda padrão']),
      number(cfg['Valor da sua hora']), number(cfg['Reserva da máquina (R$/h)']), number(cfg['Fator B2C personalizado']),
      number(cfg['Fator B2C lote']), number(cfg['Fator B2B piloto']), number(cfg['Fator B2B recorrente']), number(cfg['Pedido mínimo B2B']), tenantId,
    )
    for (const row of parsed.configRows) archive.run(importacaoId, 'Configurações', row.rowNumber, text(row.data.Parâmetro), 'Configuracao', tenantId, rawJson(row))

    const insertClient = db.prepare(`INSERT INTO clientes (
      tenant_id, usuario_id, codigo_externo, nome, tipo_cliente, telefone, email, instagram,
      cidade, origem, data_cadastro_origem, ultimo_contato, observacoes, criado_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const row of parsed.rows.Clientes) {
      const code = text(row.data['ID do cliente'])
      const contact = splitContact(row.data['Instagram / e-mail'])
      const created = excelDate(row.data['Data de cadastro'])
      const lastContact = excelDate(row.data['Último contato'])
      const timestamp = created ? `${created}T12:00:00Z` : new Date().toISOString()
      const inserted = insertClient.run(
        tenantId, usuarioId, code, text(row.data['Nome / empresa']), text(row.data.Tipo), text(row.data.WhatsApp),
        contact.email, contact.instagram, text(row.data.Cidade), mapOrigin(row.data.Origem), created, lastContact,
        text(row.data.Observações), timestamp, timestamp,
      )
      const id = Number(inserted.lastInsertRowid)
      clientMap.set(code, id)
      archive.run(importacaoId, 'Clientes', row.rowNumber, code, 'Cliente', id, rawJson(row))
      result.clientes += 1
    }

    const groups = new Map()
    for (const row of parsed.rows.Estoque) {
      const key = [row.data.Marca, row.data.Material, row.data.Cor].map(normalize).join('|')
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }
    const insertFilament = db.prepare(`INSERT INTO filamentos (
      tenant_id, usuario_id, material, cor, marca, fornecedor, peso_rolo_gramas,
      preco_rolo, estoque_gramas, estoque_minimo_gramas
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    const insertLot = db.prepare(`INSERT INTO lotes_filamento (
      tenant_id, filamento_id, codigo, peso_inicial_gramas, saldo_gramas,
      preco_compra, aberto_em, fornecedor, comprado_em, status_origem, observacoes, ativo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertMovement = db.prepare(`INSERT INTO movimentos_estoque (
      tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id, pedido_id,
      tipo, quantidade, saldo_anterior, saldo_posterior, motivo, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const groupRows of groups.values()) {
      const first = groupRows[0].data
      const initialTotal = groupRows.reduce((total, row) => total + number(row.data['Peso inicial (g)']), 0)
      const costTotal = groupRows.reduce((total, row) => total + number(row.data['Custo do rolo']), 0)
      const filamentInsert = insertFilament.run(
        tenantId, usuarioId, text(first.Material), text(first.Cor), text(first.Marca), text(first.Fornecedor),
        number(first['Peso inicial (g)']), round(costTotal / groupRows.length, 2), round(initialTotal * 0.2, 2),
      )
      const filamentId = Number(filamentInsert.lastInsertRowid)
      result.produtosFilamento += 1
      for (const row of groupRows) {
        const code = text(row.data['ID do filamento'])
        const initial = number(row.data['Peso inicial (g)'])
        const purchased = excelDate(row.data['Data da compra'])
        const lotInsert = insertLot.run(
          tenantId, filamentId, code, initial, initial, number(row.data['Custo do rolo']), purchased,
          text(row.data.Fornecedor), purchased, text(row.data.Status), text(row.data.Observações),
          normalize(row.data.Status) === 'acabou' ? 0 : 1,
        )
        const lotId = Number(lotInsert.lastInsertRowid)
        lotMap.set(code, { id: lotId, filamentId, source: row, unitCost: initial > 0 ? number(row.data['Custo do rolo']) / initial : 0 })
        lotBalances.set(code, initial)
        insertMovement.run(tenantId, usuarioId, 'Filamento', filamentId, lotId, null, 'Entrada', initial, 0, initial, `Importação ${code}: estoque inicial`, purchased ? `${purchased}T12:00:00Z` : new Date().toISOString())
        archive.run(importacaoId, 'Estoque', row.rowNumber, code, 'LoteFilamento', lotId, rawJson(row))
        result.lotesFilamento += 1
      }
    }

    const insertMaterial = db.prepare(`INSERT INTO insumos (
      tenant_id, usuario_id, codigo_externo, nome, categoria, unidade, custo_unitario,
      estoque_atual, estoque_minimo, quantidade_inicial, valor_total_pago, comprado_em,
      status_origem, fornecedor, observacoes_origem, ativo, criado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const row of parsed.rows.Materiais) {
      const code = text(row.data['ID do material'])
      const initial = number(row.data['Quantidade inicial'])
      const balance = number(row.data['Saldo estimado'])
      const purchased = excelDate(row.data['Data da compra'])
      const insert = insertMaterial.run(
        tenantId, usuarioId, code, text(row.data['Material / insumo']), text(row.data.Categoria), mapUnit(row.data['Unidade de controle']),
        number(row.data['Custo por unidade']), balance, round(initial * 0.2), initial, number(row.data['Valor total pago']),
        purchased, text(row.data.Status), text(row.data.Fornecedor), text(row.data['Link / observações']),
        normalize(row.data.Status) === 'acabou' ? 0 : 1, purchased ? `${purchased}T12:00:00Z` : new Date().toISOString(),
      )
      const id = Number(insert.lastInsertRowid)
      materialMap.set(code, { id, source: row, unitCost: number(row.data['Custo por unidade']) })
      materialBalances.set(code, initial)
      insertMovement.run(tenantId, usuarioId, 'Insumo', id, null, null, 'Entrada', initial, 0, initial, `Importação ${code}: estoque inicial`, purchased ? `${purchased}T12:00:00Z` : new Date().toISOString())
      archive.run(importacaoId, 'Materiais', row.rowNumber, code, 'Insumo', id, rawJson(row))
      result.insumos += 1
    }

    const tenantConfig = db.prepare(`SELECT tarifa_energia_kwh, potencia_impressora_w FROM tenants WHERE id = ?`).get(tenantId)
    const insertOrder = db.prepare(`INSERT INTO pedidos (
      tenant_id, usuario_id, cliente_id, codigo_externo, numero_orcamento, nome_da_peca,
      descricao, tempo_impressao_horas, tempo_impressao_informado, custo_filamento,
      custo_insumos, custo_energia, valor_reserva_maquina, taxa_operacional,
      custo_embalagem, desconto, frete_cobrado, frete_pago, custo_extra_real,
      valor_total_cobrado, data_entrega, status, status_origem, orcamento_status,
      data_pedido, data_conclusao, vencimento_em, parcelas, tipo_venda,
      categoria_origem, quantidade, preco_unitario, canal, taxas_comissoes,
      custo_total_origem, lucro_estimado_origem, margem_origem,
      situacao_financeira_origem, observacoes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertOrderFilament = db.prepare(`INSERT INTO pedido_filamentos (
      pedido_id, filamento_id, lote_filamento_id, peso_gasto_gramas,
      consumo_real_gramas, custo_calculado
    ) VALUES (?, ?, ?, ?, ?, ?)`)
    const insertOrderMaterial = db.prepare(`INSERT INTO pedido_insumos (
      pedido_id, insumo_id, quantidade, consumo_real, custo_unitario_snap, custo_calculado
    ) VALUES (?, ?, ?, ?, ?, ?)`)
    const insertInstallment = db.prepare(`INSERT INTO parcelas_receber
      (tenant_id, pedido_id, numero, valor, vencimento_em) VALUES (?, ?, 1, ?, ?)`)
    const insertHistory = db.prepare(`INSERT INTO historico_pedidos
      (tenant_id, pedido_id, usuario_id, evento, descricao, criado_em)
      VALUES (?, ?, ?, 'IMPORTAR', 'Pedido importado da planilha', ?)`)

    for (const row of parsed.rows.Vendas) {
      const code = text(row.data['ID da venda'])
      const clientId = clientMap.get(text(row.data['ID do cliente']))
      const ordered = excelDate(row.data['Data do pedido'])
      const delivered = excelDate(row.data['Data de entrega'])
      const hours = number(row.data['Horas de impressão'])
      const hasHours = hours > 0
      const state = mapearStatusPedido(row.data.Status)
      const energy = round(hours * number(tenantConfig.potencia_impressora_w) / 1000 * number(tenantConfig.tarifa_energia_kwh), 4)
      const conclusion = state.status === 'Finalizado' ? (delivered ?? ordered) : null
      const orderInsert = insertOrder.run(
        tenantId, usuarioId, clientId, code, code, text(row.data['Produto / serviço']), null,
        hasHours ? hours : 0.000001, hasHours ? 1 : 0, number(row.data['Custo do material']),
        number(row.data['Custo de materiais / insumos']), energy, 0, number(row.data.Embalagem),
        number(row.data['Desconto total']), number(row.data['Frete cobrado']), number(row.data['Frete pago']),
        number(row.data['Custos adicionais']), number(row.data['Receita total']), delivered, state.status,
        text(row.data.Status), state.quote, ordered, conclusion, ordered, text(row.data['Tipo de venda']),
        text(row.data.Categoria), Math.max(number(row.data.Quantidade), 1), number(row.data['Preço unitário']),
        text(row.data.Canal), number(row.data['Taxas / comissões']), number(row.data['Custo completo total']),
        number(row.data['Lucro estimado']), number(row.data.Margem), text(row.data['Situação financeira']), text(row.data.Observações),
      )
      const orderId = Number(orderInsert.lastInsertRowid)
      orderMap.set(code, orderId)
      insertHistory.run(tenantId, orderId, usuarioId, `${ordered}T12:00:00Z`)

      for (const [idField, quantityField] of FILAMENT_FIELDS) {
        const lotCode = text(row.data[idField])
        const quantity = number(row.data[quantityField])
        if (!lotCode || !(quantity > 0)) continue
        const lot = lotMap.get(lotCode)
        const cost = round(quantity * lot.unitCost, 4)
        insertOrderFilament.run(orderId, lot.filamentId, lot.id, quantity, quantity, cost)
        const before = lotBalances.get(lotCode)
        const after = round(before - quantity)
        if (after < -0.01) throw new Error(`O consumo do lote ${lotCode} excede o peso inicial.`)
        insertMovement.run(tenantId, usuarioId, 'Filamento', lot.filamentId, lot.id, orderId, 'Saida', quantity, before, Math.max(0, after), `Consumo importado do pedido ${code}`, `${ordered}T12:00:00Z`)
        lotBalances.set(lotCode, Math.max(0, after))
      }
      for (const [idField, quantityField] of MATERIAL_FIELDS) {
        const materialCode = text(row.data[idField])
        const quantity = number(row.data[quantityField])
        if (!materialCode || !(quantity > 0)) continue
        const material = materialMap.get(materialCode)
        insertOrderMaterial.run(orderId, material.id, quantity, quantity, material.unitCost, round(quantity * material.unitCost, 4))
        const before = materialBalances.get(materialCode)
        const after = round(before - quantity)
        if (after < -0.01) throw new Error(`O consumo do material ${materialCode} excede a quantidade inicial.`)
        insertMovement.run(tenantId, usuarioId, 'Insumo', material.id, null, orderId, 'Saida', quantity, before, Math.max(0, after), `Consumo importado do pedido ${code}`, `${ordered}T12:00:00Z`)
        materialBalances.set(materialCode, Math.max(0, after))
      }
      if (state.quote === 'Aprovado' && state.status !== 'Cancelado') {
        insertInstallment.run(tenantId, orderId, number(row.data['Receita total']), ordered)
      }
      archive.run(importacaoId, 'Vendas', row.rowNumber, code, 'Pedido', orderId, rawJson(row))
      result.pedidos += 1
    }

    for (const [lotCode, lot] of lotMap) {
      const current = lotBalances.get(lotCode)
      const target = number(lot.source.data['Saldo estimado (g)'])
      const delta = round(target - current)
      if (Math.abs(delta) > 0.01) {
        insertMovement.run(
          tenantId, usuarioId, 'Filamento', lot.filamentId, lot.id, null, 'Ajuste', Math.abs(delta),
          current, target, `Importação ${lotCode}: reconciliação com saldo da planilha`, new Date().toISOString(),
        )
        result.ajustesEstoque += 1
      }
      db.prepare('UPDATE lotes_filamento SET saldo_gramas = ? WHERE id = ?').run(target, lot.id)
    }
    db.prepare(`UPDATE filamentos SET estoque_gramas = (
      SELECT COALESCE(SUM(saldo_gramas), 0) FROM lotes_filamento
      WHERE filamento_id = filamentos.id AND ativo = 1
    ) WHERE tenant_id = ?`).run(tenantId)

    for (const [materialCode, material] of materialMap) {
      const current = materialBalances.get(materialCode)
      const target = number(material.source.data['Saldo estimado'])
      const delta = round(target - current)
      if (Math.abs(delta) > 0.01) {
        insertMovement.run(
          tenantId, usuarioId, 'Insumo', material.id, null, null, 'Ajuste', Math.abs(delta),
          current, target, `Importação ${materialCode}: reconciliação com saldo da planilha`, new Date().toISOString(),
        )
        result.ajustesEstoque += 1
      }
      db.prepare('UPDATE insumos SET estoque_atual = ? WHERE id = ?').run(target, material.id)
    }

    const insertReceipt = db.prepare(`INSERT INTO recebimentos
      (tenant_id, pedido_id, codigo_externo, valor, forma_pagamento, data_recebimento, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    const insertAllocation = db.prepare(`INSERT INTO recebimento_alocacoes
      (recebimento_id, parcela_id, valor) VALUES (?, ?, ?)`)
    for (const row of parsed.rows.Recebimentos) {
      const code = text(row.data['ID do recebimento'])
      const orderId = orderMap.get(text(row.data['ID da venda']))
      const receiptInsert = insertReceipt.run(tenantId, orderId, code, number(row.data.Valor), mapPayment(row.data['Forma de pagamento']), excelDate(row.data.Data), text(row.data.Observações))
      const receiptId = Number(receiptInsert.lastInsertRowid)
      const installment = db.prepare(`SELECT pr.id, pr.valor,
        COALESCE((SELECT SUM(ra.valor) FROM recebimento_alocacoes ra WHERE ra.parcela_id = pr.id), 0) AS alocado
        FROM parcelas_receber pr WHERE pr.pedido_id = ? AND pr.numero = 1`).get(orderId)
      if (installment) {
        const allocatable = Math.min(number(row.data.Valor), Math.max(0, number(installment.valor) - number(installment.alocado)))
        if (allocatable > 0) insertAllocation.run(receiptId, installment.id, round(allocatable, 2))
      }
      archive.run(importacaoId, 'Recebimentos', row.rowNumber, code, 'Recebimento', receiptId, rawJson(row))
      result.recebimentos += 1
    }

    const insertExpense = db.prepare(`INSERT INTO despesas (
      tenant_id, usuario_id, codigo_externo, categoria, descricao, fornecedor,
      tipo_origem, forma_pagamento_origem, status_origem, valor, data_despesa,
      competencia_em, vencimento_em, pago_em, pedido_id, observacoes_origem
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insertCapital = db.prepare(`INSERT INTO fluxo_capital (
      tenant_id, usuario_id, codigo_externo, tipo, valor, descricao, data_movimentacao,
      afeta_caixa, forma_origem_destino, observacoes, pedido_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const row of parsed.rows.Gastos) {
      const code = text(row.data['ID do gasto'])
      const orderId = orderMap.get(text(row.data['ID da venda relacionada'])) ?? null
      const purchaseDate = excelDate(row.data['Data da compra'])
      if (isOwnerWithdrawal(row)) {
        const inserted = insertCapital.run(tenantId, usuarioId, code, 'Retirada', number(row.data.Valor), text(row.data['Descrição']), excelDate(row.data['Data do pagamento']) ?? purchaseDate, 1, text(row.data['Forma de pagamento']), text(row.data.Observações), orderId)
        const id = Number(inserted.lastInsertRowid)
        archive.run(importacaoId, 'Gastos', row.rowNumber, code, 'FluxoCapital', id, rawJson(row))
        result.retiradas += 1
      } else {
        const inserted = insertExpense.run(
          tenantId, usuarioId, code, mapExpenseCategory(row.data.Categoria), text(row.data['Descrição']), text(row.data.Fornecedor),
          text(row.data.Tipo), text(row.data['Forma de pagamento']), text(row.data.Status), number(row.data.Valor), purchaseDate,
          purchaseDate, excelDate(row.data.Vencimento) ?? purchaseDate,
          normalize(row.data.Status) === 'pago' ? (excelDate(row.data['Data do pagamento']) ?? purchaseDate) : null,
          orderId, text(row.data.Observações),
        )
        const id = Number(inserted.lastInsertRowid)
        archive.run(importacaoId, 'Gastos', row.rowNumber, code, 'Despesa', id, rawJson(row))
        result.despesas += 1
      }
    }
    for (const row of parsed.rows['Aportes e retiradas']) {
      const code = text(row.data['ID da movimentação'])
      const type = normalize(row.data.Tipo) === 'retirada' ? 'Retirada' : 'Aporte'
      const inserted = insertCapital.run(
        tenantId, usuarioId, code, type, number(row.data.Valor), text(row.data.Descrição), excelDate(row.data.Data),
        normalize(row.data['Afeta caixa?']) === 'nao' ? 0 : 1, text(row.data['Forma / origem-destino']), text(row.data.Observações), null,
      )
      const id = Number(inserted.lastInsertRowid)
      archive.run(importacaoId, 'Aportes e retiradas', row.rowNumber, code, 'FluxoCapital', id, rawJson(row))
      result.movimentosCapital += 1
    }

    const finalReport = { ...parsed.report, importado: result, baseAntes: existing }
    db.prepare(`UPDATE importacoes_planilha
      SET status = 'Concluida', relatorio_json = ?, concluido_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?`).run(JSON.stringify(finalReport), importacaoId)
    db.prepare(`INSERT INTO auditoria
      (tenant_id, usuario_id, entidade, entidade_id, acao, descricao, dados_json)
      VALUES (?, ?, 'ImportacaoPlanilha', ?, 'IMPORTAR', ?, ?)`)
      .run(tenantId, usuarioId, importacaoId, `Importação concluída: ${parsed.report.arquivo.nome}`, JSON.stringify(result))
    return finalReport
  })

  return execute.immediate()
}
