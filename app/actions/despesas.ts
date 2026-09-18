'use server'

/**
 * app/actions/despesas.ts  -  v1
 * Server Actions para despesas e fluxo de capital.
 */

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

// --- Tipos publicos ---

export interface Despesa {
  id: number
  categoria: string
  descricao: string
  valor: number
  data_despesa: string
}

export interface FluxoCapital {
  id: number
  tipo: 'Aporte' | 'Retirada'
  valor: number
  descricao: string | null
  data_movimentacao: string
}

export interface ActionResult {
  success: boolean
  message: string
}

// --- Queries de leitura ---

export async function getDespesas(mes?: string): Promise<Despesa[]> {
  if (mes) {
    return db
      .prepare(
        `SELECT id, categoria, descricao, valor, data_despesa
         FROM despesas
         WHERE tenant_id = ?
           AND strftime('%Y-%m', data_despesa) = ?
         ORDER BY data_despesa DESC`
      )
      .all(TENANT_ID, mes) as Despesa[]
  }

  return db
    .prepare(
      `SELECT id, categoria, descricao, valor, data_despesa
       FROM despesas
       WHERE tenant_id = ?
       ORDER BY data_despesa DESC`
    )
    .all(TENANT_ID) as Despesa[]
}

export async function getFluxoCapital(): Promise<FluxoCapital[]> {
  return db
    .prepare(
      `SELECT id, tipo, valor, descricao, data_movimentacao
       FROM fluxo_capital
       WHERE tenant_id = ?
       ORDER BY data_movimentacao DESC`
    )
    .all(TENANT_ID) as FluxoCapital[]
}

export async function getResumoDespesas(): Promise<{
  totalDespesasMes: number
  totalAportes: number
  totalRetiradas: number
}> {
  const despesasMesRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM despesas
       WHERE tenant_id = ?
         AND strftime('%Y-%m', data_despesa) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as { total: number }

  const aportesRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM fluxo_capital
       WHERE tenant_id = ? AND tipo = 'Aporte'`
    )
    .get(TENANT_ID) as { total: number }

  const retiradasRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM fluxo_capital
       WHERE tenant_id = ? AND tipo = 'Retirada'`
    )
    .get(TENANT_ID) as { total: number }

  return {
    totalDespesasMes: despesasMesRow.total,
    totalAportes: aportesRow.total,
    totalRetiradas: retiradasRow.total,
  }
}

// --- Mutations: despesas ---

export async function salvarDespesa(
  id: number | null,
  data: Omit<Despesa, 'id'>,
): Promise<ActionResult> {
  try {
    if (!data.descricao?.trim()) return { success: false, message: 'Informe a descricao da despesa.' }
    if (data.valor <= 0) return { success: false, message: 'O valor deve ser maior que zero.' }

    if (id === null) {
      db.prepare(
        `INSERT INTO despesas (tenant_id, usuario_id, categoria, descricao, valor, data_despesa)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        TENANT_ID,
        USUARIO_ID,
        data.categoria,
        data.descricao.trim(),
        data.valor,
        data.data_despesa,
      )
    } else {
      const res = db.prepare(
        `UPDATE despesas
         SET categoria = ?, descricao = ?, valor = ?, data_despesa = ?
         WHERE id = ? AND tenant_id = ?`
      ).run(
        data.categoria,
        data.descricao.trim(),
        data.valor,
        data.data_despesa,
        id,
        TENANT_ID,
      )
      if (res.changes === 0) return { success: false, message: 'Despesa nao encontrada.' }
    }

    revalidatePath('/financeiro')
    revalidatePath('/despesas')

    return {
      success: true,
      message: id === null ? 'Despesa registrada com sucesso!' : 'Despesa atualizada com sucesso!',
    }
  } catch (error) {
    console.error('[salvarDespesa]', error)
    return { success: false, message: 'Erro interno ao salvar despesa.' }
  }
}

export async function deletarDespesa(id: number): Promise<ActionResult> {
  try {
    const res = db
      .prepare('DELETE FROM despesas WHERE id = ? AND tenant_id = ?')
      .run(id, TENANT_ID)

    if (res.changes === 0) return { success: false, message: 'Despesa nao encontrada.' }

    revalidatePath('/financeiro')
    revalidatePath('/despesas')

    return { success: true, message: 'Despesa removida com sucesso.' }
  } catch (error) {
    console.error('[deletarDespesa]', error)
    return { success: false, message: 'Erro interno ao remover despesa.' }
  }
}

// --- Mutations: fluxo de capital ---

export async function salvarFluxoCapital(
  data: Omit<FluxoCapital, 'id'>,
): Promise<ActionResult> {
  try {
    if (data.valor <= 0) return { success: false, message: 'O valor deve ser maior que zero.' }
    if (!['Aporte', 'Retirada'].includes(data.tipo)) {
      return { success: false, message: 'Tipo de movimentacao invalido.' }
    }

    db.prepare(
      `INSERT INTO fluxo_capital (tenant_id, usuario_id, tipo, valor, descricao, data_movimentacao)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      TENANT_ID,
      USUARIO_ID,
      data.tipo,
      data.valor,
      data.descricao ?? null,
      data.data_movimentacao,
    )

    revalidatePath('/financeiro')
    revalidatePath('/fluxo-capital')

    return { success: true, message: `${data.tipo} registrado com sucesso!` }
  } catch (error) {
    console.error('[salvarFluxoCapital]', error)
    return { success: false, message: 'Erro interno ao registrar movimentacao.' }
  }
}
