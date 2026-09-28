function arredondar(valor, casas = 2) {
  const fator = 10 ** casas
  return Math.round((Number(valor) + Number.EPSILON) * fator) / fator
}

export function calcularValorProporcional(valorTotal, quantidadeTotal, quantidadeEntrega) {
  const valor = Number(valorTotal)
  const total = Number(quantidadeTotal)
  const entrega = Number(quantidadeEntrega)
  if (![valor, total, entrega].every(Number.isFinite) || valor < 0 || total <= 0 || entrega <= 0 || entrega > total) {
    throw new RangeError('Valores da entrega inválidos.')
  }
  return arredondar((valor / total) * entrega)
}

export function calcularProgressoPedido({ quantidadeTotal, quantidadeProduzida, quantidadeEntregue }) {
  const total = Number(quantidadeTotal)
  const produzida = Number(quantidadeProduzida)
  const entregue = Number(quantidadeEntregue)
  if (![total, produzida, entregue].every(Number.isFinite) || total <= 0 || produzida < 0 || entregue < 0 || produzida > total || entregue > produzida) {
    throw new RangeError('Progresso do pedido inválido.')
  }
  return {
    quantidadeRestanteProduzir: arredondar(total - produzida, 3),
    quantidadeRestanteEntregar: arredondar(total - entregue, 3),
    percentualProduzido: arredondar((produzida / total) * 100, 1),
    percentualEntregue: arredondar((entregue / total) * 100, 1),
  }
}
