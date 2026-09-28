const DIA_MS = 86_400_000

export function somarDias(data, dias) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || !Number.isSafeInteger(dias)) {
    throw new RangeError('Data ou quantidade de dias inválida.')
  }
  const resultado = new Date(`${data}T12:00:00Z`)
  resultado.setUTCDate(resultado.getUTCDate() + dias)
  return resultado.toISOString().slice(0, 10)
}

export function diferencaDias(data, hoje) {
  const alvo = new Date(`${String(data).slice(0, 10)}T12:00:00Z`).getTime()
  const base = new Date(`${String(hoje).slice(0, 10)}T12:00:00Z`).getTime()
  if (!Number.isFinite(alvo) || !Number.isFinite(base)) throw new RangeError('Data inválida.')
  return Math.round((alvo - base) / DIA_MS)
}

export function classificarPrazo(data, hoje) {
  const dias = diferencaDias(data, hoje)
  if (dias < 0) return 'Atrasado'
  if (dias === 0) return 'Hoje'
  if (dias <= 7) return 'Proximos7Dias'
  return 'Futuro'
}

export function resumirAgenda(itens, hoje) {
  return itens.reduce((resumo, item) => {
    const grupo = classificarPrazo(item.vencimento_em, hoje)
    resumo[grupo] += 1
    resumo.total += 1
    return resumo
  }, { total: 0, Atrasado: 0, Hoje: 0, Proximos7Dias: 0, Futuro: 0 })
}
