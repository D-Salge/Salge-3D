import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'

test('migra o schema legado uma única vez e preserva os dados', () => {
  const db = new Database(':memory:')
  try {
    const schema = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => !line.trim().toUpperCase().startsWith('PRAGMA'))
      .join('\n')
    db.exec(schema)
    db.prepare(`INSERT INTO clientes (tenant_id, usuario_id, nome) VALUES (1, 1, 'Cliente teste')`).run()

    applyMigrations(db)
    applyMigrations(db)

    const columns = db.prepare(`PRAGMA table_info(pedidos)`).all().map((column) => column.name)
    assert.ok(columns.includes('orcamento_status'))
    assert.ok(columns.includes('tempo_real_horas'))
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total, 1)
    assert.equal(db.prepare('SELECT nome FROM clientes WHERE nome = ?').get('Cliente teste').nome, 'Cliente teste')
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM impressoras').get().total, 2)
  } finally {
    db.close()
  }
})
