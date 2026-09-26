function chaveMes(data) {
  return String(data).slice(0, 7)
}

function proximoMes(chave, deslocamento) {
  const [ano, mes] = chave.split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1 + deslocamento, 1))
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`
}

function moeda(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function projetarFluxoCaixa({ saldoInicial, movimentos, inicio, meses = 6 }) {
  if (!Number.isFinite(saldoInicial) || !Number.isSafeInteger(meses) || meses < 1 || meses > 24) {
    throw new RangeError('Parâmetros de projeção inválidos.')
  }
  const mesInicial = chaveMes(inicio)
  if (!/^\d{4}-\d{2}$/.test(mesInicial)) throw new RangeError('Data inicial inválida.')
  const chaves = Array.from({ length: meses }, (_, index) => proximoMes(mesInicial, index))
  const periodos = chaves.map((chave) => ({ chave, entradas: 0, saidas: 0, resultado: 0, saldo: 0 }))

  for (const movimento of movimentos) {
    if (!Number.isFinite(movimento.valor) || movimento.valor < 0 || !['Entrada', 'Saida'].includes(movimento.tipo)) {
      throw new RangeError('Movimento financeiro inválido.')
    }
    const chaveOriginal = chaveMes(movimento.data)
    const chave = chaveOriginal < mesInicial ? mesInicial : chaveOriginal
    const indice = chaves.indexOf(chave)
    if (indice < 0) continue
    if (movimento.tipo === 'Entrada') periodos[indice].entradas += movimento.valor
    else periodos[indice].saidas += movimento.valor
  }

  let saldo = moeda(saldoInicial)
  for (const periodo of periodos) {
    periodo.entradas = moeda(periodo.entradas)
    periodo.saidas = moeda(periodo.saidas)
    periodo.resultado = moeda(periodo.entradas - periodo.saidas)
    saldo = moeda(saldo + periodo.resultado)
    periodo.saldo = saldo
  }
  return { saldoInicial: moeda(saldoInicial), periodos, menorSaldo: Math.min(moeda(saldoInicial), ...periodos.map((periodo) => periodo.saldo)) }
}
