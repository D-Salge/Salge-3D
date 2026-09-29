'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { exigirPerfil } from '@/lib/session'
import {
  configuracaoMercadoPago,
  criarPreferenciaMercadoPago,
  montarPreferenciaMercadoPago,
} from '@/lib/mercado-pago.mjs'

export interface CobrancaMercadoPago {
  id: number
  valor: number
  status: string
  init_point: string
  pagamento_id: string | null
  forma_pagamento: string | null
  pago_em: string | null
  criado_em: string
}

export async function gerarCobrancaMercadoPago(pedidoId: number): Promise<{
  success: boolean
  message: string
  url?: string
}> {
  try {
    const sessao = await exigirPerfil(['admin', 'operador'])
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      return { success: false, message: 'Pedido inválido.' }
    }
    const config = configuracaoMercadoPago()
    if (!config.configurado) {
      return { success: false, message: `Integração incompleta: ${config.ausentes.join(', ')}.` }
    }
    const pedido = db.prepare(`
      SELECT p.id, p.numero_orcamento, p.nome_da_peca, p.valor_total_cobrado,
        p.orcamento_status, p.status, c.email AS cliente_email,
        MAX(0, p.valor_total_cobrado - COALESCE((SELECT SUM(r.valor)
          FROM recebimentos r WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)) AS saldo_pendente
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = ? AND p.tenant_id = ?
    `).get(pedidoId, sessao.tenantId) as {
      id: number; numero_orcamento: string | null; nome_da_peca: string
      valor_total_cobrado: number; saldo_pendente: number
      orcamento_status: string; status: string; cliente_email: string | null
    } | undefined
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }
    if (pedido.orcamento_status !== 'Aprovado' || pedido.status === 'Cancelado') {
      return { success: false, message: 'A cobrança só pode ser criada para um pedido aprovado e ativo.' }
    }
    if (pedido.saldo_pendente < 0.01) return { success: false, message: 'Este pedido não possui saldo pendente.' }

    const externalReference = `salge-${sessao.tenantId}-${pedido.id}-${randomUUID()}`
    const idempotencyKey = randomUUID()
    const preferencia = await criarPreferenciaMercadoPago(
      montarPreferenciaMercadoPago({ pedido, externalReference, appUrl: config.appUrl }),
      config.accessToken,
      idempotencyKey,
    ) as { id?: string; init_point?: string; sandbox_init_point?: string }
    if (!preferencia.id || !preferencia.init_point) throw new Error('MERCADO_PAGO_INVALID_RESPONSE')
    const url = config.testMode && preferencia.sandbox_init_point
      ? preferencia.sandbox_init_point
      : preferencia.init_point
    const result = db.prepare(`
      INSERT INTO mercado_pago_cobrancas (
        tenant_id, usuario_id, pedido_id, preference_id, external_reference,
        init_point, sandbox_init_point, valor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessao.tenantId, sessao.usuarioId, pedido.id, preferencia.id, externalReference,
      url, preferencia.sandbox_init_point || null, pedido.saldo_pendente,
    )
    registrarAuditoria(db, {
      entidade: 'CobrancaMercadoPago', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR',
      descricao: `Cobrança de R$ ${pedido.saldo_pendente.toFixed(2)} para ${pedido.numero_orcamento || `#${pedido.id}`}`,
    })
    revalidatePath(`/pedidos/${pedido.id}`)
    return { success: true, message: 'Link de pagamento criado.', url }
  } catch (error) {
    console.error('[gerarCobrancaMercadoPago]', error)
    const detalhe = error instanceof Error && error.message.startsWith('MERCADO_PAGO_API:')
      ? error.message.replace('MERCADO_PAGO_API:', '')
      : null
    return { success: false, message: detalhe ? `Mercado Pago recusou a solicitação: ${detalhe}` : 'Não foi possível criar a cobrança.' }
  }
}
