'use server'

import { randomBytes, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { exigirPerfil } from '@/lib/session'
import {
  buscarPagamentosMercadoPago,
  normalizarValorCobranca,
  configuracaoMercadoPago,
  criarPreferenciaMercadoPago,
  montarPreferenciaMercadoPago,
} from '@/lib/mercado-pago.mjs'
import {
  processarPagamentoMercadoPago,
  type PagamentoMercadoPago,
} from '@/lib/mercado-pago-processamento'

export interface CobrancaMercadoPago {
  id: number
  valor: number
  status: string
  init_point: string
  pagamento_id: string | null
  forma_pagamento: string | null
  pago_em: string | null
  criado_em: string
  valor_liquido: number | null
  taxa_valor: number | null
}

export async function gerarCobrancaMercadoPago(pedidoId: number, valorSolicitado: number): Promise<{
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
        p.orcamento_status, p.status, p.validade_orcamento, c.email AS cliente_email,
        MAX(0, p.valor_total_cobrado - COALESCE((SELECT SUM(r.valor)
          FROM recebimentos r WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)) AS saldo_pendente
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = ? AND p.tenant_id = ?
    `).get(pedidoId, sessao.tenantId) as {
      id: number; numero_orcamento: string | null; nome_da_peca: string
      valor_total_cobrado: number; saldo_pendente: number
      orcamento_status: string; status: string; validade_orcamento: string | null
      cliente_email: string | null
    } | undefined
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }
    if (pedido.orcamento_status !== 'Aprovado' || pedido.status === 'Cancelado') {
      return { success: false, message: 'A cobrança só pode ser criada para um pedido aprovado e ativo.' }
    }
    if (pedido.saldo_pendente < 0.01) return { success: false, message: 'Este pedido não possui saldo pendente.' }
    let valorCobranca: number
    try {
      valorCobranca = normalizarValorCobranca(valorSolicitado, pedido.saldo_pendente)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error && error.message === 'PAYMENT_AMOUNT_EXCEEDS_BALANCE'
          ? 'O valor da cobrança não pode ultrapassar o saldo pendente.'
          : 'Informe um valor de cobrança maior que zero.',
      }
    }

    const validadeMinimaPortal = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const portalExistente = db.prepare(`
      SELECT id, token, expira_em FROM portal_links
      WHERE tenant_id = ? AND pedido_id = ? AND revogado_em IS NULL
        AND datetime(expira_em) > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(sessao.tenantId, pedido.id) as { id: number; token: string; expira_em: string } | undefined
    let portalToken = portalExistente?.token
    if (portalExistente) {
      db.prepare(`UPDATE portal_links SET expira_em = ?
        WHERE id = ? AND datetime(expira_em) < datetime(?)`
      ).run(validadeMinimaPortal, portalExistente.id, validadeMinimaPortal)
    } else {
      portalToken = randomBytes(24).toString('hex')
      const portal = db.prepare(`INSERT INTO portal_links (
        tenant_id, usuario_id, pedido_id, token, expira_em
      ) VALUES (?, ?, ?, ?, ?)`
      ).run(sessao.tenantId, sessao.usuarioId, pedido.id, portalToken, validadeMinimaPortal)
      registrarAuditoria(db, {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        entidade: 'PortalCliente',
        entidadeId: Number(portal.lastInsertRowid),
        acao: 'CRIAR_LINK',
        descricao: `Link seguro criado para o retorno do pagamento do pedido #${pedido.id}`,
      })
    }

    const externalReference = `salge-${sessao.tenantId}-${pedido.id}-${randomUUID()}`
    const idempotencyKey = randomUUID()
    const preferencia = await criarPreferenciaMercadoPago(
      montarPreferenciaMercadoPago({
        pedido: { ...pedido, saldo_pendente: valorCobranca },
        externalReference,
        appUrl: config.appUrl,
        portalToken,
        // O Mercado Pago não envia webhooks automáticos para pagamentos criados
        // com credenciais de teste. No sandbox a consulta manual usa a referência.
        incluirWebhook: !config.testMode,
      }),
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
      url, preferencia.sandbox_init_point || null, valorCobranca,
    )
    registrarAuditoria(db, {
      entidade: 'CobrancaMercadoPago', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR',
      descricao: `Cobrança de R$ ${valorCobranca.toFixed(2)} para ${pedido.numero_orcamento || `#${pedido.id}`}`,
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

export async function sincronizarCobrancaMercadoPago(pedidoId: number): Promise<{
  success: boolean
  message: string
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
    const cobranca = db.prepare(`
      SELECT id, external_reference, status, pagamento_id
      FROM mercado_pago_cobrancas
      WHERE pedido_id = ? AND tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(pedidoId, sessao.tenantId) as {
      id: number
      external_reference: string
      status: string
      pagamento_id: string | null
    } | undefined
    if (!cobranca) return { success: false, message: 'Este pedido ainda não possui cobrança do Mercado Pago.' }
    if (cobranca.status === 'Aprovado') {
      return { success: true, message: 'O pagamento já está aprovado e registrado.' }
    }

    const busca = await buscarPagamentosMercadoPago(
      cobranca.external_reference,
      config.accessToken,
    ) as { results?: PagamentoMercadoPago[] }
    const pagamentos = (busca.results || []).filter((item) =>
      item.external_reference === cobranca.external_reference,
    )
    if (pagamentos.length === 0) {
      return { success: false, message: 'O Mercado Pago ainda não encontrou pagamento para esta cobrança.' }
    }
    const pagamento = pagamentos.find((item) => item.status === 'approved') || pagamentos[0]
    const resultado = processarPagamentoMercadoPago(
      pagamento,
      { source: 'manual_sync', payment_id: pagamento.id },
      'manual.sync',
    )
    revalidatePath(`/pedidos/${pedidoId}`)
    revalidatePath('/financeiro')
    revalidatePath('/relatorios')
    if (resultado.status === 'Aprovado') {
      return { success: true, message: resultado.duplicado
        ? 'O pagamento já havia sido sincronizado.'
        : 'Pagamento aprovado e registrado automaticamente.' }
    }
    return {
      success: true,
      message: `Status atualizado pelo Mercado Pago: ${resultado.status}.`,
    }
  } catch (error) {
    console.error('[sincronizarCobrancaMercadoPago]', error)
    const detalhe = error instanceof Error && error.message.startsWith('MERCADO_PAGO_API:')
      ? error.message.replace('MERCADO_PAGO_API:', '')
      : null
    return {
      success: false,
      message: detalhe
        ? `Não foi possível consultar o Mercado Pago: ${detalhe}`
        : 'Não foi possível sincronizar esta cobrança.',
    }
  }
}
