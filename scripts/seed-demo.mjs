/**
 * scripts/seed-demo.mjs
 *
 * Adiciona dados de demonstração: clientes, filamentos e insumos.
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
  { nome: 'João Silva',   telefone: '(11) 99999-1111', instagram: '@joaosilva',   cidade: 'São Paulo',       origem: 'Instagram' },
  { nome: 'Maria Santos', telefone: '(21) 98888-2222', instagram: '@mariasantos', cidade: 'Rio de Janeiro',  origem: 'Indicação'  },
  { nome: 'Pedro Alves',  telefone: '(31) 97777-3333', instagram: null,            cidade: 'Belo Horizonte',  origem: 'WhatsApp'   },
  { nome: 'Ana Ferreira', telefone: '(41) 96666-4444', instagram: '@anaferreira', cidade: 'Curitiba',        origem: 'Instagram'  },
];

// ── Filamentos ────────────────────────────────────────────────────────────────
const filamentos = [
  { material: 'PLA',  cor: 'Branco',       marca: 'Bambu Lab', fornecedor: 'AliExpress', peso_rolo_gramas: 1000, preco_rolo:  89.90, estoque_gramas: 1000 },
  { material: 'PLA',  cor: 'Preto',        marca: 'Bambu Lab', fornecedor: 'AliExpress', peso_rolo_gramas: 1000, preco_rolo:  89.90, estoque_gramas: 1000 },
  { material: 'PLA',  cor: 'Vermelho',     marca: 'Bambu Lab', fornecedor: 'AliExpress', peso_rolo_gramas: 1000, preco_rolo:  94.90, estoque_gramas:   50 }, // Pouco estoque → alerta
  { material: 'PETG', cor: 'Transparente', marca: 'eSUN',      fornecedor: 'Mercado Livre', peso_rolo_gramas: 1000, preco_rolo: 109.90, estoque_gramas: 1000 },
  { material: 'PETG', cor: 'Azul',         marca: 'eSUN',      fornecedor: 'Mercado Livre', peso_rolo_gramas: 1000, preco_rolo: 114.90, estoque_gramas: 1000 },
  { material: 'TPU',  cor: 'Preto',        marca: 'Polymaker', fornecedor: 'Amazon',    peso_rolo_gramas:  500, preco_rolo:  79.90, estoque_gramas:  500 },
];

<<<<<<< HEAD
// ── Insumos ───────────────────────────────────────────────────────────────────
const insumos = [
  { nome: 'Suporte de impressão', unidade: 'g',    custo_unitario:  0.08, estoque_atual: 500, estoque_minimo:  50 },
  { nome: 'Lixa 400',             unidade: 'unid', custo_unitario:  1.50, estoque_atual:  20, estoque_minimo:   5 },
  { nome: 'Cola Super Bonder',    unidade: 'unid', custo_unitario:  8.90, estoque_atual:   3, estoque_minimo:   2 },
];

// ── Prepared statements ───────────────────────────────────────────────────────
const insertCliente = db.prepare(
  `INSERT OR IGNORE INTO clientes (tenant_id, usuario_id, nome, telefone, instagram, cidade, origem)
=======
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
>>>>>>> main
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const insertFilamento = db.prepare(
  `INSERT OR IGNORE INTO filamentos (tenant_id, usuario_id, material, cor, marca, fornecedor, peso_rolo_gramas, preco_rolo, estoque_gramas)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertInsumo = db.prepare(
  `INSERT OR IGNORE INTO insumos (tenant_id, usuario_id, nome, unidade, custo_unitario, estoque_atual, estoque_minimo)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

// ── Seed transaction ──────────────────────────────────────────────────────────
const insertMany = db.transaction(() => {
  for (const c of clientes) {
<<<<<<< HEAD
    insertCliente.run(TENANT_ID, USUARIO_ID, c.nome, c.telefone, c.instagram ?? null, c.cidade ?? null, c.origem ?? null);
    console.log(`  ✅ Cliente: ${c.nome} (${c.cidade ?? '—'}, via ${c.origem ?? '—'})`);
=======
    if (!clienteExiste.get(TENANT_ID, c.nome, c.telefone)) {
      insertCliente.run(TENANT_ID, USUARIO_ID, c.nome, c.telefone);
      console.log(`  ✅ Cliente: ${c.nome}`);
    }
>>>>>>> main
  }

  for (const f of filamentos) {
<<<<<<< HEAD
    insertFilamento.run(TENANT_ID, USUARIO_ID, f.material, f.cor, f.marca, f.fornecedor, f.peso_rolo_gramas, f.preco_rolo, f.estoque_gramas);
    console.log(`  ✅ Filamento: ${f.material} ${f.cor} [${f.marca}] — R$ ${f.preco_rolo} | ${f.estoque_gramas}g em estoque`);
  }

  for (const i of insumos) {
    insertInsumo.run(TENANT_ID, USUARIO_ID, i.nome, i.unidade, i.custo_unitario, i.estoque_atual, i.estoque_minimo);
    console.log(`  ✅ Insumo: ${i.nome} (${i.estoque_atual} ${i.unidade} em estoque)`);
=======
    if (!filamentoExiste.get(TENANT_ID, f.material, f.cor)) {
      insertFilamento.run(TENANT_ID, USUARIO_ID, f.material, f.cor, f.peso_rolo_gramas, f.preco_rolo, f.estoque);
      console.log(`  ✅ Filamento: ${f.material} ${f.cor} — R$ ${f.preco_rolo}`);
    }
>>>>>>> main
  }
});

console.log('🌱 Inserindo dados de demonstração...\n');
insertMany();
console.log('\n🎉 Seed concluído!');
db.close();
