/** Health-check sem expor caminhos, tabelas ou dados internos. */

import { NextResponse } from 'next/server'
import db from '@/lib/db'

export const runtime = 'nodejs'

interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: string
  database: {
    connected: boolean
    schemaReady: boolean
  }
  version?: string
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const timestamp = new Date().toISOString()

  try {
    const expectedTables = ['tenants', 'usuarios', 'filamentos', 'clientes', 'pedidos']
    const placeholders = expectedTables.map(() => '?').join(', ')
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM sqlite_master
         WHERE type = 'table' AND name IN (${placeholders})`,
      )
      .get(...expectedTables) as { count: number }
    const schemaReady = row.count === expectedTables.length

    return NextResponse.json(
      {
        status: schemaReady ? 'ok' : 'error',
        timestamp,
        database: { connected: true, schemaReady },
        version: process.env.npm_package_version ?? '0.1.0',
      },
      {
        status: schemaReady ? 200 : 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      },
    )
  } catch (error) {
    console.error('[health] Falha na verificação do banco:', error)
    return NextResponse.json(
      {
        status: 'error',
        timestamp,
        database: { connected: false, schemaReady: false },
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
