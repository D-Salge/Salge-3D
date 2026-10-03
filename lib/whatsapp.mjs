export const TIPOS_MENSAGEM_WHATSAPP = ['orcamento', 'followup', 'cobranca', 'producao', 'pronto', 'pos_venda']

export const ROTULOS_MENSAGEM_WHATSAPP = {
  orcamento: 'Enviar orçamento',
  followup: 'Acompanhar orçamento',
  cobranca: 'Lembrar pagamento',
  producao: 'Atualizar produção',
  pronto: 'Avisar que está pronto',
  pos_venda: 'Pós-venda',
}

/**
 * Diz se o tipo de acompanhamento já teve um contato registrado.
 * O histórico é separado por tipo, então uma mudança de etapa pode gerar
 * uma nova pendência sem ressuscitar a anterior.
 *
 * @param {'orcamento' | 'followup' | 'cobranca' | 'producao' | 'pronto' | 'pos_venda'} tipo
 * @param {string | null | undefined} eventosConcatenados
 */
export function contatoWhatsAppJaRegistrado(tipo, eventosConcatenados) {
  if (!TIPOS_MENSAGEM_WHATSAPP.includes(tipo)) {
    throw new RangeError('Tipo de mensagem inválido.')
  }
  const rotulosCompativeis = {
    orcamento: ['Enviar orçamento', 'Retomar orçamento'],
    followup: ['Acompanhar orçamento'],
    cobranca: ['Lembrar pagamento', 'Cobrar pagamento'],
    producao: ['Atualizar produção'],
    pronto: ['Avisar que está pronto'],
    pos_venda: ['Pós-venda'],
  }
  const esperados = rotulosCompativeis[tipo].map((rotulo) => `WhatsApp: ${rotulo}`)
  return String(eventosConcatenados ?? '')
    .split('||')
    .some((evento) => esperados.includes(evento))
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
    pedido.saldoPendente > 0.009 &&
    (pedido.status === 'Finalizado' || (pedido.orcamentoStatus === 'Aprovado' && vencido))
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
 * @param {'orcamento' | 'followup' | 'cobranca' | 'producao' | 'pronto' | 'pos_venda'} tipo
 * @param {{ clienteNome: string, numeroOrcamento?: string | null, nomeDaPeca: string, valorTotal: number, saldoPendente: number, status: string, vencimentoEm?: string | null, linkPagamento?: string | null }} pedido
 */
export function criarMensagemWhatsApp(tipo, pedido) {
  if (!TIPOS_MENSAGEM_WHATSAPP.includes(tipo)) throw new RangeError('Tipo de mensagem inválido.')
  const primeiroNome = pedido.clienteNome.trim().split(/\s+/)[0] || 'cliente'
  const numero = pedido.numeroOrcamento || 'do seu pedido'
  const vencimento = dataBR(pedido.vencimentoEm)

  if (tipo === 'followup') {
    return `Olá, ${primeiroNome}! Tudo bem? Queria saber se conseguiu analisar o orçamento ${numero} para “${pedido.nomeDaPeca}”, no valor de ${moeda(pedido.valorTotal)}. Se quiser ajustar quantidade, material ou prazo, posso recalcular para você.`
  }
  if (tipo === 'pos_venda') {
    return `Olá, ${primeiroNome}! Tudo bem? Passando para saber se ficou satisfeito(a) com “${pedido.nomeDaPeca}”. Sua opinião ajuda muito a Salge 3D. De 1 a 5, que nota você daria ao pedido ${numero}?`
  }

  if (tipo === 'cobranca') {
    const link = pedido.linkPagamento ? `\n\nVocê pode pagar com segurança pelo Mercado Pago: ${pedido.linkPagamento}` : ''
    return `Olá, ${primeiroNome}! Tudo bem? Passando para lembrar que ficou pendente ${moeda(pedido.saldoPendente)} referente ao pedido ${numero}, “${pedido.nomeDaPeca}”${vencimento ? `, com vencimento em ${vencimento}` : ''}.${link}\n\nSe você já realizou o pagamento, pode desconsiderar esta mensagem. Obrigado!`
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
