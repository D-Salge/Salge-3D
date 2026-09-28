import assert from 'node:assert/strict'
import test from 'node:test'
import { barrasCode39, codigoEstoque } from '../lib/barcode.mjs'
import { progressoPorLotes, validarQuantidadeLote } from '../lib/lotes-producao.mjs'

test('gera códigos permanentes e barras Code 39', () => {
  assert.equal(codigoEstoque('Filamento', 12), 'FIL-000012')
  assert.equal(codigoEstoque('Insumo', 3), 'INS-000003')
  const codigo = barrasCode39('FIL-000012')
  assert.ok(codigo.barras.length > 30)
  assert.ok(codigo.largura > 0)
})

test('impede lotes acima da quantidade do pedido', () => {
  assert.equal(validarQuantidadeLote({ quantidadePedido: 100, quantidadePlanejadaExistente: 40, quantidadeNovoLote: 60 }), true)
  assert.equal(validarQuantidadeLote({ quantidadePedido: 100, quantidadePlanejadaExistente: 40, quantidadeNovoLote: 61 }), false)
})

test('resume produção ignorando lotes cancelados', () => {
  assert.deepEqual(progressoPorLotes([
    { status: 'Concluído', quantidade_planejada: 40, quantidade_produzida: 40 },
    { status: 'Imprimindo', quantidade_planejada: 60, quantidade_produzida: 20 },
    { status: 'Cancelado', quantidade_planejada: 10, quantidade_produzida: 0 },
  ]), { planejado: 100, produzido: 60, emAndamento: 1 })
})
