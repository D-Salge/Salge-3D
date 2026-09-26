import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations, migrations } from '../lib/migrations.mjs'

test('migra o schema legado uma única vez e preserva os dados', () => {
  const db = new Database(':memory:')
  try {
    const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().toUpperCase().startsWith('PRAGMA'))
      .join('\n')
    db.exec(schema)
    db.prepare(`INSERT INTO clientes (tenant_id, usuario_id, nome) VALUES (1, 1, 'Cliente teste')`).run()
    db.prepare(`
      INSERT INTO filamentos (
        tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas
      ) VALUES (1, 1, 'PLA', 'Preto', 1000, 90, 750)
    `).run()

    applyMigrations(db)
    applyMigrations(db)

    const columns = db.prepare(`PRAGMA table_info(pedidos)`).all().map((column) => column.name)
    assert.ok(columns.includes('orcamento_status'))
    assert.ok(columns.includes('tempo_real_horas'))
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total, migrations.length)
    assert.equal(db.prepare('SELECT nome FROM clientes WHERE nome = ?').get('Cliente teste').nome, 'Cliente teste')
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM impressoras').get().total, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM lotes_filamento').get().total, 1)
    assert.equal(db.prepare('SELECT saldo_gramas FROM lotes_filamento').get().saldo_gramas, 750)
    assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'parcelas_receber'`).get())
    assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'auditoria'`).get())
    assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'importacoes_planilha'`).get())
    assert.ok(columns.includes('codigo_externo'))
    assert.ok(columns.includes('materiais_avulsos_por_unidade'))
    assert.ok(columns.includes('horas_trabalho_ativo'))
    assert.ok(columns.includes('setup_projeto'))
    assert.ok(columns.includes('margem_perdas'))
    const expenseColumns = db.prepare(`PRAGMA table_info(despesas)`).all().map((column) => column.name)
    assert.ok(expenseColumns.includes('grupo_parcelamento'))
    assert.ok(expenseColumns.includes('total_parcelas'))
    assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'modelos_orcamento'`).get())
    const printerColumns = db.prepare(`PRAGMA table_info(impressoras)`).all().map((column) => column.name)
    assert.ok(printerColumns.includes('bico_atual'))
    assert.ok(printerColumns.includes('horas_base'))
    assert.ok(printerColumns.includes('intervalo_manutencao_horas'))
    assert.ok(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'manutencoes_impressora'`).get())
  } finally {
    db.close()
  }
})
