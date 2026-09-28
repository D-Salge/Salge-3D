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
