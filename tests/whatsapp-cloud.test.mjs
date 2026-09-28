import assert from 'node:assert/strict'
import test from 'node:test'
import { configuracaoWhatsApp, nomeTemplateWhatsApp, payloadTemplateWhatsApp, traduzirStatusWebhook } from '../lib/whatsapp-cloud.mjs'

test('detecta configuração incompleta sem expor segredos', () => {
  const config = configuracaoWhatsApp({ WHATSAPP_PHONE_NUMBER_ID: '123' })
  assert.equal(config.configurado, false)
  assert.ok(config.ausentes.includes('WHATSAPP_ACCESS_TOKEN'))
})

test('monta payload de template aprovado com mensagem auditável', () => {
  const payload = payloadTemplateWhatsApp({ telefone: '5511999999999', template: 'salge_orcamento', mensagem: 'Olá!' })
  assert.equal(payload.type, 'template')
  assert.equal(payload.template.components[0].parameters[0].text, 'Olá!')
})

test('resolve template e status do webhook', () => {
  assert.equal(nomeTemplateWhatsApp('orcamento', { WHATSAPP_TEMPLATE_ORCAMENTO: 'salge_orcamento' }).nome, 'salge_orcamento')
  assert.equal(traduzirStatusWebhook('delivered'), 'Entregue')
  assert.equal(traduzirStatusWebhook('desconhecido'), null)
})
