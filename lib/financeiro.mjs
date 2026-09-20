export function dividirEmParcelas(valorTotal, quantidade) {
  if (!Number.isFinite(valorTotal) || valorTotal < 0) throw new RangeError('valorTotal inválido')
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 120) {
    throw new RangeError('quantidade inválida')
  }

  const totalCentavos = Math.round(valorTotal * 100)
  const base = Math.floor(totalCentavos / quantidade)
  const resto = totalCentavos - base * quantidade
  return Array.from({ length: quantidade }, (_, index) =>
    (base + (index < resto ? 1 : 0)) / 100,
  )
}

export function adicionarMeses(dataIso, meses) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso) || !Number.isSafeInteger(meses) || meses < 0) {
    throw new RangeError('data ou intervalo inválido')
  }
  const [ano, mes, dia] = dataIso.split('-').map(Number)
  const primeiroDoDestino = new Date(Date.UTC(ano, mes - 1 + meses, 1))
  const ultimoDia = new Date(Date.UTC(
    primeiroDoDestino.getUTCFullYear(),
    primeiroDoDestino.getUTCMonth() + 1,
    0,
  )).getUTCDate()
  const destino = new Date(Date.UTC(
    primeiroDoDestino.getUTCFullYear(),
    primeiroDoDestino.getUTCMonth(),
    Math.min(dia, ultimoDia),
  ))
  return destino.toISOString().slice(0, 10)
}

export function gerarParcelas(valorTotal, quantidade, primeiroVencimento) {
  return dividirEmParcelas(valorTotal, quantidade).map((valor, index) => ({
    numero: index + 1,
    valor,
    vencimentoEm: adicionarMeses(primeiroVencimento, index),
  }))
}

export function distribuirRecebimento(valor, parcelas) {
  if (!Number.isFinite(valor) || valor <= 0) throw new RangeError('valor inválido')
  let restante = Math.round(valor * 100) / 100
  const alocacoes = []
  for (const parcela of parcelas) {
    const saldo = Math.max(0, Math.round((parcela.valor - parcela.recebido) * 100) / 100)
    if (saldo === 0 || restante === 0) continue
    const alocado = Math.min(saldo, restante)
    alocacoes.push({ parcelaId: parcela.id, valor: alocado })
    restante = Math.round((restante - alocado) * 100) / 100
  }
  return { alocacoes, restante }
}
