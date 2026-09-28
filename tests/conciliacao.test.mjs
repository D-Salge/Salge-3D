import assert from 'node:assert/strict'
import test from 'node:test'
import { numeroBancario, parseExtrato, sugerirConciliacao } from '../lib/conciliacao.mjs'

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

test('sugere apenas mesmo valor, tipo e data próxima', () => {
  const sugestao = sugerirConciliacao({ data: '2026-10-01', valor: 140 }, [
    { tipo: 'Recebimento', id: 1, data: '2026-09-20', valor: 140 },
    { tipo: 'Despesa', id: 2, data: '2026-10-01', valor: 140 },
    { tipo: 'Recebimento', id: 3, data: '2026-10-02', valor: 140 },
  ])
  assert.equal(sugestao.id, 3)
})
