'use server'

/**
 * app/actions/recebimentos.ts  -  v1
 * Server Actions para o modulo de recebimentos.
 */

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { distribuirRecebimento } from '@/lib/financeiro.mjs'
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
  parcela_id: number
  pedido_id: number
  nome_da_peca: string
  cliente_nome: string
  numero_parcela: number
  total_parcelas: number
  valor_parcela: number
  recebido_parcela: number
  saldo_pendente: number
  status: string
  vencimento_em: string | null
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
      `WITH recebidos AS (
         SELECT pedido_id, COALESCE(SUM(valor), 0) AS total
         FROM recebimentos
         WHERE tenant_id = ? AND estornado_em IS NULL
         GROUP BY pedido_id
       ), parcelas AS (
         SELECT pr.*,
           COALESCE(SUM(pr.valor) OVER (
             PARTITION BY pr.pedido_id ORDER BY pr.numero
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS valor_anterior
         FROM parcelas_receber pr
         WHERE pr.tenant_id = ? AND pr.cancelada_em IS NULL
       )
       SELECT
         pr.id AS parcela_id,
         p.id AS pedido_id,
         p.nome_da_peca,
         c.nome        AS cliente_nome,
         pr.numero AS numero_parcela,
         p.parcelas AS total_parcelas,
         pr.valor AS valor_parcela,
         MAX(0, MIN(pr.valor, COALESCE(rec.total, 0) - pr.valor_anterior)) AS recebido_parcela,
         pr.valor - MAX(0, MIN(pr.valor, COALESCE(rec.total, 0) - pr.valor_anterior)) AS saldo_pendente,
         p.status,
         pr.vencimento_em,
         CASE
           WHEN date(pr.vencimento_em) < date('now') THEN 'Atrasado'
           WHEN MAX(0, MIN(pr.valor, COALESCE(rec.total, 0) - pr.valor_anterior)) > 0 THEN 'Parcial'
           ELSE 'Em aberto'
         END AS situacao
       FROM parcelas pr
       JOIN pedidos p ON p.id = pr.pedido_id
       JOIN clientes c ON c.id = p.cliente_id
       LEFT JOIN recebidos rec ON rec.pedido_id = p.id
       WHERE p.tenant_id = ?
         AND p.status != 'Cancelado'
         AND p.orcamento_status = 'Aprovado'
         AND pr.valor > MAX(0, MIN(pr.valor, COALESCE(rec.total, 0) - pr.valor_anterior))
       ORDER BY CASE WHEN situacao = 'Atrasado' THEN 0 ELSE 1 END,
         date(pr.vencimento_em), p.id, pr.numero`
    )
    .all(TENANT_ID, TENANT_ID, TENANT_ID) as RecebimentoResumo[]
}

export async function getResumoRecebimentos(): Promise<{
  totalRecebidoMes: number
  totalRecebido: number
  totalPendente: number
  totalVencido: number
  receitaCompetenciaMes: number
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

  const recebidoTotalRow = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) AS total FROM recebimentos
    WHERE tenant_id = ? AND estornado_em IS NULL
  `).get(TENANT_ID) as { total: number }

  const vencidoRow = db.prepare(`
    WITH recebidos AS (
      SELECT pedido_id, COALESCE(SUM(valor), 0) AS total
      FROM recebimentos WHERE tenant_id = ? AND estornado_em IS NULL GROUP BY pedido_id
    ), parcelas AS (
      SELECT pr.*,
        COALESCE(SUM(pr.valor) OVER (
          PARTITION BY pr.pedido_id ORDER BY pr.numero
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS valor_anterior
      FROM parcelas_receber pr
      WHERE pr.tenant_id = ? AND pr.cancelada_em IS NULL
    )
    SELECT COALESCE(SUM(
      pr.valor - MAX(0, MIN(pr.valor, COALESCE(r.total, 0) - pr.valor_anterior))
    ), 0) AS total
    FROM parcelas pr
    JOIN pedidos p ON p.id = pr.pedido_id
    LEFT JOIN recebidos r ON r.pedido_id = pr.pedido_id
    WHERE p.status != 'Cancelado' AND date(pr.vencimento_em) < date('now')
      AND pr.valor > MAX(0, MIN(pr.valor, COALESCE(r.total, 0) - pr.valor_anterior))
  `).get(TENANT_ID, TENANT_ID) as { total: number }

  const competenciaRow = db.prepare(`
    SELECT COALESCE(SUM(valor_total_cobrado), 0) AS total
    FROM pedidos
    WHERE tenant_id = ? AND orcamento_status = 'Aprovado' AND status != 'Cancelado'
      AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')
  `).get(TENANT_ID) as { total: number }

  return {
    totalRecebidoMes: mesRow.total,
    totalRecebido: recebidoTotalRow.total,
    totalPendente: pendenteRow.total,
    totalVencido: vencidoRow.total,
    receitaCompetenciaMes: competenciaRow.total,
  }
}

// --- Mutations ---

export async function registrarRecebimento(data: {
  pedido_id: number
  valor: number
  forma_pagamento: string
  observacao?: string
  data_recebimento?: string
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
    const dataRecebimento = data.data_recebimento || new Date().toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRecebimento)) {
      return { success: false, message: 'Data de recebimento inválida.' }
    }

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

      const parcelas = db.prepare(`
        SELECT pr.id, pr.valor,
          COALESCE((SELECT SUM(ra.valor)
            FROM recebimento_alocacoes ra
            JOIN recebimentos rx ON rx.id = ra.recebimento_id
            WHERE ra.parcela_id = pr.id AND rx.estornado_em IS NULL), 0) AS recebido
        FROM parcelas_receber pr
        WHERE pr.pedido_id = ? AND pr.cancelada_em IS NULL
        ORDER BY date(pr.vencimento_em), pr.numero
      `).all(data.pedido_id) as { id: number; valor: number; recebido: number }[]

      const result = db.prepare(
        `INSERT INTO recebimentos (
          tenant_id, pedido_id, valor, forma_pagamento, data_recebimento, observacao
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        TENANT_ID, data.pedido_id, data.valor, forma, dataRecebimento,
        data.observacao?.trim() || null,
      )
      const recebimentoId = Number(result.lastInsertRowid)
      const distribuicao = distribuirRecebimento(data.valor, parcelas)
      if (distribuicao.restante > 0.001) throw new Error('INSTALLMENTS_MISMATCH')
      const alocar = db.prepare(`
        INSERT INTO recebimento_alocacoes (recebimento_id, parcela_id, valor)
        VALUES (?, ?, ?)
      `)
      for (const item of distribuicao.alocacoes) {
        alocar.run(recebimentoId, item.parcelaId, item.valor)
      }
      registrarAuditoria(db, {
        entidade: 'Recebimento',
        entidadeId: recebimentoId,
        acao: 'CRIAR',
        descricao: `Recebimento de R$ ${data.valor.toFixed(2)} no pedido #${data.pedido_id}`,
      })
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
      if (message === 'INSTALLMENTS_MISMATCH') {
        return { success: false, message: 'As parcelas do pedido estão inconsistentes. Reabra o pedido e tente novamente.' }
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
    const estornar = db.transaction(() => {
      const res = db.prepare(`UPDATE recebimentos
        SET estornado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            estorno_motivo = 'Estornado pelo usuário'
        WHERE id = ? AND tenant_id = ? AND estornado_em IS NULL`)
      .run(id, TENANT_ID)
      if (res.changes === 0) throw new Error('NOT_FOUND')
      registrarAuditoria(db, {
        entidade: 'Recebimento', entidadeId: id, acao: 'ESTORNAR',
        descricao: 'Recebimento estornado pelo usuário',
      })
    })
    try { estornar() } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        return { success: false, message: 'Recebimento nao encontrado.' }
      }
      throw error
    }

    revalidatePath('/')
    revalidatePath('/financeiro')
    revalidatePath('/recebimentos')

    return { success: true, message: 'Recebimento estornado com segurança.' }
  } catch (error) {
    console.error('[deletarRecebimento]', error)
    return { success: false, message: 'Erro interno ao remover recebimento.' }
  }
}
