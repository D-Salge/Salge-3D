/**
 * Regras puras do orçamento.
 *
 * O cliente usa este módulo apenas para a prévia. O servidor sempre recalcula
 * os mesmos valores com preços e configurações lidos do banco antes de salvar.
 */

/** @param {number} valor */
export function arredondarMoeda(valor) {
  if (!Number.isFinite(valor)) {
    throw new TypeError('Valor monetário inválido.')
  }

  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * @typedef {{ pesoGramas: number, custoPorGrama: number }} MaterialOrcamento
 * @typedef {{
 *   tempoImpressaoHoras: number,
 *   custoHoraMaquina: number,
 *   taxaOperacional: number,
 *   materiais: MaterialOrcamento[]
 * }} OrcamentoInput
 */

/** @param {OrcamentoInput} input */
export function calcularOrcamento(input) {
  const { tempoImpressaoHoras, custoHoraMaquina, taxaOperacional, materiais } = input

  for (const [campo, valor] of [
    ['tempoImpressaoHoras', tempoImpressaoHoras],
    ['custoHoraMaquina', custoHoraMaquina],
    ['taxaOperacional', taxaOperacional],
  ]) {
    if (!Number.isFinite(valor) || valor < 0) {
      throw new RangeError(`${campo} deve ser um número não negativo.`)
    }
  }

  if (!Array.isArray(materiais)) {
    throw new TypeError('materiais deve ser uma lista.')
  }

  const custoFilamentoSemArredondar = materiais.reduce((total, material) => {
    if (
      !Number.isFinite(material.pesoGramas) ||
      material.pesoGramas < 0 ||
      !Number.isFinite(material.custoPorGrama) ||
      material.custoPorGrama < 0
    ) {
      throw new RangeError('Peso e custo do filamento devem ser números não negativos.')
    }

    return total + material.pesoGramas * material.custoPorGrama
  }, 0)

  const materialCost = arredondarMoeda(custoFilamentoSemArredondar)
  const machineReserve = arredondarMoeda(tempoImpressaoHoras * custoHoraMaquina)
  const operationalFee = arredondarMoeda(taxaOperacional)
  const total = arredondarMoeda(materialCost + machineReserve + operationalFee)

  return { materialCost, machineReserve, operationalFee, total }
}
