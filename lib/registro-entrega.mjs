import { calcularValorProporcional } from './entregas.mjs'
import { distribuirRecebimento } from './financeiro.mjs'
import { registrarReceitaFiscalDeRecebimento } from './receitas-fiscais.mjs'
import { confirmarSaidaProdutosAcabadosNoBanco } from './producao-estoque.mjs'

const FORMAS = {
  Pix: 'Pix', Dinheiro: 'Dinheiro',
  'Cartão Crédito': 'Cartao Credito', 'Cartao Credito': 'Cartao Credito',
  'Cartão Débito': 'Cartao Debito', 'Cartao Debito': 'Cartao Debito',
  Transferência: 'Transferencia', Transferencia: 'Transferencia', Outro: 'Outro',
}

const OPERACAO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function exigirOperador(contexto) {
  if (!contexto || !Number.isSafeInteger(contexto.tenantId) ||
      !Number.isSafeInteger(contexto.usuarioId)) throw new Error('UNAUTHORIZED')
  if (!['admin', 'operador'].includes(contexto.perfil)) throw new Error('FORBIDDEN')
}

function validarDados(data) {
  if (!data || !Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0 ||
      !Number.isSafeInteger(data.quantidade) || data.quantidade <= 0) throw new Error('INVALID_INPUT')
  if (!OPERACAO_RE.test(data.operacaoId || '')) throw new Error('INVALID_OPERATION_ID')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.entregueEm || '')) throw new Error('INVALID_DATE')
  if (typeof data.observacao !== 'string' || data.observacao.length > 500) throw new Error('INVALID_NOTE')
  if (typeof data.registrarPagamento !== 'boolean') throw new Error('INVALID_INPUT')
  const forma = FORMAS[data.formaPagamento]
  if (data.registrarPagamento && !forma) throw new Error('INVALID_PAYMENT_METHOD')
  if (data.registrarPagamento && (!Number.isFinite(data.valorRecebido) || data.valorRecebido <= 0)) {
    throw new Error('INVALID_PAYMENT_VALUE')
  }
  return forma
}

function mesmaOperacao(existente, data, forma) {
  const observacao = data.observacao.trim() || null
  const temPagamento = existente.recebimento_id !== null
  return existente.pedido_id === data.pedidoId &&
    existente.quantidade === data.quantidade &&
    existente.entregue_em === data.entregueEm &&
    existente.observacao === observacao &&
    temPagamento === data.registrarPagamento &&
    (!temPagamento || (
      Math.abs(existente.valor_recebido - data.valorRecebido) <= 0.001 &&
      existente.forma_pagamento === forma
    ))
}

function registrarAuditoria(db, contexto, entidade, entidadeId, acao, descricao) {
  db.prepare(`INSERT INTO auditoria
    (tenant_id, usuario_id, entidade, entidade_id, acao, descricao)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run(contexto.tenantId, contexto.usuarioId, entidade, entidadeId, acao, descricao)
}

/**
 * Registra entrega, eventual recebimento, alocações e receita fiscal em uma
 * única transação imediata. operacaoId torna o reenvio da mesma solicitação
 * idempotente sem impedir entregas distintas com os mesmos valores.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{tenantId: number, usuarioId: number, perfil: string}} contexto
 * @param {{
 *   operacaoId: string,
 *   pedidoId: number,
 *   quantidade: number,
 *   entregueEm: string,
 *   observacao: string,
 *   registrarPagamento: boolean,
 *   valorRecebido: number,
 *   formaPagamento: string,
 * }} data
 * @returns {{resultado: 'CREATED' | 'UNCHANGED', entregaId: number}}
 */
export function registrarEntregaParcialNoBanco(db, contexto, data) {
  exigirOperador(contexto)
  const forma = validarDados(data)

  return db.transaction(() => {
    const existente = db.prepare(`
      SELECT e.id, e.pedido_id, e.quantidade, e.entregue_em, e.observacao,
        e.recebimento_id, r.valor AS valor_recebido, r.forma_pagamento
      FROM entregas_pedido e
      LEFT JOIN recebimentos r ON r.id = e.recebimento_id AND r.tenant_id = e.tenant_id
      WHERE e.tenant_id = ? AND e.operacao_id = ?
    `).get(contexto.tenantId, data.operacaoId)
    if (existente) {
      if (!mesmaOperacao(existente, data, forma)) throw new Error('OPERATION_CONFLICT')
      return { resultado: 'UNCHANGED', entregaId: existente.id }
    }

    const pedido = db.prepare(`
      SELECT p.id, p.numero_orcamento, p.nome_da_peca, p.quantidade,
        p.quantidade_produzida, p.valor_total_cobrado, p.status, p.orcamento_status, p.atendimento_tipo,
        COALESCE((SELECT SUM(e.quantidade) FROM entregas_pedido e
          WHERE e.pedido_id = p.id AND e.tenant_id = p.tenant_id
            AND e.cancelada_em IS NULL), 0) AS quantidade_entregue,
        COALESCE((SELECT SUM(r.valor) FROM recebimentos r
          WHERE r.pedido_id = p.id AND r.tenant_id = p.tenant_id
            AND r.estornado_em IS NULL), 0) AS total_recebido
      FROM pedidos p WHERE p.id = ? AND p.tenant_id = ?
    `).get(data.pedidoId, contexto.tenantId)
    if (!pedido) throw new Error('NOT_FOUND')
    if (pedido.orcamento_status !== 'Aprovado' || pedido.status === 'Cancelado') {
      throw new Error('INVALID_STATUS')
    }
    const entregueDepois = pedido.quantidade_entregue + data.quantidade
    if (entregueDepois > pedido.quantidade) {
      throw new Error(`OVER_DELIVERY:${pedido.quantidade - pedido.quantidade_entregue}`)
    }

    const valorReferente = calcularValorProporcional(
      pedido.valor_total_cobrado, pedido.quantidade, data.quantidade,
    )
    let recebimentoId = null
    if (data.registrarPagamento) {
      const saldo = Math.round((pedido.valor_total_cobrado - pedido.total_recebido) * 100) / 100
      if (data.valorRecebido > saldo + 0.001) throw new Error(`OVERPAYMENT:${saldo}`)
      const parcelas = db.prepare(`
        SELECT pr.id, pr.valor,
          COALESCE((SELECT SUM(ra.valor) FROM recebimento_alocacoes ra
            JOIN recebimentos rx ON rx.id = ra.recebimento_id
            WHERE ra.parcela_id = pr.id AND rx.tenant_id = ?
              AND rx.estornado_em IS NULL), 0) AS recebido
        FROM parcelas_receber pr
        WHERE pr.pedido_id = ? AND pr.tenant_id = ? AND pr.cancelada_em IS NULL
        ORDER BY date(pr.vencimento_em), pr.numero
      `).all(contexto.tenantId, data.pedidoId, contexto.tenantId)
      const recebimento = db.prepare(`
        INSERT INTO recebimentos (
          tenant_id, pedido_id, valor, forma_pagamento, data_recebimento, observacao
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        contexto.tenantId, data.pedidoId, data.valorRecebido, forma, data.entregueEm,
        `Entrega parcial de ${data.quantidade} unidade(s)${data.observacao.trim() ? ` · ${data.observacao.trim()}` : ''}`,
      )
      recebimentoId = Number(recebimento.lastInsertRowid)
      const distribuicao = distribuirRecebimento(data.valorRecebido, parcelas)
      if (distribuicao.restante > 0.001) throw new Error('INSTALLMENTS_MISMATCH')
      const alocar = db.prepare(`INSERT INTO recebimento_alocacoes
        (recebimento_id, parcela_id, valor) VALUES (?, ?, ?)`)
      for (const item of distribuicao.alocacoes) {
        alocar.run(recebimentoId, item.parcelaId, item.valor)
      }
      registrarReceitaFiscalDeRecebimento(db, {
        tenantId: contexto.tenantId,
        usuarioId: contexto.usuarioId,
        recebimentoId,
        pedidoId: data.pedidoId,
      })
      registrarAuditoria(
        db, contexto, 'Recebimento', recebimentoId, 'CRIAR',
        `R$ ${data.valorRecebido.toFixed(2)} vinculados à entrega parcial do pedido #${data.pedidoId}`,
      )
    }

    const entrega = db.prepare(`
      INSERT INTO entregas_pedido (
        tenant_id, usuario_id, pedido_id, recebimento_id, quantidade,
        valor_referente, entregue_em, observacao, operacao_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contexto.tenantId, contexto.usuarioId, data.pedidoId, recebimentoId,
      data.quantidade, valorReferente, data.entregueEm,
      data.observacao.trim() || null, data.operacaoId,
    )
    const entregaId = Number(entrega.lastInsertRowid)
    if (pedido.atendimento_tipo === 'Estoque') {
      confirmarSaidaProdutosAcabadosNoBanco(db, contexto, {
        pedidoId: data.pedidoId,
        quantidade: data.quantidade,
        operacaoId: `entrega-${data.operacaoId}`,
        entregaId,
      })
    }
    if (pedido.atendimento_tipo === 'Estoque') {
      db.prepare(`UPDATE pedidos SET
          status = CASE WHEN ? >= quantidade THEN 'Finalizado' ELSE 'Acabamento' END,
          data_conclusao = CASE WHEN ? >= quantidade THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE data_conclusao END
        WHERE id = ? AND tenant_id = ?`
      ).run(entregueDepois, entregueDepois, data.pedidoId, contexto.tenantId)
    } else {
      const produzidaDepois = Math.max(pedido.quantidade_produzida, entregueDepois)
      db.prepare(`UPDATE pedidos SET quantidade_produzida = ?
        WHERE id = ? AND tenant_id = ?`
      ).run(produzidaDepois, data.pedidoId, contexto.tenantId)
    }
    db.prepare(`INSERT INTO historico_pedidos
      (tenant_id, pedido_id, usuario_id, evento, descricao)
      VALUES (?, ?, ?, 'Entrega parcial', ?)`
    ).run(
      contexto.tenantId, data.pedidoId, contexto.usuarioId,
      `${data.quantidade} unidade(s) entregues · acumulado ${entregueDepois}/${pedido.quantidade}` +
        `${recebimentoId ? ` · recebido R$ ${data.valorRecebido.toFixed(2)}` : ''}`,
    )
    registrarAuditoria(
      db, contexto, 'Entrega', entregaId, 'CRIAR',
      `${pedido.numero_orcamento ?? `#${pedido.id}`} · ${data.quantidade} unidade(s)`,
    )
    return { resultado: 'CREATED', entregaId }
  }).immediate()
}
