import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectarTransferenciaMercadoPago,
  numeroBancario,
  parseExtrato,
  parseExtratoMercadoPago,
  sugerirConciliacao,
  valoresFechamConciliacao,
} from '../lib/conciliacao.mjs'

test('lê valores bancários brasileiros', () => {
  assert.equal(numeroBancario('R$ 1.234,56'), 1234.56)
  assert.equal(numeroBancario('-140,00'), -140)
  assert.equal(numeroBancario('(25,90)'), -25.9)
})

test('importa CSV com cabeçalhos em português', () => {
  const itens = parseExtrato('Data;Descrição;Valor\n01/10/2026;Cliente ímãs;140,00\n02/10/2026;Frete;-20,50', 'extrato.csv')
  assert.deepEqual(itens.map(({ data, descricao, valor }) => ({ data, descricao, valor })), [
    { data: '2026-10-01', descricao: 'Cliente ímãs', valor: 140 },
    { data: '2026-10-02', descricao: 'Frete', valor: -20.5 },
  ])
})

test('importa OFX e preserva identificador do banco', () => {
  const itens = parseExtrato(`<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001120000<TRNAMT>140.00<FITID>ABC123<MEMO>PIX CLIENTE</STMTTRN></BANKTRANLIST></OFX>`, 'extrato.ofx')
  assert.equal(itens.length, 1)
  assert.deepEqual(itens[0], { identificador: 'ABC123', data: '2026-10-01', descricao: 'PIX CLIENTE', valor: 140 })
})

test('importa o XLSX tabular do Mercado Pago e ignora o resumo superior', () => {
  const itens = parseExtratoMercadoPago([
    ['INITIAL_BALANCE', 'CREDITS', 'DEBITS', 'FINAL_BALANCE'],
    ['0,00', '120,00', '-20,00', '100,00'],
    [],
    ['RELEASE_DATE', 'TRANSACTION_TYPE', 'REFERENCE_ID', 'TRANSACTION_NET_AMOUNT', 'PARTIAL_BALANCE'],
    ['14-10-2026', 'Pix recebido CLIENTE', '183200535219', '120,00', '120,00'],
    ['14-10-2026', 'Dinheiro reservado Salge 3D', '183200535220', '-20,00', '100,00'],
  ])

  assert.deepEqual(itens, [
    { identificador: '183200535219', data: '2026-10-14', descricao: 'Pix recebido CLIENTE', valor: 120 },
    { identificador: '183200535220', data: '2026-10-14', descricao: 'Dinheiro reservado Salge 3D', valor: -20 },
  ])
})

test('reconhece somente as duas direções válidas do cofrinho', () => {
  assert.equal(detectarTransferenciaMercadoPago('Dinheiro reservado Salge 3D', -50), 'ParaReserva')
  assert.equal(detectarTransferenciaMercadoPago('Dinheiro retirado Salge 3D', 25), 'DaReserva')
  assert.equal(detectarTransferenciaMercadoPago('Pix recebido Cliente', 25), null)
  assert.equal(detectarTransferenciaMercadoPago('Dinheiro reservado Salge 3D', 50), null)
})

test('concilia um Pix com vários pedidos somente quando os centavos fecham', () => {
  assert.equal(valoresFechamConciliacao(60, [30, 30]), true)
  assert.equal(valoresFechamConciliacao(58.50, [20, 38.50]), true)
  assert.equal(valoresFechamConciliacao(58.50, [20, 38.49]), false)
  assert.equal(valoresFechamConciliacao(60, []), false)
})

test('sugere apenas mesmo valor, tipo e data próxima', () => {
  const sugestao = sugerirConciliacao({ data: '2026-10-01', valor: 140 }, [
    { tipo: 'Recebimento', id: 1, data: '2026-09-20', valor: 140 },
    { tipo: 'Despesa', id: 2, data: '2026-10-01', valor: 140 },
    { tipo: 'Recebimento', id: 3, data: '2026-10-02', valor: 140 },
  ])
  assert.equal(sugestao.id, 3)
})
