import { arredondarMoeda } from './orcamento.mjs'

/** @param {number} total @param {number} recebido */
export function calcularSaldoPendente(total, recebido) {
  if (![total, recebido].every(Number.isFinite) || total < 0 || recebido < 0) {
    throw new RangeError('Total e recebido devem ser valores não negativos.')
  }
  return arredondarMoeda(Math.max(0, total - recebido))
}

/**
 * @param {{
 *  valorVendido: number,
 *  custoFilamento: number,
 *  custoInsumos: number,
 *  custoEnergia: number,
 *  custoMaquina: number,
 *  custoEmbalagem: number,
 *  fretePago: number,
 *  custoExtra: number
 * }} input
 */
export function calcularRentabilidade(input) {
  const valores = Object.values(input)
  if (!valores.every(Number.isFinite) || valores.some((valor) => valor < 0)) {
    throw new RangeError('Valores de rentabilidade devem ser não negativos.')
  }

  const custoReal = arredondarMoeda(
    input.custoFilamento +
      input.custoInsumos +
      input.custoEnergia +
      input.custoMaquina +
      input.custoEmbalagem +
      input.fretePago +
      input.custoExtra,
  )
  const lucroLiquido = arredondarMoeda(input.valorVendido - custoReal)
  const margemPercentual = input.valorVendido > 0
    ? arredondarMoeda((lucroLiquido / input.valorVendido) * 100)
    : 0

  return { custoReal, lucroLiquido, margemPercentual }
}
