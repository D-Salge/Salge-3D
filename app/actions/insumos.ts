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
    if (data.custo_unitario < 0) return { success: false, message: 'Custo unitario nao pode ser negativo.' }
    if (data.estoque_atual < 0) return { success: false, message: 'Estoque atual nao pode ser negativo.' }

    if (id === null) {
      db.prepare(
        `INSERT INTO insumos (tenant_id, usuario_id, nome, unidade, custo_unitario, estoque_atual, estoque_minimo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        TENANT_ID,
        USUARIO_ID,
        data.nome.trim(),
        data.unidade,
        data.custo_unitario,
        data.estoque_atual,
        data.estoque_minimo,
      )
    } else {
      const res = db.prepare(
        `UPDATE insumos
         SET nome = ?, unidade = ?, custo_unitario = ?, estoque_atual = ?, estoque_minimo = ?
         WHERE id = ? AND tenant_id = ?`
      ).run(
        data.nome.trim(),
        data.unidade,
        data.custo_unitario,
        data.estoque_atual,
        data.estoque_minimo,
        id,
        TENANT_ID,
      )
      if (res.changes === 0) return { success: false, message: 'Insumo nao encontrado.' }
    }

    revalidatePath('/insumos')
    revalidatePath('/orcamentos')

    return {
      success: true,
      message: id === null ? 'Insumo criado com sucesso!' : 'Insumo atualizado com sucesso!',
    }
  } catch (error) {
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
