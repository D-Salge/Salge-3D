/** Retorna o vencimento no mês, limitando dias 29–31 ao último dia existente. */
export function vencimentoDaCompetencia(competencia, diaVencimento) {
  if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência inválida.')
  const dia = Number(diaVencimento)
  if (!Number.isSafeInteger(dia) || dia < 1 || dia > 31) throw new Error('Dia inválido.')
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${competencia}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`
}

export function listarCompetencias(inicio, fim, limite = 120) {
  if (!/^\d{4}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}$/.test(fim) || inicio > fim) return []
  const [anoInicial, mesInicial] = inicio.split('-').map(Number)
  const atual = new Date(Date.UTC(anoInicial, mesInicial - 1, 1))
  const resultado = []
  while (resultado.length < limite) {
    const chave = `${atual.getUTCFullYear()}-${String(atual.getUTCMonth() + 1).padStart(2, '0')}`
    if (chave > fim) break
    resultado.push(chave)
    atual.setUTCMonth(atual.getUTCMonth() + 1)
  }
  return resultado
}

export function recorrenciaAtivaNaCompetencia(recorrencia, competencia) {
  const inicio = String(recorrencia.inicia_em).slice(0, 7)
  const fim = recorrencia.termina_em ? String(recorrencia.termina_em).slice(0, 7) : null
  return recorrencia.ativo !== 0 && competencia >= inicio && (!fim || competencia <= fim)
}

/** Retorna null quando o vencimento cair antes do início ou depois do término exato. */
export function vencimentoDaRecorrencia(recorrencia, competencia) {
  if (!recorrenciaAtivaNaCompetencia(recorrencia, competencia)) return null
  const vencimento = vencimentoDaCompetencia(competencia, recorrencia.dia_vencimento)
  if (vencimento < String(recorrencia.inicia_em).slice(0, 10)) return null
  if (recorrencia.termina_em && vencimento > String(recorrencia.termina_em).slice(0, 10)) return null
  return vencimento
}
