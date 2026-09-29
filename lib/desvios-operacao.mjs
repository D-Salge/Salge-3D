function arredondar(valor, casas = 2) {
  const fator = 10 ** casas
  return Math.round((Number(valor) + Number.EPSILON) * fator) / fator
}

function indicador(rotulo, previsto, realizado, unidade) {
  const diferenca = realizado - previsto
  const percentual = previsto > 0 ? (diferenca / previsto) * 100 : realizado > 0 ? 100 : 0
  const excesso = Math.max(0, percentual)
  const nivel = excesso > 15 ? 'Crítico' : excesso > 5 ? 'Atenção' : 'Dentro'
  return {
    rotulo,
    previsto: arredondar(previsto),
    realizado: arredondar(realizado),
    diferenca: arredondar(diferenca),
    percentual: arredondar(percentual, 1),
    unidade,
    nivel,
  }
}

export function calcularDesviosOperacao({
  custoPrevisto, custoReal, horasPrevistas, horasReais,
  filamentoPrevisto, filamentoReal, custoMateriaisPrevisto, custoMateriaisReal,
  camposReais = 0, camposTotais = 0,
}) {
  const itens = [
    indicador('Custo total', custoPrevisto, custoReal, 'R$'),
    indicador('Tempo de máquina', horasPrevistas, horasReais, 'h'),
    indicador('Filamento', filamentoPrevisto, filamentoReal, 'g'),
    indicador('Materiais', custoMateriaisPrevisto, custoMateriaisReal, 'R$'),
  ]
  const pior = itens.some((item) => item.nivel === 'Crítico')
    ? 'Crítico' : itens.some((item) => item.nivel === 'Atenção') ? 'Atenção' : 'Dentro'
  return {
    itens,
    nivel: pior,
    completude: camposTotais > 0 ? arredondar(camposReais / camposTotais * 100, 0) : 100,
    usandoEstimativas: camposReais < camposTotais,
  }
}
