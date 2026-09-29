export function validarQuantidadeLote({ quantidadePedido, quantidadePlanejadaExistente, quantidadeNovoLote }) {
  if (![quantidadePedido, quantidadePlanejadaExistente, quantidadeNovoLote].every(Number.isFinite)) return false
  if (quantidadeNovoLote <= 0) return false
  return quantidadePlanejadaExistente + quantidadeNovoLote <= quantidadePedido + 0.001
}

export function progressoPorLotes(lotes) {
  const ativos = lotes.filter((lote) => lote.status !== 'Cancelado')
  return {
    planejado: ativos.reduce((total, lote) => total + Number(lote.quantidade_planejada), 0),
    produzido: ativos.reduce((total, lote) => total + Number(lote.quantidade_produzida), 0),
    emAndamento: ativos.filter((lote) => lote.status === 'Imprimindo').length,
  }
}

export function dividirQuantidadeEmPlacas(quantidade, capacidadePorPlaca) {
  if (!Number.isSafeInteger(quantidade) || quantidade <= 0 ||
      !Number.isSafeInteger(capacidadePorPlaca) || capacidadePorPlaca <= 0) {
    throw new Error('QUANTIDADE_INVALIDA')
  }
  const totalPlacas = Math.ceil(quantidade / capacidadePorPlaca)
  if (totalPlacas > 10_000) throw new Error('MUITAS_PLACAS')
  return Array.from({ length: totalPlacas }, (_, indice) =>
    Math.min(capacidadePorPlaca, quantidade - indice * capacidadePorPlaca))
}
