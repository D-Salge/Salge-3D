const centavos = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100

export function calcularValorSinal(valorTotal, percentual) {
  const total = Number(valorTotal)
  const taxa = Number(percentual)
  if (!Number.isFinite(total) || total < 0) throw new RangeError('Valor total inválido.')
  if (!Number.isFinite(taxa) || taxa < 0 || taxa > 100) throw new RangeError('Percentual de sinal inválido.')
  return centavos(total * taxa / 100)
}

export function percentualDoPedido(valor, valorTotal) {
  const pagamento = Number(valor)
  const total = Number(valorTotal)
  if (!Number.isFinite(pagamento) || pagamento < 0 || !Number.isFinite(total) || total <= 0) return 0
  return Math.round(pagamento * 10_000 / total) / 100
}

export function classificarRecebimentoAutomatico({
  valor,
  saldo,
  valorTotal,
  sinalPercentual,
  sinalRecebido = 0,
}) {
  const pagamento = centavos(valor)
  const restante = centavos(saldo)
  if (pagamento >= restante - 0.01) return 'Quitacao'
  const sinalPendente = Math.max(0, centavos(calcularValorSinal(valorTotal, sinalPercentual) - sinalRecebido))
  return sinalPendente > 0.009 && pagamento <= sinalPendente + 0.01 ? 'Sinal' : 'Parcial'
}
