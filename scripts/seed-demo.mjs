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

const TENANT_ID  = 1;
const USUARIO_ID = 1;

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

const insertCliente = db.prepare(
  `INSERT OR IGNORE INTO clientes (tenant_id, usuario_id, nome, telefone)
   VALUES (?, ?, ?, ?)`
);

const insertFilamento = db.prepare(
  `INSERT OR IGNORE INTO filamentos (tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const insertMany = db.transaction(() => {
  for (const c of clientes) {
    insertCliente.run(TENANT_ID, USUARIO_ID, c.nome, c.telefone);
    console.log(`  ✅ Cliente: ${c.nome}`);
  }
  for (const f of filamentos) {
    insertFilamento.run(TENANT_ID, USUARIO_ID, f.material, f.cor, f.peso_rolo_gramas, f.preco_rolo, f.estoque);
    console.log(`  ✅ Filamento: ${f.material} ${f.cor} — R$ ${f.preco_rolo}`);
  }
});

console.log('🌱 Inserindo dados de demonstração...\n');
insertMany();
console.log('\n🎉 Seed concluído!');
db.close();
