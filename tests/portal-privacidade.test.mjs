import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('portal público não consulta nem exibe materiais internos', () => {
  const acao = readFileSync(new URL('../app/actions/portal.ts', import.meta.url), 'utf8')
  const pagina = readFileSync(new URL('../app/portal/[token]/page.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(acao, /pedido_filamentos|pedido_insumos|gramas/i)
  assert.doesNotMatch(pagina, /filamento|insumo|gramagem|gramas|materiais previstos/i)
})

test('PDF comercial não expõe ficha técnica ou custos internos', () => {
  const pdfCliente = readFileSync(new URL('../app/api/orcamentos/[id]/pdf/route.ts', import.meta.url), 'utf8')
  const ordemProducao = readFileSync(new URL('../app/api/pedidos/[id]/ordem-producao/route.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(pdfCliente, /pedido\.(materiais|insumos|tempo_impressao_horas|custo_filamento|custo_insumos)/)
  assert.doesNotMatch(pdfCliente, /peso_gasto_gramas|custo_calculado/)
  assert.match(ordemProducao, /pedido\.materiais/)
  assert.match(ordemProducao, /pedido\.perfil_tecnico/)
  assert.match(ordemProducao, /exigirSessao/)
})
