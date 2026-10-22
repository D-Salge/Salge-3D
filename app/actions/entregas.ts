'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { registrarEntregaParcialNoBanco } from '@/lib/registro-entrega.mjs'
import { devolverSaidaProdutosAcabadosNoBanco, reconciliarPedidoEstoqueAposEstornoNoBanco } from '@/lib/producao-estoque.mjs'
import { exigirPerfil } from '@/lib/session'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface EntregaPedido {
  id: number
  quantidade: number
  valor_referente: number
  entregue_em: string
  observacao: string | null
  recebimento_id: number | null
  valor_recebido: number | null
  forma_pagamento: string | null
}

export interface ComprovanteEntrega extends EntregaPedido {
  numero_orcamento: string
  nome_da_peca: string
  cliente_nome: string
  quantidade_total: number
  quantidade_entregue_acumulada: number
  quantidade_restante: number
  valor_total_cobrado: number
}

function revalidarPedido(pedidoId: number) {
  revalidatePath('/')
  revalidatePath('/producao')
  revalidatePath('/orcamentos')
  revalidatePath('/financeiro')
  revalidatePath('/agenda')
  revalidatePath(`/pedidos/${pedidoId}`)
}

export async function atualizarQuantidadeProduzida(
  pedidoId: number,
  quantidadeProduzida: number,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !Number.isSafeInteger(quantidadeProduzida) || quantidadeProduzida < 0) {
      return { success: false, message: 'Quantidade produzida inválida.' }
    }
    const atualizar = db.transaction(() => {
      const pedido = db.prepare(`
        SELECT id, quantidade, quantidade_produzida, status,
          COALESCE((SELECT SUM(e.quantidade) FROM entregas_pedido e
            WHERE e.pedido_id = p.id AND e.cancelada_em IS NULL), 0) AS quantidade_entregue
        FROM pedidos p WHERE id = ? AND tenant_id = ?
      `).get(pedidoId, TENANT_ID) as {
        id: number; quantidade: number; quantidade_produzida: number
        quantidade_entregue: number; status: string
      } | undefined
      if (!pedido) throw new Error('NOT_FOUND')
      if (pedido.status === 'Cancelado') throw new Error('CANCELED')
      if (quantidadeProduzida > pedido.quantidade || quantidadeProduzida < pedido.quantidade_entregue) throw new Error('INVALID_QUANTITY')
      db.prepare(`UPDATE pedidos SET quantidade_produzida = ? WHERE id = ? AND tenant_id = ?`)
        .run(quantidadeProduzida, pedidoId, TENANT_ID)
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Progresso da produção', ?)
      `).run(TENANT_ID, pedidoId, USUARIO_ID, `${pedido.quantidade_produzida} → ${quantidadeProduzida} de ${pedido.quantidade} unidades`)
      registrarAuditoria(db, { entidade: 'Pedido', entidadeId: pedidoId, acao: 'PROGRESSO_PRODUCAO', descricao: `${quantidadeProduzida}/${pedido.quantidade} unidades` })
    })
    try { atualizar() } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'NOT_FOUND') return { success: false, message: 'Pedido não encontrado.' }
      if (message === 'CANCELED') return { success: false, message: 'Pedido cancelado não pode receber produção.' }
      if (message === 'INVALID_QUANTITY') return { success: false, message: 'A produção deve ficar entre o total já entregue e a quantidade total do pedido.' }
      throw error
    }
    revalidarPedido(pedidoId)
    return { success: true, message: 'Progresso de produção atualizado.' }
  } catch (error) {
    console.error('[atualizarQuantidadeProduzida]', error)
    return { success: false, message: 'Não foi possível atualizar a produção.' }
  }
}

export async function registrarEntregaParcial(data: {
  operacaoId: string
  pedidoId: number
  quantidade: number
  entregueEm: string
  observacao: string
  registrarPagamento: boolean
  valorRecebido: number
  formaPagamento: string
}): Promise<{ success: boolean; message: string; entregaId?: number }> {
  try {
    const sessao = await exigirPerfil(['admin', 'operador'])
    let operacao: { resultado: 'CREATED' | 'UNCHANGED'; entregaId: number }
    try {
      operacao = registrarEntregaParcialNoBanco(db, sessao, data)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'INVALID_INPUT') return { success: false, message: 'Pedido ou quantidade inválida.' }
      if (message === 'INVALID_OPERATION_ID') return { success: false, message: 'Identificador da operação inválido. Reabra o formulário.' }
      if (message === 'INVALID_DATE') return { success: false, message: 'Data de entrega inválida.' }
      if (message === 'INVALID_NOTE') return { success: false, message: 'A observação deve ter no máximo 500 caracteres.' }
      if (message === 'INVALID_PAYMENT_METHOD') return { success: false, message: 'Forma de pagamento inválida.' }
      if (message === 'INVALID_PAYMENT_VALUE') return { success: false, message: 'Informe um valor recebido maior que zero.' }
      if (message === 'NOT_FOUND') return { success: false, message: 'Pedido não encontrado.' }
      if (message === 'INVALID_STATUS') return { success: false, message: 'A entrega exige um pedido aprovado e não cancelado.' }
      if (message.startsWith('OVER_DELIVERY:')) return { success: false, message: `A quantidade excede as ${message.split(':')[1]} unidade(s) ainda não entregues.` }
      if (message.startsWith('OVERPAYMENT:')) return { success: false, message: `O pagamento excede o saldo de R$ ${Number(message.split(':')[1]).toFixed(2).replace('.', ',')}.` }
      if (message === 'INSTALLMENTS_MISMATCH') return { success: false, message: 'As parcelas do pedido estão inconsistentes.' }
      if (message === 'OPERATION_CONFLICT') return { success: false, message: 'A operação já foi usada com outros dados. Reabra o formulário.' }
      throw error
    }
    revalidarPedido(data.pedidoId)
    const pedido = db.prepare('SELECT status FROM pedidos WHERE id = ? AND tenant_id = ?')
      .get(data.pedidoId, sessao.tenantId) as { status: string } | undefined
    return {
      success: true,
      message: operacao.resultado === 'UNCHANGED'
        ? 'Esta entrega já havia sido registrada.'
        : pedido?.status === 'Finalizado'
          ? 'Entrega registrada e pedido finalizado.'
          : 'Entrega parcial registrada sem finalizar o pedido.',
      entregaId: operacao.entregaId,
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'UNAUTHORIZED') return { success: false, message: 'Sua sessão expirou. Entre novamente.' }
    if (code === 'FORBIDDEN') return { success: false, message: 'Seu perfil não permite registrar entregas.' }
    console.error('[registrarEntregaParcial]', error)
    return { success: false, message: 'Não foi possível registrar a entrega.' }
  }
}

export async function estornarEntregaPedido(entregaId: number): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(entregaId) || entregaId <= 0) return { success: false, message: 'Entrega inválida.' }
    const sessao = await exigirPerfil(['admin', 'operador'])
    let pedidoId = 0
    const estornar = db.transaction(() => {
      const entrega = db.prepare(`
        SELECT id, pedido_id, recebimento_id, quantidade FROM entregas_pedido
        WHERE id = ? AND tenant_id = ? AND cancelada_em IS NULL
      `).get(entregaId, sessao.tenantId) as { id: number; pedido_id: number; recebimento_id: number | null; quantidade: number } | undefined
      if (!entrega) throw new Error('NOT_FOUND')
      pedidoId = entrega.pedido_id
      devolverSaidaProdutosAcabadosNoBanco(db, sessao, {
        pedidoId: entrega.pedido_id,
        entregaId,
        operacaoId: `estorno-entrega-${entregaId}`,
      })
      db.prepare(`UPDATE entregas_pedido SET cancelada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ? AND tenant_id = ?`).run(entregaId, sessao.tenantId)
      reconciliarPedidoEstoqueAposEstornoNoBanco(db, sessao, entrega.pedido_id)
      if (entrega.recebimento_id) {
        db.prepare(`
          UPDATE recebimentos SET estornado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            estorno_motivo = 'Estorno da entrega parcial vinculada'
          WHERE id = ? AND tenant_id = ? AND estornado_em IS NULL
        `).run(entrega.recebimento_id, sessao.tenantId)
        db.prepare(`UPDATE receitas_fiscais
          SET cancelada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE recebimento_id = ? AND tenant_id = ? AND cancelada_em IS NULL`
        ).run(entrega.recebimento_id, sessao.tenantId)
      }
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Entrega estornada', ?)
      `).run(
        sessao.tenantId, entrega.pedido_id, sessao.usuarioId,
        `${entrega.quantidade} unidade(s)${entrega.recebimento_id ? '; pagamento vinculado também estornado' : ''}`,
      )
      registrarAuditoria(db, {
        tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'Entrega', entidadeId: entregaId, acao: 'ESTORNAR',
        descricao: `Entrega do pedido #${entrega.pedido_id}`,
      })
    })
    try { estornar() } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') return { success: false, message: 'Entrega não encontrada.' }
      throw error
    }
    revalidarPedido(pedidoId)
    return { success: true, message: 'Entrega e pagamento vinculado foram estornados.' }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'UNAUTHORIZED') return { success: false, message: 'Sua sessão expirou. Entre novamente.' }
    if (code === 'FORBIDDEN') return { success: false, message: 'Seu perfil não permite estornar entregas.' }
    console.error('[estornarEntregaPedido]', error)
    return { success: false, message: 'Não foi possível estornar a entrega.' }
  }
}

export async function getComprovanteEntrega(entregaId: number): Promise<ComprovanteEntrega | null> {
  if (!Number.isSafeInteger(entregaId) || entregaId <= 0) return null
  const entrega = db.prepare(`
    SELECT e.id, e.quantidade, e.valor_referente, e.entregue_em, e.observacao,
      e.recebimento_id, r.valor AS valor_recebido, r.forma_pagamento,
      p.numero_orcamento, p.nome_da_peca, p.quantidade AS quantidade_total,
      p.valor_total_cobrado, c.nome AS cliente_nome,
      (SELECT COALESCE(SUM(e2.quantidade), 0) FROM entregas_pedido e2
        WHERE e2.pedido_id = p.id AND e2.cancelada_em IS NULL
          AND (date(e2.entregue_em) < date(e.entregue_em)
            OR (date(e2.entregue_em) = date(e.entregue_em) AND e2.id <= e.id))) AS quantidade_entregue_acumulada
    FROM entregas_pedido e
    JOIN pedidos p ON p.id = e.pedido_id AND p.tenant_id = e.tenant_id
    JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN recebimentos r ON r.id = e.recebimento_id AND r.estornado_em IS NULL
    WHERE e.id = ? AND e.tenant_id = ? AND e.cancelada_em IS NULL
  `).get(entregaId, TENANT_ID) as Omit<ComprovanteEntrega, 'quantidade_restante'> | undefined
  if (!entrega) return null
  return { ...entrega, quantidade_restante: entrega.quantidade_total - entrega.quantidade_entregue_acumulada }
}
