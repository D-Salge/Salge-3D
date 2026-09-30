import { createHmac, timingSafeEqual } from 'node:crypto'

const API_BASE = 'https://api.mercadopago.com'

export function configuracaoMercadoPago(env = process.env) {
  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN?.trim() || ''
  const webhookSecret = env.MERCADO_PAGO_WEBHOOK_SECRET?.trim() || ''
  const appUrl = env.APP_URL?.trim().replace(/\/$/, '') || ''
  const ausentes = []
  if (!accessToken) ausentes.push('MERCADO_PAGO_ACCESS_TOKEN')
  if (!webhookSecret) ausentes.push('MERCADO_PAGO_WEBHOOK_SECRET')
  if (!appUrl.startsWith('https://')) ausentes.push('APP_URL (HTTPS)')
  return {
    accessToken,
    webhookSecret,
    appUrl,
    testMode: env.MERCADO_PAGO_TEST_MODE === 'true',
    configurado: ausentes.length === 0,
    ausentes,
  }
}

export function validarAssinaturaMercadoPago({ assinatura, requestId, dataId, secret }) {
  if (!assinatura || !requestId || !dataId || !secret) return false
  const partes = Object.fromEntries(assinatura.split(',').map((parte) => {
    const [chave, ...valor] = parte.trim().split('=')
    return [chave, valor.join('=')]
  }))
  if (!partes.ts || !partes.v1) return false
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${partes.ts};`
  const esperado = createHmac('sha256', secret).update(manifesto).digest('hex')
  const recebido = partes.v1.toLowerCase()
  if (esperado.length !== recebido.length) return false
  return timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))
}

export function montarPreferenciaMercadoPago({ pedido, externalReference, appUrl, incluirWebhook = true }) {
  const retorno = `${appUrl}/pagamento/retorno`
  return {
    items: [{
      id: String(pedido.id),
      title: `${pedido.numero_orcamento || `Pedido #${pedido.id}`} — ${pedido.nome_da_peca}`.slice(0, 120),
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Math.round(pedido.saldo_pendente * 100) / 100,
    }],
    payer: pedido.cliente_email ? { email: pedido.cliente_email } : undefined,
    external_reference: externalReference,
    ...(incluirWebhook ? { notification_url: `${appUrl}/api/webhooks/mercado-pago` } : {}),
    back_urls: {
      success: `${retorno}?resultado=sucesso`,
      pending: `${retorno}?resultado=pendente`,
      failure: `${retorno}?resultado=falha`,
    },
    auto_return: 'approved',
    statement_descriptor: 'SALGE 3D',
    metadata: { pedido_id: pedido.id },
  }
}

export function normalizarValorCobranca(valorSolicitado, saldoPendente) {
  const saldoCentavos = Math.round(Number(saldoPendente) * 100)
  const valorCentavos = Math.round(Number(valorSolicitado) * 100)
  if (!Number.isFinite(valorCentavos) || valorCentavos < 1) {
    throw new Error('PAYMENT_AMOUNT_INVALID')
  }
  if (!Number.isFinite(saldoCentavos) || saldoCentavos < 1 || valorCentavos > saldoCentavos) {
    throw new Error('PAYMENT_AMOUNT_EXCEEDS_BALANCE')
  }
  return valorCentavos / 100
}

export function calcularLiquidacaoMercadoPago(pagamento) {
  const arredondar = (valor) => Math.round(Number(valor) * 100) / 100
  const bruto = arredondar(pagamento?.transaction_amount)
  if (!Number.isFinite(bruto) || bruto <= 0) throw new Error('PAYMENT_AMOUNT_INVALID')

  const liquidoInformado = arredondar(pagamento?.transaction_details?.net_received_amount)
  if (Number.isFinite(liquidoInformado) && liquidoInformado >= 0 && liquidoInformado <= bruto) {
    return { bruto, liquido: liquidoInformado, taxa: arredondar(bruto - liquidoInformado) }
  }

  const taxaDetalhada = arredondar((pagamento?.fee_details || []).reduce((total, item) => {
    const valor = Number(item?.amount)
    return total + (Number.isFinite(valor) && valor > 0 ? valor : 0)
  }, 0))
  const taxa = Math.min(bruto, Math.max(0, taxaDetalhada))
  return { bruto, liquido: arredondar(bruto - taxa), taxa }
}

async function chamar(path, options, accessToken) {
  const resposta = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  })
  const corpo = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    const detalhe = corpo?.message || corpo?.error || `HTTP ${resposta.status}`
    throw new Error(`MERCADO_PAGO_API:${detalhe}`)
  }
  return corpo
}

export function criarPreferenciaMercadoPago(payload, accessToken, idempotencyKey) {
  return chamar('/checkout/preferences', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  }, accessToken)
}

export function consultarPagamentoMercadoPago(paymentId, accessToken) {
  if (!/^\d+$/.test(String(paymentId))) throw new Error('PAYMENT_ID_INVALID')
  return chamar(`/v1/payments/${paymentId}`, { method: 'GET', cache: 'no-store' }, accessToken)
}

export function buscarPagamentosMercadoPago(externalReference, accessToken) {
  if (!externalReference || typeof externalReference !== 'string') {
    throw new Error('EXTERNAL_REFERENCE_INVALID')
  }
  const query = new URLSearchParams({
    external_reference: externalReference,
    sort: 'date_created',
    criteria: 'desc',
  })
  return chamar(`/v1/payments/search?${query.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  }, accessToken)
}
