function centavos(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100)
}

function reais(valor) {
  return Math.round(valor) / 100
}

export function calcularTotalCompra(itens, frete = 0, desconto = 0) {
  const freteNumero = Number(frete)
  const descontoNumero = Number(desconto)
  if (!Array.isArray(itens) || itens.length === 0 || !Number.isFinite(freteNumero) || !Number.isFinite(descontoNumero) ||
      itens.some((item) => !Number.isFinite(Number(item.valorTotal)) || Number(item.valorTotal) <= 0)) {
    throw new Error('TOTAL_INVALIDO')
  }
  const subtotalCentavos = itens.reduce((total, item) => total + centavos(item.valorTotal), 0)
  const freteCentavos = centavos(freteNumero)
  const descontoCentavos = centavos(descontoNumero)
  if (subtotalCentavos <= 0 || freteCentavos < 0 || descontoCentavos < 0 || descontoCentavos >= subtotalCentavos + freteCentavos) {
    throw new Error('TOTAL_INVALIDO')
  }
  return {
    subtotal: reais(subtotalCentavos),
    total: reais(subtotalCentavos + freteCentavos - descontoCentavos),
  }
}

export function precoUnitarioEstoque(valorTotal, quantidadeEstoque) {
  const valor = Number(valorTotal)
  const quantidade = Number(quantidadeEstoque)
  if (!Number.isFinite(valor) || valor < 0 || !Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error('PRECO_INVALIDO')
  }
  return Math.round((valor / quantidade + Number.EPSILON) * 100000) / 100000
}

/** Divide frete e desconto proporcionalmente entre Filamentos e Insumos. */
export function ratearCompraPorCategoria(itens, frete = 0, desconto = 0) {
  const { subtotal, total } = calcularTotalCompra(itens, frete, desconto)
  const grupos = new Map()
  for (const item of itens) {
    const categoria = item.tipoItem === 'Filamento' ? 'Filamentos' : 'Insumos'
    grupos.set(categoria, (grupos.get(categoria) || 0) + Number(item.valorTotal))
  }

  const entradas = [...grupos.entries()]
  let distribuidoCentavos = 0
  const totalCentavos = centavos(total)
  return entradas.map(([categoria, valor], indice) => {
    const valorCentavos = indice === entradas.length - 1
      ? totalCentavos - distribuidoCentavos
      : Math.round(totalCentavos * (valor / subtotal))
    distribuidoCentavos += valorCentavos
    return { categoria, valor: reais(valorCentavos) }
  })
}
