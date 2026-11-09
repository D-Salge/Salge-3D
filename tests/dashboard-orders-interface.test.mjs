import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const code = ts.transpileModule(readFileSync(new URL('../app/components/DashboardOrders.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node)
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) return node.map(item => find(item, predicate)).find(Boolean) ?? null
  return predicate(node) ? node : find(node.props?.children, predicate)
}
const order = (id, overrides = {}) => ({
  id, numero_orcamento: `ORC-${id}`, nome_da_peca: `Peça ${id}`, cliente_nome: 'João Silva',
  materiais: 'PLA Branco', valor_total_cobrado: 120, total_recebido: 40,
  orcamento_status: 'Aprovado', status: 'Imprimindo', quantidade: 2, quantidade_entregue: 0,
  data_entrega: '2026-12-01', impressora_nome: null, ...overrides,
})
function mount(initial) {
  let orders = initial, cursor = 0, tree
  const states = []
  const mocks = {
    react: { useState(value) {
      const index = cursor++
      if (!(index in states)) states[index] = value
      return [states[index], next => { states[index] = next }]
    } },
    'next/link': { default: 'a' },
  }
  const context = vm.createContext({ exports: {}, require: name => mocks[name] ?? require(name) })
  new vm.Script(code).runInContext(context)
  function render() { cursor = 0; tree = context.exports.DashboardOrders({ pedidos: orders }); return tree }
  render()
  return {
    preview: () => find(tree, n => n.props?.id === 'pedido-preview'),
    select(id) { const button = find(tree, n => n.type === 'button' && n.props['aria-controls'] === 'pedido-preview' && text(n).includes(`ORC-${id}`)); assert.ok(button); button.props.onClick(); render() },
    filter(label) { const button = find(tree, n => n.type === 'button' && n.props['aria-controls'] === undefined && text(n).startsWith(label)); assert.ok(button); button.props.onClick(); render() },
    search(value) { find(tree, n => n.type === 'input').props.onChange({ target: { value } }); render() },
    update(next) { orders = next; render() },
    text: () => text(tree),
    link: () => find(tree, n => n.type === 'a' && text(n).startsWith('Abrir pedido'))?.props.href,
  }
}

test('a seleção atualiza a prévia, valores e link do pedido; filtro e atualização nunca deixam prévia fora da lista', () => {
  const ui = mount([order(1), order(2, { orcamento_status: 'Rascunho', total_recebido: 0 }), order(3, { status: 'Finalizado' })])
  assert.equal(ui.link(), '/pedidos/1')
  ui.select(2)
  assert.equal(ui.link(), '/pedidos/2')
  assert.match(text(ui.preview()), /Saldo estimado/)
  ui.filter('Em produção')
  assert.equal(ui.link(), '/pedidos/1')
  assert.match(text(ui.preview()), /A receberR\$\s*80,00/)
  ui.filter('Finalizados')
  assert.equal(ui.link(), '/pedidos/3')
  ui.update([order(1)])
  assert.equal(ui.preview(), null)
  assert.match(ui.text(), /Nenhum pedido recente/)
})

test('busca ignora acentos e maiúsculas e consulta cliente, peça e referência dentro do filtro', () => {
  const ui = mount([order(1), order(2, { nome_da_peca: 'Marcador de página', cliente_nome: 'Carol', orcamento_status: 'Enviado' })])
  ui.search('JOAO')
  assert.equal(ui.link(), '/pedidos/1')
  ui.search('PAGINA')
  assert.equal(ui.link(), '/pedidos/2')
  ui.search('orc-2')
  assert.equal(ui.link(), '/pedidos/2')
  ui.filter('Em produção')
  assert.equal(ui.preview(), null)
  ui.search('')
  assert.equal(ui.link(), '/pedidos/1')
})

test('estado sem pedidos oferece orçamento e não expõe uma prévia obsoleta; saldo nunca é negativo', () => {
  const ui = mount([order(1, { total_recebido: 150, data_entrega: null, materiais: '' })])
  assert.match(text(ui.preview()), /A receberR\$\s*0,00/)
  assert.match(text(ui.preview()), /Sem previsão/)
  assert.match(text(ui.preview()), /Não informado/)
  ui.update([])
  assert.equal(ui.preview(), null)
  assert.equal(ui.link(), undefined)
  assert.match(ui.text(), /Cadastre seu primeiro pedido/)
  assert.match(ui.text(), /Novo orçamento/)
})
