'use server'

/**
 * app/actions/recebimentos.ts  -  v1
 * Server Actions para o modulo de recebimentos.
 */

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

// --- Tipos publicos ---

export interface Recebimento {
  id: number
  pedido_id: number
  valor: number
  forma_pagamento: string
  data_recebimento: string
  observacao: string | null
}

export interface RecebimentoResumo {
  pedido_id: number
  nome_da_peca: string
  cliente_nome: string
  valor_total_cobrado: number
  total_recebido: number
  saldo_pendente: number
  status: string
}

export interface ActionResult {
  success: boolean
  message: string
}

// --- Queries de leitura ---

export async function getRecebimentosPorPedido(pedidoId: number): Promise<Recebimento[]> {
  return db
    .prepare(
      `SELECT id, pedido_id, valor, forma_pagamento, data_recebimento, observacao
       FROM recebimentos
       WHERE pedido_id = ? AND tenant_id = ?
       ORDER BY data_recebimento DESC`
    )
    .all(pedidoId, TENANT_ID) as Recebimento[]
}

export async function getPedidosComSaldoPendente(): Promise<RecebimentoResumo[]> {
  return db
    .prepare(
      `SELECT
         p.id          AS pedido_id,
         p.nome_da_peca,
         c.nome        AS cliente_nome,
         p.valor_total_cobrado,
         COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0) AS total_recebido,
         p.valor_total_cobrado -
           COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0) AS saldo_pendente,
         p.status
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       WHERE p.tenant_id = ?
         AND p.status = 'Finalizado'
         AND p.valor_total_cobrado >
               COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0)
       ORDER BY saldo_pendente DESC`
    )
    .all(TENANT_ID) as RecebimentoResumo[]
}

export async function getResumoRecebimentos(): Promise<{
  totalRecebidoMes: number
  totalPendente: number
}> {
  const mesRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM recebimentos
       WHERE tenant_id = ?
         AND strftime('%Y-%m', data_recebimento) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as { total: number }

  const pendenteRow = db
    .prepare(
      `SELECT COALESCE(SUM(
         p.valor_total_cobrado -
         COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0)
       ), 0) AS total
       FROM pedidos p
       WHERE p.tenant_id = ?
         AND p.status = 'Finalizado'
         AND p.valor_total_cobrado >
               COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0)`
    )
    .get(TENANT_ID) as { total: number }

  return {
    totalRecebidoMes: mesRow.total,
    totalPendente: pendenteRow.total,
  }
}

// --- Mutations ---

export async function registrarRecebimento(data: {
  pedido_id: number
  valor: number
  forma_pagamento: string
  observacao?: string
}): Promise<ActionResult> {
  try {
    if (!data.pedido_id) return { success: false, message: 'Pedido invalido.' }
    if (data.valor <= 0) return { success: false, message: 'O valor deve ser maior que zero.' }

    const pedidoOk = db
      .prepare('SELECT id FROM pedidos WHERE id = ? AND tenant_id = ?')
      .get(data.pedido_id, TENANT_ID)
    if (!pedidoOk) return { success: false, message: 'Pedido nao encontrado.' }

    db.prepare(
      `INSERT INTO recebimentos (tenant_id, pedido_id, valor, forma_pagamento, observacao)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      TENANT_ID,
      data.pedido_id,
      data.valor,
      data.forma_pagamento,
      data.observacao ?? null,
    )

    revalidatePath('/')
    revalidatePath('/financeiro')
    revalidatePath('/recebimentos')

    return { success: true, message: 'Recebimento registrado com sucesso!' }
  } catch (error) {
    console.error('[registrarRecebimento]', error)
    return { success: false, message: 'Erro interno ao registrar recebimento.' }
  }
}

export async function deletarRecebimento(id: number): Promise<ActionResult> {
  try {
    const res = db
      .prepare('DELETE FROM recebimentos WHERE id = ? AND tenant_id = ?')
      .run(id, TENANT_ID)

    if (res.changes === 0) return { success: false, message: 'Recebimento nao encontrado.' }

    revalidatePath('/')
    revalidatePath('/financeiro')
    revalidatePath('/recebimentos')

    return { success: true, message: 'Recebimento removido com sucesso.' }
  } catch (error) {
    console.error('[deletarRecebimento]', error)
    return { success: false, message: 'Erro interno ao remover recebimento.' }
  }
}
