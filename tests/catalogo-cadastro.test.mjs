import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { gerarCodigoProduto, verificarNomeProduto, mensagemConflitoProduto } from '../lib/catalogo-cadastro.mjs'

function banco(t) {
  const db = new Database(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE produtos_catalogo (
    id INTEGER PRIMARY KEY, tenant_id INTEGER, codigo TEXT, nome_chave TEXT,
    ativo INTEGER DEFAULT 1 CHECK(ativo IN (0,1)),
    UNIQUE(tenant_id,codigo), UNIQUE(tenant_id,nome_chave))`)
  return db
}
function inserir(db, tenant, codigo, nome, ativo = 1) {
  db.prepare('INSERT INTO produtos_catalogo (tenant_id,codigo,nome_chave,ativo) VALUES (?,?,?,?)').run(tenant,codigo,nome,ativo)
}

test('reproduz colisão histórica com MAX(id)+1 e cadastra dois nomes novos', t => {
  const db = banco(t)
  inserir(db, 1, 'PRD-000003', 'histórico')
  inserir(db, 1, 'PRD-000099', 'outro', 0)
  const antigo = db.prepare('SELECT MAX(id)+1 AS n FROM produtos_catalogo WHERE tenant_id=1').get().n
  assert.throws(() => inserir(db, 1, `PRD-${String(antigo).padStart(6,'0')}`, 'mini jesus'), /codigo/)
  db.transaction(() => {
    for (const nome of ['mini jesus', 'jesus']) {
      verificarNomeProduto(db, 1, nome, null)
      inserir(db, 1, gerarCodigoProduto(db, 1), nome)
    }
  }).immediate()
  assert.deepEqual(db.prepare('SELECT codigo FROM produtos_catalogo ORDER BY id').all().map(p=>p.codigo), ['PRD-000003','PRD-000099','PRD-000001','PRD-000002'])
})

test('reserva códigos arquivados, isola empresas e exige transação', t => {
  const db = banco(t)
  inserir(db,1,'PRD-000001','arquivado',0)
  inserir(db,2,'PRD-000002','outro')
  assert.throws(() => gerarCodigoProduto(db,1), /transação/)
  db.transaction(() => assert.equal(gerarCodigoProduto(db,1),'PRD-000002')).immediate()
})

test('distingue nomes ativos e arquivados; edição própria e outra empresa são permitidas', t => {
  const db = banco(t)
  inserir(db,1,'PRD-000010','jesus',0)
  inserir(db,1,'PRD-000011','mini jesus')
  assert.throws(() => verificarNomeProduto(db,1,'jesus',null), e => /reativação.*histórico/.test(mensagemConflitoProduto(e)))
  assert.throws(() => verificarNomeProduto(db,1,'mini jesus',null), e => /ativo/.test(mensagemConflitoProduto(e)))
  verificarNomeProduto(db,1,'mini jesus',2)
  verificarNomeProduto(db,2,'jesus',null)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM produtos_catalogo').get().n,2)
})

test('classifica restrições reais sem confundir código, nome e outras tabelas', t => {
  const db = banco(t)
  inserir(db,1,'PRD-000001','jesus')
  const conflito = (fn, esperado) => assert.throws(fn, e => esperado.test(mensagemConflitoProduto(e)))
  conflito(() => inserir(db,1,'PRD-000001','novo'), /código/)
  conflito(() => inserir(db,1,'PRD-000002','jesus'), /nome/)
  conflito(() => inserir(db,1,'PRD-000002','novo',2), /integridade/)
  db.exec('CREATE TABLE produto_versoes (produto_id INTEGER, versao INTEGER, UNIQUE(produto_id,versao)); INSERT INTO produto_versoes VALUES(1,1)')
  conflito(() => db.exec('INSERT INTO produto_versoes VALUES(1,1)'), /unicidade/)
  assert.equal(mensagemConflitoProduto(new Error('outro')), null)
})

test('falha posterior reverte cadastro inteiro', t => {
  const db = banco(t)
  assert.throws(() => db.transaction(() => {
    inserir(db,1,gerarCodigoProduto(db,1),'jesus')
    throw new Error('falha da ficha')
  }).immediate(), /falha da ficha/)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM produtos_catalogo').get().n,0)
})
