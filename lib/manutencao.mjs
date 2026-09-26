function numero(valor) {
  const resultado = Number(valor)
  return Number.isFinite(resultado) ? resultado : 0
}

function arredondar(valor, casas = 2) {
  const fator = 10 ** casas
  return Math.round((numero(valor) + Number.EPSILON) * fator) / fator
}

/** Calcula o alerta de revisão com base no horímetro e na última manutenção registrada. */
export function calcularStatusManutencao({
  horasTotais,
  horasUltimaManutencao = 0,
  intervaloHoras,
}) {
  const intervalo = Math.max(numero(intervaloHoras), 1)
  const horasDesdeManutencao = Math.max(0, numero(horasTotais) - numero(horasUltimaManutencao))
  const horasRestantes = Math.max(0, intervalo - horasDesdeManutencao)
  const percentual = arredondar((horasDesdeManutencao / intervalo) * 100, 1)
  const status = percentual >= 100 ? 'Vencida' : percentual >= 80 ? 'Proxima' : 'Em dia'

  return {
    status,
    horasDesdeManutencao: arredondar(horasDesdeManutencao, 1),
    horasRestantes: arredondar(horasRestantes, 1),
    percentual,
  }
}

/** Normaliza as métricas agregadas pelo banco para exibição e comparação entre máquinas. */
export function calcularIndicadoresQualidade(dados) {
  const pedidosFinalizados = Math.max(0, numero(dados.pedidosFinalizados))
  const pedidosComFalha = Math.max(0, numero(dados.pedidosComFalha))
  const horasPrevistas = Math.max(0, numero(dados.horasPrevistas))
  const horasReais = Math.max(0, numero(dados.horasReais))
  const faturamento = Math.max(0, numero(dados.faturamento))
  const custoProducao = Math.max(0, numero(dados.custoProducao))

  return {
    pedidosFinalizados,
    pedidosComFalha,
    totalFalhas: Math.max(0, numero(dados.totalFalhas)),
    taxaPedidosComFalha: pedidosFinalizados > 0
      ? arredondar((pedidosComFalha / pedidosFinalizados) * 100, 1)
      : 0,
    horasPrevistas: arredondar(horasPrevistas, 1),
    horasReais: arredondar(horasReais, 1),
    desvioHoras: arredondar(horasReais - horasPrevistas, 1),
    custoExtra: arredondar(Math.max(0, numero(dados.custoExtra)), 2),
    custoProducao: arredondar(custoProducao, 2),
    faturamento: arredondar(faturamento, 2),
    lucroEstimado: arredondar(faturamento - custoProducao, 2),
  }
}
