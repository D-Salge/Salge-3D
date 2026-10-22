import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import Database from 'better-sqlite3'
import { aplicarMigracoesComBackup } from '../lib/migracao-segura.mjs'
import { applyMigrations, migrations } from '../lib/migrations.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schema = readFileSync(path.join(raiz, 'database', 'schema.sql'), 'utf8')
  .split('\n').filter((linha) => !linha.trim().toUpperCase().startsWith('PRAGMA')).join('\n')

function temporario(t) {
  const pasta = mkdtempSync(path.join(tmpdir(), 'salge-migracao-'))
  t.after(() => rmSync(pasta, { recursive: true, force: true }))
  const diretorioBanco = path.join(pasta, 'dados')
  mkdirSync(diretorioBanco)
  return { pasta, caminhoBanco: path.join(diretorioBanco, 'personalizado.sqlite') }
}

function abrirBanco(caminho) {
  const db = new Database(caminho)
  db.pragma('journal_mode = WAL')
  db.pragma('wal_autocheckpoint = 0')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 30000')
  return db
}

function criarBancoAntigo(caminho) {
  const db = abrirBanco(caminho)
  db.exec(schema)
  applyMigrations(db)
  db.exec(`
    DROP TRIGGER trg_ordens_producao_estoque_atualizado_em;
    DROP TABLE movimentos_produtos_acabados;
    DROP TABLE reservas_produtos_acabados;
    DROP TABLE lotes_produtos_acabados;
    DROP TABLE ordem_producao_estoque_insumos;
    DROP TABLE ordem_producao_estoque_filamentos;
    DROP INDEX idx_movimentos_estoque_ordem_interna;
    ALTER TABLE movimentos_estoque DROP COLUMN ordem_producao_estoque_id;
    DROP TABLE ordens_producao_estoque;
    ALTER TABLE pedidos DROP COLUMN custo_produto_acabado_real;
    ALTER TABLE pedidos DROP COLUMN custo_produto_acabado_estimado;
    ALTER TABLE pedidos DROP COLUMN atendimento_tipo;
    DROP TABLE extrato_conciliacoes;
    DROP INDEX idx_entregas_operacao;
    ALTER TABLE entregas_pedido DROP COLUMN operacao_id;
    DROP TABLE pedido_plate_filamentos;
    DROP TABLE pedido_plates;
    ALTER TABLE pedidos DROP COLUMN plates_dimensionamento;
    ALTER TABLE pedidos DROP COLUMN modo_calculo;
    DELETE FROM schema_migrations WHERE version >= 28;
    CREATE TABLE dados_anteriores (id INTEGER PRIMARY KEY, valor TEXT NOT NULL);
    INSERT INTO dados_anteriores (valor) VALUES ('registro ainda no WAL');
  `)
  return db
}

function existeTabela(db, nome) {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nome))
}

function executarProcesso(script, argumentos, ambiente = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [script, ...argumentos], {
      cwd: raiz,
      env: { ...process.env, ...ambiente },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    filho.stdout.on('data', (dados) => { stdout += dados })
    filho.stderr.on('data', (dados) => { stderr += dados })
    filho.on('error', reject)
    filho.on('close', (codigo) => resolve({ codigo, stdout, stderr }))
  })
}

test('cria e valida backup pré-migração com dados ainda presentes no WAL', (t) => {
  const { pasta, caminhoBanco } = temporario(t)
  const escritor = criarBancoAntigo(caminhoBanco)
  assert.ok(existsSync(`${caminhoBanco}-wal`))

  const migrador = abrirBanco(caminhoBanco)
  try {
    const resultado = aplicarMigracoesComBackup(migrador, { caminhoBanco })
    assert.equal(resultado.aplicadas, migrations.length - 27)
    assert.ok(resultado.backup?.startsWith(path.join(pasta, 'dados', 'backups')))
    assert.ok(existsSync(resultado.backup))
    assert.equal(existeTabela(migrador, 'extrato_conciliacoes'), true)
    assert.equal(existeTabela(migrador, 'pedido_plates'), true)
    assert.ok(migrador.prepare(`PRAGMA table_info(pedidos)`).all().some((coluna) => coluna.name === 'modo_calculo'))
    assert.ok(migrador.prepare(`PRAGMA table_info(pedidos)`).all().some((coluna) => coluna.name === 'plates_dimensionamento'))
    assert.equal(migrador.prepare('SELECT valor FROM dados_anteriores').get().valor, 'registro ainda no WAL')

    const backup = new Database(resultado.backup, { readonly: true, fileMustExist: true })
    try {
      assert.equal(backup.pragma('integrity_check', { simple: true }), 'ok')
      assert.equal(existeTabela(backup, 'extrato_conciliacoes'), false)
      assert.equal(existeTabela(backup, 'pedido_plates'), false)
      assert.equal(backup.prepare(`PRAGMA table_info(pedidos)`).all().some((coluna) => coluna.name === 'modo_calculo'), false)
      assert.equal(backup.prepare(`PRAGMA table_info(pedidos)`).all().some((coluna) => coluna.name === 'plates_dimensionamento'), false)
      assert.equal(backup.prepare('SELECT valor FROM dados_anteriores').get().valor, 'registro ainda no WAL')
      assert.equal(backup.prepare('SELECT MAX(version) AS versao FROM schema_migrations').get().versao, 27)
    } finally {
      backup.close()
    }
  } finally {
    migrador.close()
    escritor.close()
  }
})

test('falha do backup impede qualquer alteração de esquema ou dados', (t) => {
  const { pasta, caminhoBanco } = temporario(t)
  const db = criarBancoAntigo(caminhoBanco)
  try {
    const estadoAnterior = db.prepare(`SELECT type, name, sql FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all()
    assert.throws(() => aplicarMigracoesComBackup(db, {
      caminhoBanco,
      criarBackup({ caminhoTemporario }) {
        writeFileSync(caminhoTemporario, 'backup incompleto')
        throw new Error('FALHA_FORCADA_BACKUP')
      },
    }), /FALHA_FORCADA_BACKUP/)
    assert.deepEqual(db.prepare(`SELECT type, name, sql FROM sqlite_master
      WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`).all(), estadoAnterior)
    assert.equal(db.prepare('SELECT valor FROM dados_anteriores').get().valor, 'registro ainda no WAL')
    assert.equal(db.prepare('SELECT 1 FROM schema_migrations WHERE version = 28').get(), undefined)
    assert.equal(existeTabela(db, 'extrato_conciliacoes'), false)
    assert.deepEqual(readdirSync(path.join(pasta, 'dados', 'backups')), [])
  } finally {
    db.close()
  }
})

test('banco atualizado não cria backup desnecessário', (t) => {
  const { pasta, caminhoBanco } = temporario(t)
  const db = abrirBanco(caminhoBanco)
  try {
    db.exec(schema)
    applyMigrations(db)
    const resultado = aplicarMigracoesComBackup(db, { caminhoBanco })
    assert.deepEqual(resultado, { aplicadas: 0, backup: null })
    assert.equal(existsSync(path.join(pasta, 'dados', 'backups')), false)
  } finally {
    db.close()
  }
})

test('inicialização de banco novo personalizado não cria nem acessa backup padrão', (t) => {
  const { pasta, caminhoBanco } = temporario(t)
  const pastaPadrao = path.join(raiz, 'database', 'backups')
  const arquivosPadraoAntes = existsSync(pastaPadrao) ? readdirSync(pastaPadrao).sort() : []
  const resultado = spawnSync(process.execPath, ['scripts/init-db.mjs'], {
    cwd: raiz,
    env: { ...process.env, SALGE_DB_PATH: caminhoBanco },
    encoding: 'utf8',
  })
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout)
  assert.ok(existsSync(caminhoBanco))
  assert.equal(existsSync(path.join(pasta, 'dados', 'backups')), false)
  assert.deepEqual(existsSync(pastaPadrao) ? readdirSync(pastaPadrao).sort() : [], arquivosPadraoAntes)
  const db = new Database(caminhoBanco, { readonly: true, fileMustExist: true })
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total, migrations.length)
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  } finally {
    db.close()
  }
})

test('db:migrate respeita SALGE_DB_PATH e grava o backup junto ao banco configurado', (t) => {
  const { pasta, caminhoBanco } = temporario(t)
  criarBancoAntigo(caminhoBanco).close()
  const pastaPadrao = path.join(raiz, 'database', 'backups')
  const estadoPadraoAntes = existsSync(pastaPadrao)
    ? readdirSync(pastaPadrao).map((nome) => [nome, statSync(path.join(pastaPadrao, nome)).size]).sort()
    : []
  const resultado = spawnSync(process.execPath, ['scripts/migrate-db.mjs'], {
    cwd: raiz,
    env: { ...process.env, SALGE_DB_PATH: caminhoBanco },
    encoding: 'utf8',
  })
  assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout)
  assert.ok(resultado.stdout.includes(path.join(pasta, 'dados', 'backups')))
  const backups = readdirSync(path.join(pasta, 'dados', 'backups'))
  assert.equal(backups.length, 1)
  assert.deepEqual(existsSync(pastaPadrao)
    ? readdirSync(pastaPadrao).map((nome) => [nome, statSync(path.join(pastaPadrao, nome)).size]).sort()
    : [], estadoPadraoAntes)
  const db = new Database(caminhoBanco, { readonly: true, fileMustExist: true })
  try {
    assert.equal(existeTabela(db, 'extrato_conciliacoes'), true)
  } finally {
    db.close()
  }
})

test('aberturas concorrentes serializam backup e migração sem estado parcial', async (t) => {
  const { pasta, caminhoBanco } = temporario(t)
  const db = criarBancoAntigo(caminhoBanco)
  db.exec('CREATE TABLE volume_lock AS SELECT randomblob(4000000) AS dados')
  db.close()

  const executor = path.join(raiz, 'tests', 'fixtures', 'executar-migracao-segura.mjs')
  const inicio = String(Date.now() + 300)
  const resultados = await Promise.all([
    executarProcesso(executor, [caminhoBanco, inicio]),
    executarProcesso(executor, [caminhoBanco, inicio]),
    executarProcesso(executor, [caminhoBanco, inicio]),
  ])
  for (const resultado of resultados) assert.equal(resultado.codigo, 0, resultado.stderr || resultado.stdout)

  const backups = readdirSync(path.join(pasta, 'dados', 'backups'))
  assert.equal(backups.length, 1)
  const migrado = new Database(caminhoBanco, { readonly: true, fileMustExist: true })
  try {
    assert.equal(migrado.pragma('integrity_check', { simple: true }), 'ok')
    assert.equal(existeTabela(migrado, 'extrato_conciliacoes'), true)
    assert.equal(migrado.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get().total, migrations.length)
    assert.equal(migrado.prepare('SELECT valor FROM dados_anteriores').get().valor, 'registro ainda no WAL')
  } finally {
    migrado.close()
  }
})
