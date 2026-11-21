import assert from 'node:assert/strict'

// Server-rendered navigation checks. These do not replace a browser review of
// spacing, responsive layout, keyboard focus or theme animation.
export async function executarTestesInterfaceHttp(baseUrl, token) {
  const consultar = async caminho => {
    const response = await fetch(`${baseUrl}${caminho}`, {
      headers: { Cookie: `salge_session=${token}` },
    })
    assert.equal(response.status, 200, caminho)
    return response.text()
  }
  const dashboard = await consultar('/')
  assert.match(dashboard, /href="\/produtos\?aba=vendas"/)
  assert.match(dashboard, /<title>Visão Geral · Salge 3D<\/title>/)
  assert.match(dashboard, /Faturamento no mês/)
  assert.match(dashboard, /Estoque físico de filamento/)
  assert.doesNotMatch(dashboard, /<kbd[^>]*>Ctrl K<\/kbd>/)

  const vendas = await consultar('/produtos?aba=vendas')
  assert.match(vendas, /id="sales-tab"[^>]*aria-selected="true"/)
  assert.match(vendas, /id="catalog-tab"[^>]*aria-selected="false"/)
  assert.match(vendas, /<h1[^>]*>Vendas por produto<\/h1>/)
  for (const caminho of ['/produtos', '/produtos?aba=inexistente']) {
    const catalogo = await consultar(caminho)
    assert.match(catalogo, /id="catalog-tab"[^>]*aria-selected="true"/)
    assert.match(catalogo, /id="sales-tab"[^>]*aria-selected="false"/)
  }
}
