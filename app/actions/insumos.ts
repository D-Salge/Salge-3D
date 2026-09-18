'use server'

/**
 * app/actions/insumos.ts  -  v1
 * Server Actions para o modulo de insumos.
 */

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

// --- Tipos publicos ---

export interface Insumo {
  id: number
  nome: string
  unidade: string
  custo_unitario: number
  estoque_atual: number
  estoque_minimo: number
}

export interface ActionResult {
  success: boolean
  message: string
}

// --- Queries de leitura ---

export async function getInsumosLista(): Promise<Insumo[]> {
  return db
    .prepare(
      `SELECT id, nome, unidade, custo_unitario, estoque_atual, estoque_minimo
       FROM insumos
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY nome ASC`
    )
    .all(TENANT_ID) as Insumo[]
}

// --- Mutations ---

export async function salvarInsumo(
  id: number | null,
  data: Omit<Insumo, 'id'>,
): Promise<ActionResult> {
  try {
    if (!data.nome?.trim()) return { success: false, message: 'Informe o nome do insumo.' }
    if (!['unid', 'g', 'ml', 'cm', 'm'].includes(data.unidade)) {
      return { success: false, message: 'Unidade invalida.' }
    }
    if (![data.custo_unitario, data.estoque_atual, data.estoque_minimo].every(Number.isFinite) ||
        data.custo_unitario < 0 || data.estoque_atual < 0 || data.estoque_minimo < 0) {
      return { success: false, message: 'Custo e estoques devem ser valores nao negativos.' }
    }

    const salvar = db.transaction(() => {
      let insumoId = id
      let saldoAnterior = 0
      if (id === null) {
        const result = db.prepare(
          `INSERT INTO insumos (tenant_id, usuario_id, nome, unidade, custo_unitario, estoque_atual, estoque_minimo)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          TENANT_ID, USUARIO_ID, data.nome.trim(), data.unidade,
          data.custo_unitario, data.estoque_atual, data.estoque_minimo,
        )
        insumoId = Number(result.lastInsertRowid)
      } else {
        const atual = db.prepare(
          'SELECT estoque_atual FROM insumos WHERE id = ? AND tenant_id = ? AND ativo = 1',
        ).get(id, TENANT_ID) as { estoque_atual: number } | undefined
        if (!atual) throw new Error('NOT_FOUND')
        saldoAnterior = atual.estoque_atual

        db.prepare(
          `UPDATE insumos
           SET nome = ?, unidade = ?, custo_unitario = ?, estoque_atual = ?, estoque_minimo = ?
           WHERE id = ? AND tenant_id = ?`
        ).run(
          data.nome.trim(), data.unidade, data.custo_unitario,
          data.estoque_atual, data.estoque_minimo, id, TENANT_ID,
        )
      }

      if (insumoId && data.estoque_atual !== saldoAnterior) {
        db.prepare(`
          INSERT INTO movimentos_estoque (
            tenant_id, usuario_id, tipo_item, item_id, tipo, quantidade,
            saldo_anterior, saldo_posterior, motivo
          ) VALUES (?, ?, 'Insumo', ?, ?, ?, ?, ?, ?)
        `).run(
          TENANT_ID, USUARIO_ID, insumoId, id === null ? 'Entrada' : 'Ajuste',
          Math.abs(data.estoque_atual - saldoAnterior), saldoAnterior, data.estoque_atual,
          id === null ? 'Estoque inicial' : 'Saldo atualizado no cadastro',
        )
      }
    })
    salvar()

    revalidatePath('/insumos')
    revalidatePath('/orcamentos')

    return {
      success: true,
      message: id === null ? 'Insumo criado com sucesso!' : 'Insumo atualizado com sucesso!',
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { success: false, message: 'Insumo nao encontrado.' }
    }
    console.error('[salvarInsumo]', error)
    return { success: false, message: 'Erro interno ao salvar insumo.' }
  }
}

export async function deletarInsumo(id: number): Promise<ActionResult> {
  try {
    db.prepare('UPDATE insumos SET ativo = 0 WHERE id = ? AND tenant_id = ?').run(id, TENANT_ID)
    revalidatePath('/insumos')
    return { success: true, message: 'Insumo removido com sucesso.' }
  } catch (error: unknown) {
    console.error('[deletarInsumo]', error)
    const msg =
      error instanceof Error && (error as NodeJS.ErrnoException).code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
        ? 'Insumo nao pode ser removido pois esta vinculado a pedidos.'
        : 'Erro interno ao remover insumo.'
    return { success: false, message: msg }
  }
}
