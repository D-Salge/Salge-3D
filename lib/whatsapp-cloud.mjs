export const STATUS_WHATSAPP = ['Fila', 'Enviando', 'Enviado', 'Entregue', 'Lido', 'Falhou']

export function configuracaoWhatsApp(env = process.env) {
  const testMode = env.WHATSAPP_TEST_MODE?.trim().toLowerCase() === 'true'
  const config = {
    token: env.WHATSAPP_ACCESS_TOKEN?.trim() || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() || '',
    appSecret: env.META_APP_SECRET?.trim() || '',
    graphVersion: env.WHATSAPP_GRAPH_VERSION?.trim() || '',
    languageCode: testMode ? 'en_US' : (env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'pt_BR'),
    testMode,
  }
  const ausentes = []
  if (!config.token) ausentes.push('WHATSAPP_ACCESS_TOKEN')
  if (!config.phoneNumberId) ausentes.push('WHATSAPP_PHONE_NUMBER_ID')
  if (!config.verifyToken) ausentes.push('WHATSAPP_VERIFY_TOKEN')
  if (!config.appSecret) ausentes.push('META_APP_SECRET')
  if (!/^v\d+\.\d+$/.test(config.graphVersion)) ausentes.push('WHATSAPP_GRAPH_VERSION')
  return { ...config, configurado: ausentes.length === 0, ausentes }
}

export function nomeTemplateWhatsApp(tipo, env = process.env) {
  if (env.WHATSAPP_TEST_MODE?.trim().toLowerCase() === 'true') {
    return { chave: 'WHATSAPP_TEST_MODE', nome: 'hello_world' }
  }
  const chave = `WHATSAPP_TEMPLATE_${String(tipo).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`
  const nome = env[chave]?.trim()
  return { chave, nome: nome || null }
}

/**
 * O template aprovado deve ter uma variável no corpo ({{1}}), que recebe a
 * mensagem editada no ERP. Assim o conteúdo continua auditável antes do envio.
 */
export function payloadTemplateWhatsApp({ telefone, template, idioma = 'pt_BR', mensagem }) {
  if (!/^\d{10,15}$/.test(telefone)) throw new RangeError('Telefone inválido.')
  if (!/^[a-z0-9_]+$/.test(template)) throw new RangeError('Nome do template inválido.')
  const templateTeste = template === 'hello_world'
  const texto = String(mensagem || '').trim()
  if (!templateTeste && (!texto || texto.length > 2000)) throw new RangeError('Mensagem inválida.')
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefone,
    type: 'template',
    template: {
      name: template,
      language: { code: templateTeste ? 'en_US' : idioma },
      ...(templateTeste ? {} : {
        components: [{ type: 'body', parameters: [{ type: 'text', text: texto }] }],
      }),
    },
  }
}

export function traduzirStatusWebhook(status) {
  return ({ sent: 'Enviado', delivered: 'Entregue', read: 'Lido', failed: 'Falhou' })[status] || null
}
