export const TIPOS_MENSAGEM_WHATSAPP = ['orcamento', 'cobranca', 'producao', 'pronto']

export const ROTULOS_MENSAGEM_WHATSAPP = {
  orcamento: 'Enviar orçamento',
  cobranca: 'Lembrar pagamento',
  producao: 'Atualizar produção',
  pronto: 'Avisar que está pronto',
}

/**
 * Diz se o tipo de acompanhamento já teve um contato registrado.
 * O histórico é separado por tipo, então uma mudança de etapa pode gerar
 * uma nova pendência sem ressuscitar a anterior.
 *
 * @param {'orcamento' | 'cobranca' | 'producao' | 'pronto'} tipo
 * @param {string | null | undefined} eventosConcatenados
 */
export function contatoWhatsAppJaRegistrado(tipo, eventosConcatenados) {
  if (!TIPOS_MENSAGEM_WHATSAPP.includes(tipo)) {
    throw new RangeError('Tipo de mensagem inválido.')
  }
  const esperado = `WhatsApp: ${ROTULOS_MENSAGEM_WHATSAPP[tipo]}`
  return String(eventosConcatenados ?? '')
    .split('||')
    .some((evento) => evento === esperado)
}

/** @param {string | null | undefined} telefone */
export function normalizarTelefoneWhatsApp(telefone) {
  let digitos = String(telefone ?? '').replace(/\D/g, '')
  if (digitos.startsWith('00')) digitos = digitos.slice(2)
  if (digitos.startsWith('0') && (digitos.length === 11 || digitos.length === 12)) {
    digitos = digitos.slice(1)
  }
  if (!digitos.startsWith('55') && (digitos.length === 10 || digitos.length === 11)) {
    digitos = `55${digitos}`
  }
  return /^55\d{10,11}$/.test(digitos) ? digitos : null
}

/**
 * @param {{ orcamentoStatus: string, status: string, saldoPendente: number, vencimentoEm?: string | null }} pedido
 */
export function sugerirTipoMensagemWhatsApp(pedido) {
  const vencido = Boolean(
    pedido.vencimentoEm &&
    pedido.vencimentoEm.slice(0, 10) < new Date().toISOString().slice(0, 10),
  )
  if (
    pedido.orcamentoStatus === 'Aprovado' &&
    pedido.saldoPendente > 0.009 &&
    (pedido.status === 'Finalizado' || vencido)
  ) return 'cobranca'
  if (pedido.status === 'Finalizado') return 'pronto'
  if (
    pedido.orcamentoStatus === 'Aprovado' &&
    ['Fila', 'Imprimindo', 'Acabamento'].includes(pedido.status)
  ) return 'producao'
  return 'orcamento'
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBR(valor) {
  if (!valor) return null
  const partes = valor.slice(0, 10).split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor
}

/**
 * @param {'orcamento' | 'cobranca' | 'producao' | 'pronto'} tipo
 * @param {{ clienteNome: string, numeroOrcamento?: string | null, nomeDaPeca: string, valorTotal: number, saldoPendente: number, status: string, vencimentoEm?: string | null }} pedido
 */
export function criarMensagemWhatsApp(tipo, pedido) {
  if (!TIPOS_MENSAGEM_WHATSAPP.includes(tipo)) throw new RangeError('Tipo de mensagem inválido.')
  const primeiroNome = pedido.clienteNome.trim().split(/\s+/)[0] || 'cliente'
  const numero = pedido.numeroOrcamento || 'do seu pedido'
  const vencimento = dataBR(pedido.vencimentoEm)

  if (tipo === 'cobranca') {
    return `Olá, ${primeiroNome}! Tudo bem? Passando para lembrar que ficou pendente ${moeda(pedido.saldoPendente)} referente ao pedido ${numero}, “${pedido.nomeDaPeca}”${vencimento ? `, com vencimento em ${vencimento}` : ''}. Se você já realizou o pagamento, pode desconsiderar esta mensagem. Obrigado!`
  }
  if (tipo === 'producao') {
    const andamento = {
      Fila: 'está na fila de produção',
      Imprimindo: 'já está sendo impresso',
      Acabamento: 'está na etapa de acabamento',
    }[pedido.status] || 'está em produção'
    return `Olá, ${primeiroNome}! Uma atualização sobre o pedido ${numero}: “${pedido.nomeDaPeca}” ${andamento}. Avisarei assim que estiver pronto!`
  }
  if (tipo === 'pronto') {
    return `Olá, ${primeiroNome}! Seu pedido ${numero}, “${pedido.nomeDaPeca}”, está pronto. Podemos combinar a entrega ou retirada?`
  }
  return `Olá, ${primeiroNome}! Tudo bem? O orçamento ${numero} para “${pedido.nomeDaPeca}” ficou em ${moeda(pedido.valorTotal)}. Posso iniciar a produção?`
}

/** @param {string} telefone @param {string} mensagem */
export function criarUrlWhatsApp(telefone, mensagem) {
  const numero = normalizarTelefoneWhatsApp(telefone)
  if (!numero) return null
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}
