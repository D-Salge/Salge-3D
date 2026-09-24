import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contatoWhatsAppJaRegistrado,
  criarMensagemWhatsApp,
  criarUrlWhatsApp,
  normalizarTelefoneWhatsApp,
  sugerirTipoMensagemWhatsApp,
} from '../lib/whatsapp.mjs'

test('normaliza telefones brasileiros sem duplicar o código do país', () => {
  assert.equal(normalizarTelefoneWhatsApp('(34) 99999-1234'), '5534999991234')
  assert.equal(normalizarTelefoneWhatsApp('+55 34 99999-1234'), '5534999991234')
  assert.equal(normalizarTelefoneWhatsApp('0035'), null)
})

test('sugere cobrança para pedido entregue e ainda não pago', () => {
  assert.equal(sugerirTipoMensagemWhatsApp({
    orcamentoStatus: 'Aprovado',
    status: 'Finalizado',
    saldoPendente: 57,
  }), 'cobranca')
  assert.equal(sugerirTipoMensagemWhatsApp({
    orcamentoStatus: 'Aprovado',
    status: 'Finalizado',
    saldoPendente: 0,
  }), 'pronto')
  assert.equal(sugerirTipoMensagemWhatsApp({
    orcamentoStatus: 'Enviado',
    status: 'Fila',
    saldoPendente: 57,
  }), 'orcamento')
})

test('monta cobrança com saldo real e gera URL codificada', () => {
  const mensagem = criarMensagemWhatsApp('cobranca', {
    clienteNome: 'Helen Solis',
    numeroOrcamento: 'ORC-2026-000069',
    nomeDaPeca: 'Espremedor de pasta de dente',
    valorTotal: 57,
    saldoPendente: 38,
    status: 'Finalizado',
    vencimentoEm: '2026-09-20',
  })
  assert.match(mensagem, /Helen/)
  assert.match(mensagem, /R\$\s38,00/)
  assert.match(mensagem, /20\/09\/2026/)
  assert.match(criarUrlWhatsApp('(34) 99999-1234', mensagem), /^https:\/\/wa\.me\/5534999991234\?text=/)
})

test('não repete uma pendência do WhatsApp que já foi contatada', () => {
  const eventos = 'WhatsApp: Enviar orçamento||Status do orçamento'
  assert.equal(contatoWhatsAppJaRegistrado('orcamento', eventos), true)
  assert.equal(contatoWhatsAppJaRegistrado('pronto', eventos), false)
})

test('pedido finalizado não volta a ser tratado como retomada de orçamento', () => {
  assert.equal(sugerirTipoMensagemWhatsApp({
    orcamentoStatus: 'Enviado',
    status: 'Finalizado',
    saldoPendente: 0,
  }), 'pronto')
})

