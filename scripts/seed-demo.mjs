/**
 * scripts/seed-demo.mjs
 *
 * Adiciona dados de demonstração: clientes e filamentos.
 * Execute APÓS o db:init.
 *
 * Uso: node scripts/seed-demo.mjs
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'database', 'salge3d.sqlite');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const tenant = db
  .prepare("SELECT id FROM tenants WHERE nome = 'Salge 3D' AND ativo = 1 ORDER BY id LIMIT 1")
  .get();

if (!tenant) {
  console.error('❌ Tenant Salge 3D não encontrado. Execute npm run db:init primeiro.');
  process.exit(1);
}

const usuario = db
  .prepare('SELECT id FROM usuarios WHERE tenant_id = ? AND ativo = 1 ORDER BY id LIMIT 1')
  .get(tenant.id);

if (!usuario) {
  console.error('❌ Usuário ativo não encontrado. Execute npm run db:init primeiro.');
  process.exit(1);
}

const TENANT_ID = tenant.id;
const USUARIO_ID = usuario.id;

// ── Clientes ──────────────────────────────────────────────────────────────────
const clientes = [
  { nome: 'João Silva',    telefone: '(11) 99999-1111' },
  { nome: 'Maria Santos',  telefone: '(21) 98888-2222' },
  { nome: 'Pedro Alves',   telefone: '(31) 97777-3333' },
  { nome: 'Ana Ferreira',  telefone: '(41) 96666-4444' },
];

// ── Filamentos ────────────────────────────────────────────────────────────────
const filamentos = [
  { material: 'PLA',  cor: 'Branco',    peso_rolo_gramas: 1000, preco_rolo: 89.90,  estoque: 1000 },
  { material: 'PLA',  cor: 'Preto',     peso_rolo_gramas: 1000, preco_rolo: 89.90,  estoque: 1000 },
  { material: 'PLA',  cor: 'Vermelho',  peso_rolo_gramas: 1000, preco_rolo: 94.90,  estoque: 50 }, // Pouco estoque
  { material: 'PETG', cor: 'Transparente', peso_rolo_gramas: 1000, preco_rolo: 109.90, estoque: 1000 },
  { material: 'PETG', cor: 'Azul',      peso_rolo_gramas: 1000, preco_rolo: 114.90, estoque: 1000 },
  { material: 'TPU',  cor: 'Preto',     peso_rolo_gramas: 500,  preco_rolo: 79.90,  estoque: 500 },
];

const clienteExiste = db.prepare(
  'SELECT 1 FROM clientes WHERE tenant_id = ? AND nome = ? AND telefone = ?'
);
const insertCliente = db.prepare(
  `INSERT INTO clientes (tenant_id, usuario_id, nome, telefone) VALUES (?, ?, ?, ?)`
);
const filamentoExiste = db.prepare(
  'SELECT 1 FROM filamentos WHERE tenant_id = ? AND material = ? AND cor = ?'
);
const insertFilamento = db.prepare(
  `INSERT INTO filamentos (tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const insertMany = db.transaction(() => {
  for (const c of clientes) {
    if (!clienteExiste.get(TENANT_ID, c.nome, c.telefone)) {
      insertCliente.run(TENANT_ID, USUARIO_ID, c.nome, c.telefone);
      console.log(`  ✅ Cliente: ${c.nome}`);
    }
  }
  for (const f of filamentos) {
    if (!filamentoExiste.get(TENANT_ID, f.material, f.cor)) {
      insertFilamento.run(TENANT_ID, USUARIO_ID, f.material, f.cor, f.peso_rolo_gramas, f.preco_rolo, f.estoque);
      console.log(`  ✅ Filamento: ${f.material} ${f.cor} — R$ ${f.preco_rolo}`);
    }
  }
});

console.log('🌱 Inserindo dados de demonstração...\n');
insertMany();
console.log('\n🎉 Seed concluído!');
db.close();
