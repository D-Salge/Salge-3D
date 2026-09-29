import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('portal público não consulta nem exibe materiais internos', () => {
  const acao = readFileSync(new URL('../app/actions/portal.ts', import.meta.url), 'utf8')
  const pagina = readFileSync(new URL('../app/portal/[token]/page.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(acao, /pedido_filamentos|pedido_insumos|gramas/i)
  assert.doesNotMatch(pagina, /filamento|insumo|gramagem|gramas|materiais previstos/i)
})
