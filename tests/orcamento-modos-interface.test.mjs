import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as formulario from '../lib/orcamento-formulario.mjs'
import * as orcamento from '../lib/orcamento.mjs'
import * as plates from '../lib/orcamento-plates.mjs'
import * as sinal from '../lib/sinal.mjs'

const require = createRequire(import.meta.url)
const codigo = ts.transpileModule(readFileSync(new URL('../app/components/OrcamentoPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function texto(no) {
  if (no == null || typeof no === 'boolean') return ''
  if (Array.isArray(no)) return no.map(texto).join('')
  return typeof no === 'object' ? texto(no.props?.children) : String(no)
}
function encontrar(no, predicado) {
  if (!no || typeof no !== 'object') return null
  if (Array.isArray(no)) return no.map(item => encontrar(item, predicado)).find(Boolean) ?? null
  return predicado(no) ? no : encontrar(no.props?.children, predicado)
}

function montar(pedidoInicial = null, produtosAcabados = []) {
  let cursor = 0
  const estados = []
  const confirmacoes = []
  const gravacoes = []
  let confirmar = true
  const mocks = {
    react: {
      useState(inicial) {
        const indice = cursor++
        if (!(indice in estados)) estados[indice] = typeof inicial === 'function' ? inicial() : inicial
        return [estados[indice], valor => { estados[indice] = typeof valor === 'function' ? valor(estados[indice]) : valor }]
      },
      useMemo: executar => executar(), useTransition: () => [false, executar => executar()],
    },
    'next/navigation': { useRouter: () => ({ refresh() {}, push() {} }) },
    '@/app/actions/pedidos': { criarPedido: async dados => { gravacoes.push(dados); return { success: true } }, atualizarOrcamento: async () => { throw new Error('Não deveria editar neste teste') } },
    '@/lib/orcamento-formulario.mjs': formulario,
    '@/lib/orcamento.mjs': orcamento,
    '@/lib/orcamento-plates.mjs': plates,
    '@/lib/sinal.mjs': sinal,
    '@/lib/identificador-operacao': { gerarIdentificadorOperacao: prefixo => `${prefixo}-${Math.random()}` },
  }
  const contexto = vm.createContext({ exports: {}, require: nome => mocks[nome] ?? require(nome), window: {
    confirm: mensagem => { confirmacoes.push(mensagem); return confirmar },
  } })
  new vm.Script(codigo).runInContext(contexto)
  const props = {
    clientes: [{ id: 1, nome: 'Cliente' }], filamentos: [{ id: 1, material: 'PLA', cor: 'Branco', preco_rolo: 100, peso_rolo_gramas: 1000 }],
    insumosList: [], impressoras: [], custoHoraMaquina: 2, tarifaEnergia: 1, potenciaW: 100,
    margemPerdasPadrao: 0.1, taxaVenda: 0, valorHoraTrabalho: 25, fatorB2CPersonalizado: 2,
    fatorB2BPiloto: 1.8, fatorB2BRecorrente: 1.5, pedidoMinimoB2B: 80, referenciasPrecos: [],
    clienteInicialId: 1, pedidoInicial, produtosAcabados,
  }
  let arvore
  function render() { cursor = 0; arvore = contexto.exports.OrcamentoPage(props); return arvore }
  render()
  return {
    render, confirmacoes, gravacoes,
    confirmar(valor) { confirmar = valor },
    botao(nome) { const no = encontrar(arvore, item => item.type === 'button' && texto(item).trim() === nome); assert.ok(no, nome); return no },
    async clicar(nome) { await this.botao(nome).props.onClick(); render() },
    texto: () => texto(arvore),
    async enviar() { const form = encontrar(arvore, item => item.type === 'form'); await form.props.onSubmit({ preventDefault() {} }); render() },
    campoRotulado(nome) { const label = encontrar(arvore, item => item.type === 'label' && texto(item).startsWith(nome)); assert.ok(label, nome); return encontrar(label, item => item.type === 'input' || item.type === 'select') },
  }
}

function pedido(platesIniciais) {
  return { origem_id: 1, valor_total_original: 40, preco_unitario_original: 40, nome_da_peca: 'Projeto teste', cliente_id: 1, quantidade: 1, tempo_impressao_horas: 2,
    modo_calculo: 'Plates', plates_dimensionamento: 'Manual', materiais: [{ filamento_id: 1, peso_gasto_gramas: 20 }],
    insumos: [], plates: platesIniciais }
}

test('formulário vazio alterna plates e tradicional sem exigir preenchimento nem confirmar revisão', async () => {
  const ui = montar()
  await ui.clicar('Cálculo por plates')
  assert.equal(ui.botao('Cálculo por plates').props['aria-pressed'], true)
  await ui.clicar('Converter para tradicional')
  assert.equal(ui.botao('Cálculo tradicional').props['aria-pressed'], true)
  assert.equal(ui.confirmacoes.length, 0)
  assert.doesNotMatch(ui.texto(), /Revise as plates antes de converter/)
  await ui.clicar('Cálculo por plates')
  assert.equal(ui.campoRotulado('Nome / referência').props.value, 'Plate 1')
})

test('plate incompleta pode ser preservada ao voltar; cancelar mantém o editor e os dados', async () => {
  const ui = montar(pedido([{ nome: 'Rascunho', quantidade_pecas: 1, repeticoes: 1, tempo_execucao_minutos: 0,
    filamentos: [{ filamento_id: 1, gramas_por_execucao: 12 }] }]))
  ui.confirmar(false)
  await ui.clicar('Converter para tradicional')
  assert.equal(ui.botao('Cálculo por plates').props['aria-pressed'], true)
  assert.equal(ui.campoRotulado('Nome / referência').props.value, 'Rascunho')
  ui.confirmar(true)
  await ui.clicar('Converter para tradicional')
  assert.equal(ui.campoRotulado('Tempo de Impressão (Horas)').props.value, 2)
  await ui.clicar('Cálculo por plates')
  assert.equal(ui.campoRotulado('Nome / referência').props.value, 'Rascunho')
  assert.equal(ui.campoRotulado('g / plate cheia').props.value, 12)
  assert.equal(ui.confirmacoes.length, 2)
  assert.equal(ui.gravacoes.length, 0)
})

test('plate válida continua convertendo totais sem confirmação ou consumo duplicado', async () => {
  const ui = montar(pedido([{ nome: 'Referência válida', quantidade_pecas: 1, repeticoes: 2, tempo_execucao_minutos: 90,
    filamentos: [{ filamento_id: 1, gramas_por_execucao: 12 }] }]))
  await ui.clicar('Converter para tradicional')
  assert.equal(ui.campoRotulado('Tempo de Impressão (Horas)').props.value, 3)
  await ui.clicar('Cálculo por plates')
  await ui.clicar('Converter para tradicional')
  assert.equal(ui.campoRotulado('Tempo de Impressão (Horas)').props.value, 3)
  assert.equal(ui.confirmacoes.length, 0)
  assert.equal(ui.gravacoes.length, 0)
})

test('atendimento por estoque sem saldo fica acessível, explica o fluxo e impede a gravação', async () => {
  const ui = montar()
  assert.ok(!ui.botao('Atender com estoque').props.disabled)
  await ui.clicar('Atender com estoque')
  assert.match(ui.texto(), /Nenhum produto acabado com saldo disponível/)
  assert.match(ui.texto(), /Produzir para estoque/)
  assert.match(ui.texto(), /Consultar estoque de produtos acabados/)
  const campo = ui.campoRotulado('Nome da peça / Projeto')
  campo.props.onChange({ target: { value: 'Produto sem saldo' } }); ui.render()
  await ui.enviar()
  assert.match(ui.texto(), /Selecione um produto acabado com saldo suficiente/)
  assert.equal(ui.gravacoes.length, 0)
  await ui.clicar('Produzir sob encomenda')
  assert.equal(ui.botao('Cálculo tradicional').props['aria-pressed'], true)
})

test('atendimento com saldo continua selecionando o produto sem gravar ao alternar', async () => {
  const ui = montar(null, [{ produto_id: 1, produto_versao_id: 2, nome: 'Mini Jesus', versao: 1,
    disponivel: 24, custo_unitario_referencia: 2, preco_base_unitario: 6 }])
  await ui.clicar('Atender com estoque')
  assert.equal(ui.campoRotulado('Produto acabado disponível').props.value, 2)
  assert.equal(ui.campoRotulado('Nome da peça / Projeto').props.value, 'Mini Jesus')
  assert.doesNotMatch(ui.texto(), /Nenhum produto acabado com saldo disponível/)
  assert.equal(ui.gravacoes.length, 0)
})
