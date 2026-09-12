/**
 * app/api/health/route.ts
 *
 * Rota de health-check do sistema.
 * Verifica se o banco de dados SQLite está respondendo corretamente
 * executando uma query real nas tabelas principais.
 *
 * GET /api/health
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const runtime = 'nodejs'; // Obrigatório: better-sqlite3 não roda no Edge Runtime

interface Tenant {
  id: number;
  nome: string;
  plano: string;
  ativo: number;
  criado_em: string;
}

interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  database: {
    connected: boolean;
    path: string;
    tenants: Tenant[];
    tables: string[];
  };
  version?: string;
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const timestamp = new Date().toISOString();

  try {
    // 1. Busca todos os tenants cadastrados
    const tenants = db.prepare('SELECT * FROM tenants').all() as Tenant[];

    // 2. Lista todas as tabelas do schema
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    // 3. Valida que as tabelas principais existem
    const expectedTables = ['tenants', 'usuarios', 'filamentos', 'clientes', 'pedidos'];
    const tableNames = tables.map((t) => t.name);
    const missingTables = expectedTables.filter((t) => !tableNames.includes(t));

    if (missingTables.length > 0) {
      return NextResponse.json(
        {
          status: 'error',
          timestamp,
          database: {
            connected: true,
            path: process.cwd() + '/database/salge3d.sqlite',
            tenants: [],
            tables: tableNames,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        status: 'ok',
        timestamp,
        database: {
          connected: true,
          path: process.cwd() + '/database/salge3d.sqlite',
          tenants,
          tables: tableNames,
        },
        version: process.env.npm_package_version ?? '0.1.0',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';

    console.error('[health] Falha na verificação do banco:', message);

    return NextResponse.json(
      {
        status: 'error',
        timestamp,
        database: {
          connected: false,
          path: process.cwd() + '/database/salge3d.sqlite',
          tenants: [],
          tables: [],
        },
      },
      { status: 500 }
    );
  }
}
