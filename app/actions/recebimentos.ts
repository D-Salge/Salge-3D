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
  vencimento_em: string | null
  parcelas: number
  situacao: 'Em aberto' | 'Parcial' | 'Atrasado'
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
       WHERE pedido_id = ? AND tenant_id = ? AND estornado_em IS NULL
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
         COALESCE((SELECT SUM(r.valor) FROM recebimentos r
           WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS total_recebido,
         p.valor_total_cobrado -
           COALESCE((SELECT SUM(r.valor) FROM recebimentos r
             WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS saldo_pendente,
         p.status,
         p.vencimento_em,
         p.parcelas,
         CASE
           WHEN p.vencimento_em IS NOT NULL AND date(p.vencimento_em) < date('now') THEN 'Atrasado'
           WHEN COALESCE((SELECT SUM(r.valor) FROM recebimentos r
             WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) > 0 THEN 'Parcial'
           ELSE 'Em aberto'
         END AS situacao
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       WHERE p.tenant_id = ?
         AND p.status != 'Cancelado'
         AND p.orcamento_status = 'Aprovado'
         AND p.valor_total_cobrado >
               COALESCE((SELECT SUM(r.valor) FROM recebimentos r
                 WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)
       ORDER BY CASE WHEN situacao = 'Atrasado' THEN 0 ELSE 1 END, saldo_pendente DESC`
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
       WHERE tenant_id = ? AND estornado_em IS NULL
         AND strftime('%Y-%m', data_recebimento) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as { total: number }

  const pendenteRow = db
    .prepare(
      `SELECT COALESCE(SUM(
         p.valor_total_cobrado -
         COALESCE((SELECT SUM(r.valor) FROM recebimentos r
           WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)
       ), 0) AS total
       FROM pedidos p
       WHERE p.tenant_id = ?
         AND p.status != 'Cancelado'
         AND p.orcamento_status = 'Aprovado'
         AND p.valor_total_cobrado >
               COALESCE((SELECT SUM(r.valor) FROM recebimentos r
                 WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)`
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
    if (!Number.isSafeInteger(data.pedido_id) || data.pedido_id <= 0) {
      return { success: false, message: 'Pedido invalido.' }
    }
    if (!Number.isFinite(data.valor) || data.valor <= 0 || data.valor > 10_000_000) {
      return { success: false, message: 'O valor deve ser maior que zero.' }
    }

    const formas: Record<string, string> = {
      Pix: 'Pix', Dinheiro: 'Dinheiro',
      'Cartão Crédito': 'Cartao Credito', 'Cartao Credito': 'Cartao Credito',
      'Cartão Débito': 'Cartao Debito', 'Cartao Debito': 'Cartao Debito',
      Transferência: 'Transferencia', Transferencia: 'Transferencia', Outro: 'Outro',
    }
    const forma = formas[data.forma_pagamento]
    if (!forma) return { success: false, message: 'Forma de pagamento invalida.' }

    const registrar = db.transaction(() => {
      const pedido = db.prepare(`
        SELECT p.valor_total_cobrado,
          COALESCE((SELECT SUM(r.valor) FROM recebimentos r
            WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS recebido
        FROM pedidos p
        WHERE p.id = ? AND p.tenant_id = ? AND p.status != 'Cancelado'
          AND p.orcamento_status = 'Aprovado'
      `).get(data.pedido_id, TENANT_ID) as { valor_total_cobrado: number; recebido: number } | undefined
      if (!pedido) throw new Error('NOT_FOUND')
      const saldo = Math.round((pedido.valor_total_cobrado - pedido.recebido) * 100) / 100
      if (data.valor > saldo + 0.001) throw new Error(`OVERPAYMENT:${saldo}`)

      db.prepare(
        `INSERT INTO recebimentos (tenant_id, pedido_id, valor, forma_pagamento, observacao)
         VALUES (?, ?, ?, ?, ?)`
      ).run(TENANT_ID, data.pedido_id, data.valor, forma, data.observacao?.trim() || null)
    })
    try {
      registrar()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'NOT_FOUND') return { success: false, message: 'Pedido nao encontrado.' }
      if (message.startsWith('OVERPAYMENT:')) {
        const saldo = Number(message.split(':')[1])
        return { success: false, message: `O valor excede o saldo pendente de R$ ${saldo.toFixed(2).replace('.', ',')}.` }
      }
      throw error
    }

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
      .prepare(`UPDATE recebimentos
        SET estornado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            estorno_motivo = 'Estornado pelo usuário'
        WHERE id = ? AND tenant_id = ? AND estornado_em IS NULL`)
      .run(id, TENANT_ID)

    if (res.changes === 0) return { success: false, message: 'Recebimento nao encontrado.' }

    revalidatePath('/')
    revalidatePath('/financeiro')
    revalidatePath('/recebimentos')

    return { success: true, message: 'Recebimento estornado com segurança.' }
  } catch (error) {
    console.error('[deletarRecebimento]', error)
    return { success: false, message: 'Erro interno ao remover recebimento.' }
  }
}
