import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import {
  configuracaoMercadoPago,
  calcularLiquidacaoMercadoPago,
  montarPreferenciaMercadoPago,
  normalizarValorCobranca,
  validarAssinaturaMercadoPago,
} from '../lib/mercado-pago.mjs'

test('diagnóstico exige token, segredo de webhook e URL HTTPS', () => {
  const config = configuracaoMercadoPago({ MERCADO_PAGO_ACCESS_TOKEN: 'token' })
  assert.equal(config.configurado, false)
  assert.deepEqual(config.ausentes, ['MERCADO_PAGO_WEBHOOK_SECRET', 'APP_URL (HTTPS)'])
})

test('monta preferência com saldo, referência, retornos e webhook', () => {
  const payload = montarPreferenciaMercadoPago({
    pedido: { id: 42, numero_orcamento: 'ORC-42', nome_da_peca: 'Ímãs', saldo_pendente: 140, cliente_email: 'cliente@example.com' },
    externalReference: 'salge-1-42-abc', appUrl: 'https://erp.example.com',
  })
  assert.equal(payload.items[0].unit_price, 140)
  assert.equal(payload.external_reference, 'salge-1-42-abc')
  assert.equal(payload.notification_url, 'https://erp.example.com/api/webhooks/mercado-pago')
  assert.equal(payload.back_urls.success, 'https://erp.example.com/pagamento/retorno?resultado=sucesso')
})

test('omite webhook individual no sandbox e preserva retornos', () => {
  const payload = montarPreferenciaMercadoPago({
    pedido: { id: 42, numero_orcamento: 'ORC-42', nome_da_peca: 'Ímãs', saldo_pendente: 140, cliente_email: null },
    externalReference: 'salge-1-42-sandbox',
    appUrl: 'https://erp.example.com',
    incluirWebhook: false,
  })
  assert.equal('notification_url' in payload, false)
  assert.equal(payload.back_urls.pending, 'https://erp.example.com/pagamento/retorno?resultado=pendente')
})

test('valida assinatura HMAC do webhook e rejeita conteúdo alterado', () => {
  const secret = 'segredo-de-teste'
  const dataId = '123456'
  const requestId = 'req-abc'
  const ts = '1750000000000'
  const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(manifesto).digest('hex')
  const assinatura = `ts=${ts},v1=${v1}`
  assert.equal(validarAssinaturaMercadoPago({ assinatura, requestId, dataId, secret }), true)
  assert.equal(validarAssinaturaMercadoPago({ assinatura, requestId: 'outro', dataId, secret }), false)
})

test('aceita cobrança parcial e impede valor acima do saldo', () => {
  assert.equal(normalizarValorCobranca(140, 350), 140)
  assert.equal(normalizarValorCobranca(57.126, 100), 57.13)
  assert.throws(() => normalizarValorCobranca(350.01, 350), /PAYMENT_AMOUNT_EXCEEDS_BALANCE/)
  assert.throws(() => normalizarValorCobranca(0, 350), /PAYMENT_AMOUNT_INVALID/)
})

test('calcula taxa e líquido informados pelo Mercado Pago', () => {
  assert.deepEqual(calcularLiquidacaoMercadoPago({
    transaction_amount: 140,
    transaction_details: { net_received_amount: 135.31 },
    fee_details: [{ amount: 4.69 }],
  }), { bruto: 140, liquido: 135.31, taxa: 4.69 })
  assert.deepEqual(calcularLiquidacaoMercadoPago({
    transaction_amount: 100,
    fee_details: [{ amount: 3.2 }, { amount: 0.5 }],
  }), { bruto: 100, liquido: 96.3, taxa: 3.7 })
})
