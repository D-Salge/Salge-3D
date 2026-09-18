/**
 * scripts/init-db.mjs
 *
 * Script de inicialização do banco de dados SQLite.
 * Lê o schema.sql e executa todas as instruções SQL para criar
 * as tabelas, índices, triggers, views e o seed de MVP.
 *
 * Uso:
 *   npm run db:init           — cria o banco (se não existir)
 *   npm run db:reset          — apaga e recria do zero
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { applyMigrations } from '../lib/migrations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DB_PATH     = join(ROOT, 'database', 'salge3d.sqlite');
const SCHEMA_PATH = join(ROOT, 'database', 'schema.sql');

// ── Argumentos de linha de comando ─────────────────────────────────────────
const args  = process.argv.slice(2);
const reset = args.includes('--reset');

if (reset) {
  const arquivosDoBanco = [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`];
  const removidos = arquivosDoBanco.filter((arquivo) => {
    if (!existsSync(arquivo)) return false;
    unlinkSync(arquivo);
    return true;
  });
  if (removidos.length > 0) console.log('🗑️  Banco anterior removido.');
}

// ── Lê o schema ────────────────────────────────────────────────────────────
if (!existsSync(SCHEMA_PATH)) {
  console.error(`❌ schema.sql não encontrado em: ${SCHEMA_PATH}`);
  process.exit(1);
}

const schema = readFileSync(SCHEMA_PATH, 'utf-8');

// ── Conecta ────────────────────────────────────────────────────────────────
console.log('🔌 Conectando ao banco:', DB_PATH);
const db = new Database(DB_PATH);

try {
  // Aplica PRAGMAs diretamente (sem exec)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // better-sqlite3 suporta exec() com múltiplos statements de uma vez,
  // MAS triggers com BEGIN...END precisam estar num único bloco.
  // A solução mais confiável: passa o schema inteiro de uma vez via exec().
  // Removemos apenas as linhas de PRAGMA (já aplicados acima).
  const schemaWithoutPragmas = schema
    .split('\n')
    .filter(line => !line.trim().toUpperCase().startsWith('PRAGMA'))
    .join('\n');

  db.exec(schemaWithoutPragmas);

  // Atualiza bancos novos e existentes sem apagar dados.
  applyMigrations(db);

  console.log('✅ Schema aplicado com sucesso!');

  // ── Validação ──────────────────────────────────────────────────────────
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();

  console.log('\n📋 Tabelas criadas:');
  tables.forEach(t => console.log(`   • ${t.name}`));

  const tenants = db.prepare('SELECT * FROM tenants').all();
  console.log('\n🏢 Tenants:');
  console.table(tenants);

  const usuarios = db
    .prepare('SELECT id, nome, email, perfil FROM usuarios')
    .all();
  console.log('👤 Usuários:');
  console.table(usuarios);

  console.log('\n🎉 Banco de dados pronto em:', DB_PATH);
} catch (err) {
  console.error('❌ Erro ao inicializar o banco:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
