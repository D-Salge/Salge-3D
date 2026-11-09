import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import Database from 'better-sqlite3'
import { applyMigrations } from '../lib/migrations.mjs'

// Exercise the exact server query against SQLite, including the five-row subquery.
const action = readFileSync(new URL('../app/actions/pedidos.ts', import.meta.url), 'utf8')
  .split('export async function getPedidosKanban()')[1].split('export async function atualizarStatusPedido')[0]
const query = action.match(/`([\s\S]*?)`/)[1]
function fixture(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter(line => !line.trim().toUpperCase().startsWith('PRAGMA')).join('\n'))
  applyMigrations(db)
  const cliente = Number(db.prepare("INSERT INTO clientes (tenant_id, usuario_id, nome) VALUES (1,1,'Cliente')").run().lastInsertRowid)
  const insert = db.prepare(`INSERT INTO pedidos (tenant_id,usuario_id,cliente_id,nome_da_peca,tempo_impressao_horas,valor_total_cobrado,status,orcamento_status,data_pedido,data_conclusao,prioridade_producao,ordem_fila)
    VALUES (?,1,?,'Peça',1,100,?,?,?,?,?,?)`)
  return {
    db,
    add({ tenant = 1, status = 'Finalizado', approval = 'Aprovado', created = '2026-10-01', finished = null, priority = 'Normal', position = null } = {}) {
      return Number(insert.run(tenant, cliente, status, approval, created, finished, priority, position).lastInsertRowid)
    },
    read: () => db.prepare(query).all(1,1),
  }
}
test('Kanban retorna apenas os cinco finalizados mais recentes pela conclusão, sem limitar pedidos ativos', t => {
  const f = fixture(t), done = []
  for (let i = 1; i <= 9; i++) done.push(f.add({ finished: `2026-11-${String(i).padStart(2,'0')}`, priority: i === 1 ? 'Urgente' : 'Normal' }))
  const oldCreated = f.add({ created: '2020-01-01', finished: '2026-11-10' })
  const active = []
  for (const status of ['Fila','Imprimindo','Acabamento']) for (let i = 0; i < 7; i++) active.push(f.add({ status }))
  const rows = f.read()
  assert.deepEqual(rows.filter(p => p.status === 'Finalizado').map(p => p.id), [oldCreated, ...done.slice(-4).reverse()])
  assert.deepEqual(rows.filter(p => p.status !== 'Finalizado').map(p => p.id).sort((a,b)=>a-b), active)
})
test('o limite considera somente finalizados aprovados da empresa e preserva prioridade da fila', t => {
  const f = fixture(t)
  f.db.prepare("INSERT INTO tenants (id,nome) VALUES (2,'Outra empresa')").run()
  const final = f.add({ finished: '2026-11-01' })
  for (let i = 0; i < 8; i++) f.add({ tenant: 2, finished: '2026-12-01' })
  f.add({ approval: 'Rascunho', finished: '2026-12-02' })
  f.add({ status: 'Cancelado', finished: '2026-12-03' })
  const normal = f.add({ status: 'Fila', position: 1 })
  const urgent = f.add({ status: 'Fila', priority: 'Urgente', position: 99 })
  const rows = f.read()
  assert.deepEqual(rows.map(p => p.id), [urgent,normal,final])
})
test('histórico sem data de conclusão usa a data do pedido e desempata por ID; aceita menos de cinco e vazio', t => {
  const f = fixture(t)
  assert.deepEqual(f.read(), [])
  const old = f.add({ created: '2026-10-01' })
  const first = f.add({ created: '2026-11-01', finished: '' })
  const second = f.add({ created: '2026-11-01' })
  assert.deepEqual(f.read().map(p=>p.id),[second,first,old])
})
