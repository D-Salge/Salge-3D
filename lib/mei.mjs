/**
 * Calcula o limite proporcional apenas no ano de abertura do MEI.
 * Nos anos seguintes, usa o limite anual configurado.
 */
export function calcularLimiteMei({ ano, inicioEm, limiteAnual = 81000 }) {
  if (!Number.isInteger(ano) || ano < 2000 || !Number.isFinite(limiteAnual) || limiteAnual <= 0) {
    throw new RangeError('Dados do limite do MEI inválidos.')
  }
  if (!inicioEm) return Math.round(limiteAnual * 100) / 100
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inicioEm)
  if (!match) throw new RangeError('Data de abertura do MEI inválida.')
  const anoInicio = Number(match[1])
  const mesInicio = Number(match[2])
  if (mesInicio < 1 || mesInicio > 12) throw new RangeError('Data de abertura do MEI inválida.')
  if (ano < anoInicio) return 0
  if (ano > anoInicio) return Math.round(limiteAnual * 100) / 100
  const meses = 13 - mesInicio
  return Math.round((limiteAnual / 12) * meses * 100) / 100
}

export function resumirLimiteMei(total, limite) {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(limite) || limite < 0) {
    throw new RangeError('Valores do faturamento inválidos.')
  }
  const percentual = limite === 0 ? (total > 0 ? 100 : 0) : (total / limite) * 100
  return {
    total: Math.round(total * 100) / 100,
    limite: Math.round(limite * 100) / 100,
    restante: Math.round((limite - total) * 100) / 100,
    percentual,
    situacao: total > limite ? 'Excedido' : percentual >= 80 ? 'Atenção' : 'Dentro do limite',
  }
}

/** @param {string} competencia no formato AAAA-MM */
export function vencimentoDas(competencia) {
  const match = /^(\d{4})-(\d{2})$/.exec(competencia)
  if (!match) throw new RangeError('Competência inválida.')
  const ano = Number(match[1])
  const mes = Number(match[2])
  if (mes < 1 || mes > 12) throw new RangeError('Competência inválida.')
  const proximoMes = new Date(Date.UTC(ano, mes, 20))
  return proximoMes.toISOString().slice(0, 10)
}

