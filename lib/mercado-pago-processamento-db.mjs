import { distribuirRecebimento } from './financeiro.mjs'
import { calcularLiquidacaoMercadoPago } from './mercado-pago.mjs'
import { registrarReceitaFiscalDeRecebimento } from './receitas-fiscais.mjs'
import { classificarRecebimentoAutomatico, percentualDoPedido } from './sinal.mjs'

export const statusInternoMercadoPago = (status) => ({
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  refunded: 'Reembolsado',
  charged_back: 'Reembolsado',
}[status] || 'Pendente')

function registrarAuditoria(db, dados) {
  db.prepare(`
    INSERT INTO auditoria (
      tenant_id, usuario_id, entidade, entidade_id, acao, descricao, dados_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    dados.tenantId,
    dados.usuarioId,
    dados.entidade,
    dados.entidadeId ?? null,
    dados.acao,
    dados.descricao,
    dados.detalhes === undefined ? null : JSON.stringify(dados.detalhes),
  )
}

function validarAssociacoes(db, cobranca, recebimento, pagamentoId) {
  const cobrancaDoPagamento = db.prepare(`
    SELECT id, tenant_id, pedido_id
    FROM mercado_pago_cobrancas
    WHERE pagamento_id = ?
  `).get(pagamentoId)

  if (cobrancaDoPagamento && cobrancaDoPagamento.id !== cobranca.id) {
    throw new Error('PAYMENT_ASSOCIATION_MISMATCH:CHARGE')
  }
  if (recebimento && (
    recebimento.tenant_id !== cobranca.tenant_id
    || recebimento.pedido_id !== cobranca.pedido_id
  )) {
    throw new Error('PAYMENT_ASSOCIATION_MISMATCH:RECEIPT')
  }
  if (recebimento && cobranca.pagamento_id && cobranca.pagamento_id !== pagamentoId) {
    throw new Error('PAYMENT_ASSOCIATION_MISMATCH:CHARGE_PAYMENT')
  }
  if (
    !recebimento
    && cobranca.pagamento_id
    && cobranca.pagamento_id !== pagamentoId
    && ['Aprovado', 'Reembolsado'].includes(cobranca.status)
  ) {
    throw new Error('PAYMENT_ASSOCIATION_MISMATCH:CHARGE_PAYMENT')
  }
  if (cobranca.despesa_taxa_id !== null) {
    const despesaTaxa = db.prepare(`
      SELECT tenant_id, pedido_id, codigo_externo
      FROM despesas
      WHERE id = ?
    `).get(cobranca.despesa_taxa_id)
    if (
      !despesaTaxa
      || despesaTaxa.tenant_id !== cobranca.tenant_id
      || despesaTaxa.pedido_id !== cobranca.pedido_id
      || despesaTaxa.codigo_externo !== `MP-TAXA-${pagamentoId}`
    ) {
      throw new Error('PAYMENT_ASSOCIATION_MISMATCH:FEE')
    }
  }
}

function atualizarCobranca(db, cobrancaId, pagamentoId, pagamento, status, liquidacao) {
  db.prepare(`UPDATE mercado_pago_cobrancas SET status = ?, pagamento_id = ?,
    status_detalhe = ?, forma_pagamento = ?, pago_em = ?,
    valor_liquido = COALESCE(?, valor_liquido), taxa_valor = COALESCE(?, taxa_valor),
    atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`
  ).run(status, pagamentoId, pagamento.status_detail || null,
    pagamento.payment_method_id || pagamento.payment_type_id || null,
    pagamento.date_approved || null, liquidacao?.liquido ?? null,
    liquidacao?.taxa ?? null, cobrancaId)
}

function criarRecebimento(db, cobranca, pagamento, pagamentoId, liquidacao) {
  const valor = liquidacao.bruto
  const saldo = Math.round((cobranca.valor_total_cobrado - cobranca.recebido) * 100) / 100
  if (!Number.isFinite(valor) || valor <= 0 || valor > saldo + 0.001 || Math.abs(valor - cobranca.valor) > 0.01) {
    throw new Error(`VALUE_MISMATCH:${valor}:${saldo}`)
  }

  const dataRecebimento = (pagamento.date_approved || new Date().toISOString()).slice(0, 10)
  const tipoRecebimento = classificarRecebimentoAutomatico({
    valor, saldo, valorTotal: cobranca.valor_total_cobrado,
    sinalPercentual: cobranca.sinal_percentual, sinalRecebido: cobranca.sinal_recebido,
  })
  const result = db.prepare(`INSERT INTO recebimentos (
    tenant_id, pedido_id, valor, forma_pagamento, data_recebimento, observacao,
    mercado_pago_pagamento_id, tipo_recebimento
  ) VALUES (?, ?, ?, 'Outro', ?, ?, ?, ?)`
  ).run(cobranca.tenant_id, cobranca.pedido_id, valor, dataRecebimento,
    `${tipoRecebimento === 'Sinal' ? `Sinal de ${percentualDoPedido(valor, cobranca.valor_total_cobrado).toFixed(2).replace('.', ',')}% · ` : ''}Baixa automática Mercado Pago · ${pagamento.payment_method_id || pagamento.payment_type_id || 'pagamento online'}`,
    pagamentoId, tipoRecebimento)
  const recebimentoId = Number(result.lastInsertRowid)
  const parcelas = db.prepare(`SELECT pr.id, pr.valor,
    COALESCE((SELECT SUM(ra.valor) FROM recebimento_alocacoes ra
      JOIN recebimentos rx ON rx.id = ra.recebimento_id
      WHERE ra.parcela_id = pr.id AND rx.estornado_em IS NULL), 0) AS recebido
    FROM parcelas_receber pr WHERE pr.pedido_id = ? AND pr.cancelada_em IS NULL
    ORDER BY date(pr.vencimento_em), pr.numero`
  ).all(cobranca.pedido_id)
  const distribuicao = distribuirRecebimento(valor, parcelas)
  if (distribuicao.restante > 0.001) throw new Error('INSTALLMENTS_MISMATCH')
  const alocar = db.prepare('INSERT INTO recebimento_alocacoes (recebimento_id, parcela_id, valor) VALUES (?, ?, ?)')
  for (const item of distribuicao.alocacoes) alocar.run(recebimentoId, item.parcelaId, item.valor)
  registrarReceitaFiscalDeRecebimento(db, {
    tenantId: cobranca.tenant_id,
    usuarioId: cobranca.usuario_id,
    recebimentoId,
    pedidoId: cobranca.pedido_id,
    prefixoDescricao: 'Mercado Pago',
  })
  db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
    VALUES (?, ?, ?, 'Pagamento confirmado', ?)`
  ).run(cobranca.tenant_id, cobranca.pedido_id, cobranca.usuario_id,
    `Mercado Pago confirmou R$ ${valor.toFixed(2)} (pagamento ${pagamentoId}).`)
  registrarAuditoria(db, {
    tenantId: cobranca.tenant_id,
    usuarioId: cobranca.usuario_id,
    entidade: 'Recebimento',
    entidadeId: recebimentoId,
    acao: 'CRIAR_AUTOMATICO',
    descricao: `Mercado Pago ${pagamentoId}`,
  })
}

function criarDespesaDaTaxa(db, cobranca, pagamento, pagamentoId, liquidacao) {
  if (liquidacao.taxa <= 0) return
  const dataTaxa = (pagamento.date_approved || new Date().toISOString()).slice(0, 10)
  const despesa = db.prepare(`INSERT INTO despesas (
    tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
    competencia_em, vencimento_em, pago_em, forma_pagamento, codigo_externo,
    fornecedor, tipo_origem, status_origem, pedido_id, observacoes_origem
  ) VALUES (?, ?, 'Outros', ?, ?, ?, ?, ?, ?, 'Débito automático', ?,
    'Mercado Pago', 'Taxa de pagamento', 'Pago', ?, ?)`
  ).run(
    cobranca.tenant_id, cobranca.usuario_id, `Taxa Mercado Pago · pagamento ${pagamentoId}`,
    liquidacao.taxa, dataTaxa, dataTaxa, dataTaxa, dataTaxa, `MP-TAXA-${pagamentoId}`,
    cobranca.pedido_id, `Bruto R$ ${liquidacao.bruto.toFixed(2)} · líquido R$ ${liquidacao.liquido.toFixed(2)}`,
  )
  const despesaId = Number(despesa.lastInsertRowid)
  db.prepare('UPDATE mercado_pago_cobrancas SET despesa_taxa_id = ? WHERE id = ?')
    .run(despesaId, cobranca.id)
  registrarAuditoria(db, {
    tenantId: cobranca.tenant_id,
    usuarioId: cobranca.usuario_id,
    entidade: 'Despesa',
    entidadeId: despesaId,
    acao: 'CRIAR_AUTOMATICO',
    descricao: `Taxa Mercado Pago ${pagamentoId} · R$ ${liquidacao.taxa.toFixed(2)}`,
  })
}

/**
 * Processa um evento confirmado pela API do Mercado Pago.
 * A transação IMMEDIATE serializa a identificação e todos os efeitos do pagamento.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Record<string, any>} pagamento
 * @param {unknown} payload
 * @param {string | null} acao
 */
export function processarPagamentoMercadoPagoNoBanco(db, pagamento, payload, acao) {
  const pagamentoId = String(pagamento.id)
  const chaveEvento = `${pagamentoId}:${pagamento.status}:${pagamento.status_detail || ''}`
  const status = statusInternoMercadoPago(pagamento.status)

  const processar = db.transaction(() => {
    const eventoExistente = db.prepare(
      'SELECT id FROM mercado_pago_eventos WHERE evento_chave = ?',
    ).get(chaveEvento)
    if (eventoExistente) return { duplicado: true, status, valor: null }

    db.prepare(`INSERT INTO mercado_pago_eventos
      (evento_chave, recurso_id, tipo, acao, payload_json)
      VALUES (?, ?, 'payment', ?, ?)`
    ).run(chaveEvento, pagamentoId, acao, JSON.stringify(payload).slice(0, 100_000))

    const cobranca = db.prepare(`
      SELECT mc.*, p.usuario_id, p.valor_total_cobrado, p.sinal_percentual,
        p.numero_orcamento, p.nome_da_peca,
        COALESCE((SELECT SUM(r.valor) FROM recebimentos r
          WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS recebido,
        COALESCE((SELECT SUM(r.valor) FROM recebimentos r
          WHERE r.pedido_id = p.id AND r.estornado_em IS NULL AND r.tipo_recebimento = 'Sinal'), 0) AS sinal_recebido
      FROM mercado_pago_cobrancas mc
      JOIN pedidos p ON p.id = mc.pedido_id AND p.tenant_id = mc.tenant_id
      WHERE mc.external_reference = ?
    `).get(pagamento.external_reference || '')
    if (!cobranca) throw new Error('COBRANCA_NOT_FOUND')

    const recebimento = db.prepare(`
      SELECT id, tenant_id, pedido_id, valor, estornado_em
      FROM recebimentos
      WHERE mercado_pago_pagamento_id = ?
    `).get(pagamentoId)
    validarAssociacoes(db, cobranca, recebimento, pagamentoId)

    const liquidacao = status === 'Aprovado' ? calcularLiquidacaoMercadoPago(pagamento) : null
    if (status === 'Aprovado' && recebimento) {
      if (
        Math.abs(liquidacao.bruto - recebimento.valor) > 0.01
        || Math.abs(liquidacao.bruto - cobranca.valor) > 0.01
      ) {
        throw new Error('PAYMENT_ASSOCIATION_MISMATCH:AMOUNT')
      }
      if (!recebimento.estornado_em) {
        atualizarCobranca(db, cobranca.id, pagamentoId, pagamento, status, liquidacao)
      }
      db.prepare(`UPDATE mercado_pago_eventos
        SET processado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE evento_chave = ?`).run(chaveEvento)
      return { duplicado: true, status, valor: recebimento.valor }
    }

    atualizarCobranca(db, cobranca.id, pagamentoId, pagamento, status, liquidacao)
    if (status === 'Aprovado') {
      criarRecebimento(db, cobranca, pagamento, pagamentoId, liquidacao)
      if (cobranca.despesa_taxa_id === null) {
        criarDespesaDaTaxa(db, cobranca, pagamento, pagamentoId, liquidacao)
      }
    } else if (status === 'Reembolsado' && recebimento && !recebimento.estornado_em) {
      db.prepare(`UPDATE recebimentos SET estornado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        estorno_motivo = 'Reembolso/contestação informado pelo Mercado Pago' WHERE id = ?`
      ).run(recebimento.id)
      db.prepare(`UPDATE receitas_fiscais SET cancelada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE recebimento_id = ? AND cancelada_em IS NULL`).run(recebimento.id)
    }

    db.prepare(`UPDATE mercado_pago_eventos
      SET processado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE evento_chave = ?`).run(chaveEvento)
    return {
      duplicado: false,
      status,
      valor: status === 'Aprovado' ? liquidacao.bruto : null,
    }
  })

  return processar.immediate()
}
