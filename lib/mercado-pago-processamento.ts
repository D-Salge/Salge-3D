import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { distribuirRecebimento } from '@/lib/financeiro.mjs'
import { calcularLiquidacaoMercadoPago } from '@/lib/mercado-pago.mjs'

export type PagamentoMercadoPago = {
  id: number
  status: string
  status_detail?: string
  external_reference?: string
  transaction_amount?: number
  payment_method_id?: string
  payment_type_id?: string
  date_approved?: string
  transaction_details?: { net_received_amount?: number }
  fee_details?: Array<{ type?: string; amount?: number }>
}

export type ResultadoProcessamentoMercadoPago = {
  duplicado: boolean
  status: string
  valor: number | null
}

const statusInterno = (status: string) => ({
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  refunded: 'Reembolsado',
  charged_back: 'Reembolsado',
}[status] || 'Pendente')

export function processarPagamentoMercadoPago(
  pagamento: PagamentoMercadoPago,
  payload: unknown,
  acao: string | null,
): ResultadoProcessamentoMercadoPago {
  const pagamentoId = String(pagamento.id)
  const chaveEvento = `${pagamentoId}:${pagamento.status}:${pagamento.status_detail || ''}`
  const existente = db.prepare('SELECT id FROM mercado_pago_eventos WHERE evento_chave = ?').get(chaveEvento)
  if (existente) {
    return { duplicado: true, status: statusInterno(pagamento.status), valor: null }
  }

  let resultado: ResultadoProcessamentoMercadoPago = {
    duplicado: false,
    status: statusInterno(pagamento.status),
    valor: null,
  }
  const processar = db.transaction(() => {
    db.prepare(`INSERT INTO mercado_pago_eventos
      (evento_chave, recurso_id, tipo, acao, payload_json)
      VALUES (?, ?, 'payment', ?, ?)`
    ).run(chaveEvento, pagamentoId, acao, JSON.stringify(payload).slice(0, 100_000))
    const cobranca = db.prepare(`
      SELECT mc.*, p.usuario_id, p.valor_total_cobrado, p.numero_orcamento, p.nome_da_peca,
        t.mei_natureza_padrao,
        COALESCE((SELECT SUM(r.valor) FROM recebimentos r
          WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS recebido
      FROM mercado_pago_cobrancas mc
      JOIN pedidos p ON p.id = mc.pedido_id AND p.tenant_id = mc.tenant_id
      JOIN tenants t ON t.id = mc.tenant_id
      WHERE mc.external_reference = ?
    `).get(pagamento.external_reference || '') as {
      id: number; tenant_id: number; pedido_id: number; usuario_id: number; valor: number
      valor_total_cobrado: number; recebido: number; numero_orcamento: string | null
      nome_da_peca: string; mei_natureza_padrao: 'Venda' | 'Serviço'; despesa_taxa_id: number | null
    } | undefined
    if (!cobranca) throw new Error('COBRANCA_NOT_FOUND')
    const status = statusInterno(pagamento.status)
    const liquidacao = status === 'Aprovado' ? calcularLiquidacaoMercadoPago(pagamento) : null
    db.prepare(`UPDATE mercado_pago_cobrancas SET status = ?, pagamento_id = ?,
      status_detalhe = ?, forma_pagamento = ?, pago_em = ?,
      valor_liquido = COALESCE(?, valor_liquido), taxa_valor = COALESCE(?, taxa_valor),
      atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`
    ).run(status, pagamentoId, pagamento.status_detail || null,
      pagamento.payment_method_id || pagamento.payment_type_id || null,
      pagamento.date_approved || null, liquidacao?.liquido ?? null, liquidacao?.taxa ?? null, cobranca.id)

    if (status === 'Aprovado') {
      const valor = liquidacao!.bruto
      const saldo = Math.round((cobranca.valor_total_cobrado - cobranca.recebido) * 100) / 100
      if (!Number.isFinite(valor) || valor <= 0 || valor > saldo + 0.001 || Math.abs(valor - cobranca.valor) > 0.01) {
        throw new Error(`VALUE_MISMATCH:${valor}:${saldo}`)
      }
      const jaRecebido = db.prepare('SELECT id FROM recebimentos WHERE mercado_pago_pagamento_id = ?').get(pagamentoId)
      if (!jaRecebido) {
        const dataRecebimento = (pagamento.date_approved || new Date().toISOString()).slice(0, 10)
        const result = db.prepare(`INSERT INTO recebimentos (
          tenant_id, pedido_id, valor, forma_pagamento, data_recebimento, observacao, mercado_pago_pagamento_id
        ) VALUES (?, ?, ?, 'Outro', ?, ?, ?)`
        ).run(cobranca.tenant_id, cobranca.pedido_id, valor, dataRecebimento,
          `Baixa automática Mercado Pago · ${pagamento.payment_method_id || pagamento.payment_type_id || 'pagamento online'}`,
          pagamentoId)
        const recebimentoId = Number(result.lastInsertRowid)
        const parcelas = db.prepare(`SELECT pr.id, pr.valor,
          COALESCE((SELECT SUM(ra.valor) FROM recebimento_alocacoes ra
            JOIN recebimentos rx ON rx.id = ra.recebimento_id
            WHERE ra.parcela_id = pr.id AND rx.estornado_em IS NULL), 0) AS recebido
          FROM parcelas_receber pr WHERE pr.pedido_id = ? AND pr.cancelada_em IS NULL
          ORDER BY date(pr.vencimento_em), pr.numero`
        ).all(cobranca.pedido_id) as { id: number; valor: number; recebido: number }[]
        const distribuicao = distribuirRecebimento(valor, parcelas)
        if (distribuicao.restante > 0.001) throw new Error('INSTALLMENTS_MISMATCH')
        const alocar = db.prepare('INSERT INTO recebimento_alocacoes (recebimento_id, parcela_id, valor) VALUES (?, ?, ?)')
        for (const item of distribuicao.alocacoes) alocar.run(recebimentoId, item.parcelaId, item.valor)
        db.prepare(`INSERT INTO receitas_fiscais (
          tenant_id, usuario_id, recebimento_id, data_competencia, natureza, origem, descricao, valor
        ) VALUES (?, ?, ?, ?, ?, 'ERP', ?, ?)`
        ).run(cobranca.tenant_id, cobranca.usuario_id, recebimentoId, dataRecebimento,
          cobranca.mei_natureza_padrao,
          `Mercado Pago ${cobranca.numero_orcamento || `#${cobranca.pedido_id}`} — ${cobranca.nome_da_peca}`, valor)
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
      if (liquidacao!.taxa > 0 && cobranca.despesa_taxa_id === null) {
        const dataTaxa = (pagamento.date_approved || new Date().toISOString()).slice(0, 10)
        const despesa = db.prepare(`INSERT INTO despesas (
          tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
          competencia_em, vencimento_em, pago_em, forma_pagamento, codigo_externo,
          fornecedor, tipo_origem, status_origem, pedido_id, observacoes_origem
        ) VALUES (?, ?, 'Outros', ?, ?, ?, ?, ?, ?, 'Débito automático', ?,
          'Mercado Pago', 'Taxa de pagamento', 'Pago', ?, ?)`
        ).run(
          cobranca.tenant_id, cobranca.usuario_id, `Taxa Mercado Pago · pagamento ${pagamentoId}`,
          liquidacao!.taxa, dataTaxa, dataTaxa, dataTaxa, dataTaxa, `MP-TAXA-${pagamentoId}`,
          cobranca.pedido_id, `Bruto R$ ${valor.toFixed(2)} · líquido R$ ${liquidacao!.liquido.toFixed(2)}`,
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
          descricao: `Taxa Mercado Pago ${pagamentoId} · R$ ${liquidacao!.taxa.toFixed(2)}`,
        })
      }
      resultado = { duplicado: false, status, valor }
    } else if (status === 'Reembolsado') {
      const recebimento = db.prepare('SELECT id FROM recebimentos WHERE mercado_pago_pagamento_id = ? AND estornado_em IS NULL').get(pagamentoId) as { id: number } | undefined
      if (recebimento) {
        db.prepare(`UPDATE recebimentos SET estornado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          estorno_motivo = 'Reembolso/contestação informado pelo Mercado Pago' WHERE id = ?`).run(recebimento.id)
        db.prepare(`UPDATE receitas_fiscais SET cancelada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE recebimento_id = ? AND cancelada_em IS NULL`).run(recebimento.id)
      }
    }
    db.prepare(`UPDATE mercado_pago_eventos SET processado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE evento_chave = ?`).run(chaveEvento)
  })
  processar.immediate()
  return resultado
}
