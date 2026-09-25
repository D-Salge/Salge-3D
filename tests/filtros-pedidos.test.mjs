import assert from 'node:assert/strict'
import test from 'node:test'
import { filtrarPedidos, resumirPedidos } from '../lib/filtros-pedidos.mjs'

const pedidos = [
  { numero_orcamento: 'ORC-001', nome_da_peca: 'Espremedor', cliente_nome: 'Hélèn Solis', orcamento_status: 'Rascunho', status: 'Fila', valor_total_cobrado: 57, total_recebido: 0 },
  { numero_orcamento: 'ORC-002', nome_da_peca: 'Suporte', cliente_nome: 'Leo', orcamento_status: 'Aprovado', status: 'Finalizado', valor_total_cobrado: 40, total_recebido: 40 },
]

test('busca pedidos sem diferenciar acentos ou maiúsculas', () => {
  assert.deepEqual(filtrarPedidos(pedidos, { busca: 'HELEN' }), [pedidos[0]])
  assert.deepEqual(filtrarPedidos(pedidos, { busca: 'orc-002' }), [pedidos[1]])
})

test('combina filtros de orçamento, produção e financeiro', () => {
  assert.deepEqual(filtrarPedidos(pedidos, { orcamento: 'Aprovado', producao: 'Finalizado', financeiro: 'Quitado' }), [pedidos[1]])
  assert.deepEqual(filtrarPedidos(pedidos, { financeiro: 'Pendente' }), [pedidos[0]])
})

test('resume a carteira filtrada', () => {
  assert.deepEqual(resumirPedidos(pedidos), { quantidade: 2, total: 97, recebido: 40, pendente: 57 })
})
