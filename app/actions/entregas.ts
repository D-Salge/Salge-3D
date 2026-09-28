'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularValorProporcional } from '@/lib/entregas.mjs'
import { distribuirRecebimento } from '@/lib/financeiro.mjs'
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

const FORMAS: Record<string, string> = {
  Pix: 'Pix', Dinheiro: 'Dinheiro',
  'Cartão Crédito': 'Cartao Credito', 'Cartao Credito': 'Cartao Credito',
  'Cartão Débito': 'Cartao Debito', 'Cartao Debito': 'Cartao Debito',
  Transferência: 'Transferencia', Transferencia: 'Transferencia', Outro: 'Outro',
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
  pedidoId: number
  quantidade: number
  entregueEm: string
  observacao: string
  registrarPagamento: boolean
  valorRecebido: number
  formaPagamento: string
}): Promise<{ success: boolean; message: string; entregaId?: number }> {
  try {
    if (!Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0 || !Number.isSafeInteger(data.quantidade) || data.quantidade <= 0) {
      return { success: false, message: 'Pedido ou quantidade inválida.' }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.entregueEm)) return { success: false, message: 'Data de entrega inválida.' }
    if (data.observacao.length > 500) return { success: false, message: 'A observação deve ter no máximo 500 caracteres.' }
    const forma = FORMAS[data.formaPagamento]
    if (data.registrarPagamento && !forma) return { success: false, message: 'Forma de pagamento inválida.' }
    if (data.registrarPagamento && (!Number.isFinite(data.valorRecebido) || data.valorRecebido <= 0)) {
      return { success: false, message: 'Informe um valor recebido maior que zero.' }
    }

    let entregaId = 0
    const registrar = db.transaction(() => {
      const pedido = db.prepare(`
        SELECT p.id, p.numero_orcamento, p.nome_da_peca, p.quantidade,
          p.quantidade_produzida, p.valor_total_cobrado, p.status, p.orcamento_status,
          COALESCE((SELECT SUM(e.quantidade) FROM entregas_pedido e
            WHERE e.pedido_id = p.id AND e.cancelada_em IS NULL), 0) AS quantidade_entregue,
          COALESCE((SELECT SUM(r.valor) FROM recebimentos r
            WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS total_recebido
        FROM pedidos p WHERE p.id = ? AND p.tenant_id = ?
      `).get(data.pedidoId, TENANT_ID) as {
        id: number; numero_orcamento: string | null; nome_da_peca: string
        quantidade: number; quantidade_produzida: number; quantidade_entregue: number
        valor_total_cobrado: number; total_recebido: number; status: string; orcamento_status: string
      } | undefined
      if (!pedido) throw new Error('NOT_FOUND')
      if (pedido.orcamento_status !== 'Aprovado' || pedido.status === 'Cancelado') throw new Error('INVALID_STATUS')
      const entregueDepois = pedido.quantidade_entregue + data.quantidade
      if (entregueDepois > pedido.quantidade) throw new Error(`OVER_DELIVERY:${pedido.quantidade - pedido.quantidade_entregue}`)
      const valorReferente = calcularValorProporcional(pedido.valor_total_cobrado, pedido.quantidade, data.quantidade)
      let recebimentoId: number | null = null

      if (data.registrarPagamento) {
        const saldo = Math.round((pedido.valor_total_cobrado - pedido.total_recebido) * 100) / 100
        if (data.valorRecebido > saldo + 0.001) throw new Error(`OVERPAYMENT:${saldo}`)
        const parcelas = db.prepare(`
          SELECT pr.id, pr.valor,
            COALESCE((SELECT SUM(ra.valor) FROM recebimento_alocacoes ra
              JOIN recebimentos rx ON rx.id = ra.recebimento_id
              WHERE ra.parcela_id = pr.id AND rx.estornado_em IS NULL), 0) AS recebido
          FROM parcelas_receber pr
          WHERE pr.pedido_id = ? AND pr.cancelada_em IS NULL
          ORDER BY date(pr.vencimento_em), pr.numero
        `).all(data.pedidoId) as { id: number; valor: number; recebido: number }[]
        const recebimento = db.prepare(`
          INSERT INTO recebimentos (tenant_id, pedido_id, valor, forma_pagamento, data_recebimento, observacao)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          TENANT_ID, data.pedidoId, data.valorRecebido, forma, data.entregueEm,
          `Entrega parcial de ${data.quantidade} unidade(s)${data.observacao.trim() ? ` · ${data.observacao.trim()}` : ''}`,
        )
        recebimentoId = Number(recebimento.lastInsertRowid)
        const distribuicao = distribuirRecebimento(data.valorRecebido, parcelas)
        if (distribuicao.restante > 0.001) throw new Error('INSTALLMENTS_MISMATCH')
        const alocar = db.prepare(`INSERT INTO recebimento_alocacoes (recebimento_id, parcela_id, valor) VALUES (?, ?, ?)`)
        for (const item of distribuicao.alocacoes) alocar.run(recebimentoId, item.parcelaId, item.valor)
        registrarAuditoria(db, {
          entidade: 'Recebimento', entidadeId: recebimentoId, acao: 'CRIAR',
          descricao: `R$ ${data.valorRecebido.toFixed(2)} vinculados à entrega parcial do pedido #${data.pedidoId}`,
        })
      }

      const entrega = db.prepare(`
        INSERT INTO entregas_pedido (
          tenant_id, usuario_id, pedido_id, recebimento_id, quantidade,
          valor_referente, entregue_em, observacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        TENANT_ID, USUARIO_ID, data.pedidoId, recebimentoId, data.quantidade,
        valorReferente, data.entregueEm, data.observacao.trim() || null,
      )
      entregaId = Number(entrega.lastInsertRowid)
      const produzidaDepois = Math.max(pedido.quantidade_produzida, entregueDepois)
      db.prepare(`UPDATE pedidos SET quantidade_produzida = ? WHERE id = ? AND tenant_id = ?`)
        .run(produzidaDepois, data.pedidoId, TENANT_ID)
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Entrega parcial', ?)
      `).run(
        TENANT_ID, data.pedidoId, USUARIO_ID,
        `${data.quantidade} unidade(s) entregues · acumulado ${entregueDepois}/${pedido.quantidade}${recebimentoId ? ` · recebido R$ ${data.valorRecebido.toFixed(2)}` : ''}`,
      )
      registrarAuditoria(db, {
        entidade: 'Entrega', entidadeId: entregaId, acao: 'CRIAR',
        descricao: `${pedido.numero_orcamento ?? `#${pedido.id}`} · ${data.quantidade} unidade(s)`,
      })
    })

    try { registrar() } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'NOT_FOUND') return { success: false, message: 'Pedido não encontrado.' }
      if (message === 'INVALID_STATUS') return { success: false, message: 'A entrega exige um pedido aprovado e não cancelado.' }
      if (message.startsWith('OVER_DELIVERY:')) return { success: false, message: `A quantidade excede as ${message.split(':')[1]} unidade(s) ainda não entregues.` }
      if (message.startsWith('OVERPAYMENT:')) return { success: false, message: `O pagamento excede o saldo de R$ ${Number(message.split(':')[1]).toFixed(2).replace('.', ',')}.` }
      if (message === 'INSTALLMENTS_MISMATCH') return { success: false, message: 'As parcelas do pedido estão inconsistentes.' }
      throw error
    }
    revalidarPedido(data.pedidoId)
    return { success: true, message: 'Entrega parcial registrada sem finalizar o pedido.', entregaId }
  } catch (error) {
    console.error('[registrarEntregaParcial]', error)
    return { success: false, message: 'Não foi possível registrar a entrega.' }
  }
}

export async function estornarEntregaPedido(entregaId: number): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(entregaId) || entregaId <= 0) return { success: false, message: 'Entrega inválida.' }
    let pedidoId = 0
    const estornar = db.transaction(() => {
      const entrega = db.prepare(`
        SELECT id, pedido_id, recebimento_id, quantidade FROM entregas_pedido
        WHERE id = ? AND tenant_id = ? AND cancelada_em IS NULL
      `).get(entregaId, TENANT_ID) as { id: number; pedido_id: number; recebimento_id: number | null; quantidade: number } | undefined
      if (!entrega) throw new Error('NOT_FOUND')
      pedidoId = entrega.pedido_id
      db.prepare(`UPDATE entregas_pedido SET cancelada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).run(entregaId)
      if (entrega.recebimento_id) {
        db.prepare(`
          UPDATE recebimentos SET estornado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            estorno_motivo = 'Estorno da entrega parcial vinculada'
          WHERE id = ? AND tenant_id = ? AND estornado_em IS NULL
        `).run(entrega.recebimento_id, TENANT_ID)
      }
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Entrega estornada', ?)
      `).run(
        TENANT_ID, entrega.pedido_id, USUARIO_ID,
        `${entrega.quantidade} unidade(s)${entrega.recebimento_id ? '; pagamento vinculado também estornado' : ''}`,
      )
      registrarAuditoria(db, { entidade: 'Entrega', entidadeId: entregaId, acao: 'ESTORNAR', descricao: `Entrega do pedido #${entrega.pedido_id}` })
    })
    try { estornar() } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') return { success: false, message: 'Entrega não encontrada.' }
      throw error
    }
    revalidarPedido(pedidoId)
    return { success: true, message: 'Entrega e pagamento vinculado foram estornados.' }
  } catch (error) {
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
