/**
 * lib/db.ts
 * Singleton de conexão com o banco de dados SQLite via better-sqlite3.
 *
 * Por que singleton?
 * - better-sqlite3 é SÍNCRONO e thread-safe para leituras concorrentes.
 * - Em desenvolvimento, o Hot Module Replacement do Next.js pode re-importar
 *   módulos a cada mudança; o padrão global evita abrir N conexões.
 * - Em produção (Node runtime), uma única instância é suficiente.
 */

import Database from 'better-sqlite3';
import path from 'path';

// Caminho absoluto do arquivo SQLite — fica na pasta /database na raiz do projeto.
const DB_PATH = path.join(process.cwd(), 'database', 'salge3d.sqlite');

// Tipo estendido para guardar a instância no objeto global do Node
declare global {
  var __db: Database.Database | undefined;
}

function createConnection(): Database.Database {
  const db = new Database(DB_PATH, {
    // verbose: console.log, // Descomente para debugar queries em dev
  });

  // Ativa otimizações de performance para cada conexão
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  return db;
}

/**
 * Retorna a instância singleton do banco de dados.
 * Em desenvolvimento, reutiliza a instância do objeto `global` para
 * sobreviver ao Hot Module Replacement.
 */
function getDb(): Database.Database {
  if (process.env.NODE_ENV === 'production') {
    // Em produção, cria uma única instância no módulo
    return createConnection();
  }

  // Em desenvolvimento, usa o global para evitar re-criação a cada HMR
  if (!global.__db) {
    global.__db = createConnection();
    console.log('[db] Conexão SQLite estabelecida em:', DB_PATH);
  }

  return global.__db;
}

const db = getDb();

export default db;
