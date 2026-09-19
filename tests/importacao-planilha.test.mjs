import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { applyMigrations } from '../lib/migrations.mjs'
import { analisarPlanilha, DATA_HEADERS, importarPlanilha, mapearStatusPedido, REQUIRED_SHEETS } from '../lib/importacao-planilha.mjs'

function addDataRow(sheet, headers, data) {
  sheet.getRow(5).values = headers
  sheet.getRow(6).values = headers.map((header) => data[header] ?? null)
}

async function workbookFixture() {
  const workbook = new ExcelJS.Workbook()
  for (const name of REQUIRED_SHEETS) workbook.addWorksheet(name)

  addDataRow(workbook.getWorksheet('Clientes'), DATA_HEADERS.Clientes, {
    'ID do cliente': 'CLI-001', 'Nome / empresa': 'Cliente teste', Tipo: 'Pessoa física',
    WhatsApp: '34999999999', Origem: 'WhatsApp', 'Data de cadastro': new Date('2026-09-01T12:00:00Z'),
  })
  addDataRow(workbook.getWorksheet('Estoque'), DATA_HEADERS.Estoque, {
    'ID do filamento': 'FIL-001', Marca: 'Marca', Material: 'PLA', Cor: 'Branco',
    'Peso inicial (g)': 100, 'Material usado (g)': 10, 'Saldo estimado (g)': 90,
    'Custo do rolo': 10, 'Custo por kg': 100, Status: 'Disponível',
  })
  addDataRow(workbook.getWorksheet('Materiais'), DATA_HEADERS.Materiais, {
    'ID do material': 'MAT-001', 'Material / insumo': 'Argola', Categoria: 'Ferragem',
    'Unidade de controle': 'unid.', 'Quantidade inicial': 10, 'Quantidade usada': 2,
    'Saldo estimado': 8, 'Valor total pago': 5, 'Custo por unidade': 0.5, Status: 'Disponível',
  })
  addDataRow(workbook.getWorksheet('Vendas'), DATA_HEADERS.Vendas, {
    'ID da venda': 'VEN-001', 'Data do pedido': new Date('2026-09-02T12:00:00Z'),
    Status: 'Entregue', 'ID do cliente': 'CLI-001', Cliente: 'Cliente teste',
    'Tipo de venda': 'B2C', 'Produto / serviço': 'Peça', Categoria: 'Outro', Quantidade: 1,
    'Preço unitário': 20, 'Receita total': 20, 'ID do filamento': 'FIL-001',
    'Material usado (g)': 5, 'Custo do material': 0.5, 'Horas de impressão': 1,
    'Custo de energia': 0.1, 'Custo completo total': 2, 'Lucro estimado': 18,
    Margem: 0.9, 'Valor recebido': 20, 'Saldo a receber': 0,
    'Situação financeira': 'Recebido', Canal: 'WhatsApp', 'ID material 1': 'MAT-001',
    'Qtd. material 1': 1, 'Custo de materiais / insumos': 0.5,
  })
  addDataRow(workbook.getWorksheet('Recebimentos'), DATA_HEADERS.Recebimentos, {
    'ID do recebimento': 'REC-001', Data: new Date('2026-09-02T12:00:00Z'),
    'ID da venda': 'VEN-001', Cliente: 'Cliente teste', 'Forma de pagamento': 'Pix', Valor: 20,
  })
  const expenses = workbook.getWorksheet('Gastos')
  expenses.getRow(5).values = DATA_HEADERS.Gastos
  expenses.getRow(6).values = DATA_HEADERS.Gastos.map((header) => ({
    'ID do gasto': 'GAS-001', 'Data da compra': new Date('2026-09-02T12:00:00Z'),
    'Data do pagamento': new Date('2026-09-02T12:00:00Z'), Status: 'Pago', Categoria: 'Embalagem',
    Descrição: 'Embalagens', Fornecedor: 'Fornecedor', Tipo: 'Variável', 'Forma de pagamento': 'Pix', Valor: 5,
  })[header] ?? null)
  expenses.getRow(7).values = DATA_HEADERS.Gastos.map((header) => ({
    'ID do gasto': 'GAS-002', 'Data da compra': new Date('2026-09-03T12:00:00Z'),
    'Data do pagamento': new Date('2026-09-03T12:00:00Z'), Status: 'Pago', Categoria: 'Outros',
    Descrição: 'Retirada do proprietário', Fornecedor: 'Sócio', Tipo: 'Variável',
    'Forma de pagamento': 'Transferência', Valor: 2,
  })[header] ?? null)
  addDataRow(workbook.getWorksheet('Aportes e retiradas'), DATA_HEADERS['Aportes e retiradas'], {
    'ID da movimentação': 'MOV-001', Data: new Date('2026-09-01T12:00:00Z'), Tipo: 'Aporte',
    Descrição: 'Capital inicial', Valor: 10, 'Afeta caixa?': 'Sim', 'Forma / origem-destino': 'Pix',
  })

  const config = workbook.getWorksheet('Configurações')
  const values = [
    ['Nome do negócio', 'Salge 3D'], ['Saldo inicial de caixa', 0],
    ['Potência média da impressora (W)', 100], ['Tarifa de energia (R$/kWh)', 1],
    ['Fator B2C personalizado', 2], ['Fator B2B recorrente', 1.5],
    ['Margem para perdas padrão', 0.1], ['Taxa de venda padrão', 0],
    ['Valor da sua hora', 25], ['Reserva da máquina (R$/h)', 2.5],
    ['Fator B2C lote', 1.7], ['Fator B2B piloto', 1.8], ['Pedido mínimo B2B', 80],
  ]
  values.forEach(([parameter, value], index) => { config.getCell(index + 5, 1).value = parameter; config.getCell(index + 5, 2).value = value })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

test('valida e importa a planilha de forma atômica, reconciliando saldos', async () => {
  const buffer = await workbookFixture()
  const parsed = await analisarPlanilha(buffer, { nomeArquivo: 'fixture.xlsx' })
  assert.equal(parsed.report.valido, true, parsed.report.erros.join('\n'))
  assert.equal(parsed.report.contagens.pedidos, 1)
  assert.equal(parsed.report.contagens.despesas, 1)
  assert.equal(parsed.report.contagens.retiradasReclassificadas, 1)

  const db = new Database(':memory:')
  try {
    const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
      .split('\n').filter((line) => !line.trim().toUpperCase().startsWith('PRAGMA')).join('\n')
    db.exec(schema)
    applyMigrations(db)
    const staged = db.prepare(`INSERT INTO importacoes_planilha
      (tenant_id, usuario_id, nome_arquivo, sha256, arquivo_original, relatorio_json)
      VALUES (1, 1, ?, ?, ?, ?)`)
      .run('fixture.xlsx', parsed.report.arquivo.sha256, buffer, JSON.stringify(parsed.report))
    const report = importarPlanilha(db, parsed, { importacaoId: Number(staged.lastInsertRowid) })

    assert.equal(report.importado.pedidos, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM pedidos').get().total, 1)
    assert.equal(db.prepare('SELECT saldo_gramas FROM lotes_filamento WHERE codigo = ?').get('FIL-001').saldo_gramas, 90)
    assert.equal(db.prepare('SELECT estoque_atual FROM insumos WHERE codigo_externo = ?').get('MAT-001').estoque_atual, 8)
    assert.equal(db.prepare('SELECT SUM(valor) AS total FROM despesas').get().total, 5)
    assert.equal(db.prepare(`SELECT SUM(valor) AS total FROM fluxo_capital WHERE tipo = 'Retirada'`).get().total, 2)
    assert.equal(db.prepare(`SELECT SUM(valor) AS total FROM fluxo_capital WHERE tipo = 'Aporte'`).get().total, 10)
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally {
    db.close()
  }
})

test('considera aguardando pagamento como produção já finalizada', () => {
  assert.deepEqual(mapearStatusPedido('Aguardando pagamento'), {
    status: 'Finalizado',
    quote: 'Aprovado',
  })
})
