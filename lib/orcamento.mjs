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

/** @param {number} valor */
export function arredondarMoedaParaCima(valor) {
  if (!Number.isFinite(valor)) {
    throw new TypeError('Valor monetário inválido.')
  }

  return Math.ceil((valor - Number.EPSILON) * 100) / 100
}

/** @param {string} valor */
export function normalizarChaveTexto(valor) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
}

/**
 * Mantém como piso o último preço praticado para o mesmo cliente e produto.
 * A proteção só define o valor inicial; um preço manual continua permitido.
 *
 * @param {number} precoSugerido
 * @param {number | null | undefined} precoHistorico
 */
export function aplicarPisoHistorico(precoSugerido, precoHistorico) {
  if (!Number.isFinite(precoSugerido) || precoSugerido < 0) {
    throw new RangeError('precoSugerido deve ser não negativo.')
  }
  if (precoHistorico == null) return arredondarMoeda(precoSugerido)
  if (!Number.isFinite(precoHistorico) || precoHistorico <= 0) {
    throw new RangeError('precoHistorico deve ser positivo.')
  }
  return arredondarMoeda(Math.max(precoSugerido, precoHistorico))
}

export const TIPOS_PEDIDO = [
  'B2C personalizado (1-3)',
  'B2C lote (4+)',
  'B2B piloto',
  'B2B recorrente',
]

/**
 * Replica a seleção de fator da aba Calculadora da planilha Salge 3D.
 * O lote usa os mesmos degraus por quantidade existentes na fórmula E5.
 *
 * @param {string} tipoPedido
 * @param {number} quantidade
 * @param {{
 *   b2cPersonalizado: number,
 *   b2bPiloto: number,
 *   b2bRecorrente: number
 * }} fatores
 */
export function obterFatorPedido(tipoPedido, quantidade, fatores) {
  if (!Number.isSafeInteger(quantidade) || quantidade < 1) {
    throw new RangeError('quantidade deve ser um inteiro positivo.')
  }
  if (!TIPOS_PEDIDO.includes(tipoPedido)) {
    throw new RangeError('tipoPedido inválido.')
  }
  for (const [campo, valor] of Object.entries(fatores)) {
    if (!Number.isFinite(valor) || valor <= 0) throw new RangeError(`${campo} deve ser positivo.`)
  }

  if (tipoPedido === 'B2C personalizado (1-3)') return fatores.b2cPersonalizado
  if (tipoPedido === 'B2C lote (4+)') {
    if (quantidade >= 100) return 1.87
    if (quantidade >= 80) return 1.85
    if (quantidade >= 50) return 1.9
    return 2
  }
  if (tipoPedido === 'B2B piloto') return fatores.b2bPiloto
  return fatores.b2bRecorrente
}

/**
 * Cálculo equivalente à aba Calculadora da planilha. Pesos, tempo, insumos,
 * embalagem, frete, mão de obra e setup são totais do pedido; apenas o custo
 * de materiais avulsos é informado por unidade, como na planilha.
 *
 * @param {{
 *   tipoPedido: string,
 *   quantidade: number,
 *   tempoImpressaoHoras: number,
 *   potenciaW: number,
 *   tarifaEnergiaKwh: number,
 *   custoHoraMaquina: number,
 *   materiais: MaterialOrcamento[],
 *   custoInsumos: number,
 *   materiaisAvulsosPorUnidade: number,
 *   horasTrabalhoAtivo: number,
 *   valorHoraTrabalho: number,
 *   custoEmbalagem: number,
 *   fretePago: number,
 *   setupProjeto: number,
 *   margemPerdas: number,
 *   taxaVenda: number,
 *   fatorB2CPersonalizado: number,
 *   fatorB2BPiloto: number,
 *   fatorB2BRecorrente: number,
 *   pedidoMinimoB2B: number
 * }} input
 */
export function calcularPrecoPlanilha(input) {
  const camposNaoNegativos = [
    'tempoImpressaoHoras', 'potenciaW', 'tarifaEnergiaKwh', 'custoHoraMaquina',
    'custoInsumos', 'materiaisAvulsosPorUnidade', 'horasTrabalhoAtivo',
    'valorHoraTrabalho', 'custoEmbalagem', 'fretePago', 'setupProjeto',
    'margemPerdas', 'taxaVenda', 'pedidoMinimoB2B',
  ]
  for (const campo of camposNaoNegativos) {
    const valor = input[campo]
    if (!Number.isFinite(valor) || valor < 0) throw new RangeError(`${campo} deve ser não negativo.`)
  }
  if (input.margemPerdas > 1) throw new RangeError('margemPerdas deve ficar entre 0 e 1.')
  if (input.taxaVenda >= 1) throw new RangeError('taxaVenda deve ser menor que 1.')
  if (!Array.isArray(input.materiais)) throw new TypeError('materiais deve ser uma lista.')

  const fatorAplicado = obterFatorPedido(input.tipoPedido, input.quantidade, {
    b2cPersonalizado: input.fatorB2CPersonalizado,
    b2bPiloto: input.fatorB2BPiloto,
    b2bRecorrente: input.fatorB2BRecorrente,
  })
  const filamentoSemPerdas = input.materiais.reduce((total, material) => {
    if (!Number.isFinite(material.pesoGramas) || material.pesoGramas < 0 ||
        !Number.isFinite(material.custoPorGrama) || material.custoPorGrama < 0) {
      throw new RangeError('Peso e custo do filamento devem ser números não negativos.')
    }
    return total + material.pesoGramas * material.custoPorGrama
  }, 0)
  const reservaPerdas = filamentoSemPerdas * input.margemPerdas
  const energia = input.tempoImpressaoHoras * input.potenciaW / 1000 * input.tarifaEnergiaKwh
  const reservaMaquina = input.tempoImpressaoHoras * input.custoHoraMaquina
  const materiaisAvulsos = input.quantidade * input.materiaisAvulsosPorUnidade
  const maoObraAtiva = input.horasTrabalhoAtivo * input.valorHoraTrabalho
  const custoCompleto = filamentoSemPerdas + reservaPerdas + energia + reservaMaquina +
    input.custoInsumos + materiaisAvulsos + maoObraAtiva + input.custoEmbalagem +
    input.fretePago + input.setupProjeto
  const precoMinimo = custoCompleto / (1 - input.taxaVenda)
  const minimoB2B = input.tipoPedido.startsWith('B2B') ? input.pedidoMinimoB2B : 0
  const precoSugerido = Math.max(custoCompleto * fatorAplicado / (1 - input.taxaVenda), minimoB2B)
  const precoSugeridoPorUnidade = precoSugerido / input.quantidade
  const precoUnitarioArredondado = arredondarMoedaParaCima(precoSugeridoPorUnidade)
  const totalArredondado = arredondarMoeda(precoUnitarioArredondado * input.quantidade)
  const taxasEstimadas = totalArredondado * input.taxaVenda
  const lucroEstimado = totalArredondado * (1 - input.taxaVenda) - custoCompleto

  return {
    fatorAplicado,
    filamentoSemPerdas: arredondarMoeda(filamentoSemPerdas),
    reservaPerdas: arredondarMoeda(reservaPerdas),
    energia: arredondarMoeda(energia),
    reservaMaquina: arredondarMoeda(reservaMaquina),
    custoInsumos: arredondarMoeda(input.custoInsumos),
    materiaisAvulsos: arredondarMoeda(materiaisAvulsos),
    maoObraAtiva: arredondarMoeda(maoObraAtiva),
    custoEmbalagem: arredondarMoeda(input.custoEmbalagem),
    fretePago: arredondarMoeda(input.fretePago),
    setupProjeto: arredondarMoeda(input.setupProjeto),
    custoCompleto: arredondarMoeda(custoCompleto),
    precoMinimo: arredondarMoeda(precoMinimo),
    precoSugerido: arredondarMoeda(precoSugerido),
    precoSugeridoPorUnidade: arredondarMoeda(precoSugeridoPorUnidade),
    precoUnitarioArredondado,
    totalArredondado,
    taxasEstimadas: arredondarMoeda(taxasEstimadas),
    lucroEstimado: arredondarMoeda(lucroEstimado),
    margemEstimada: totalArredondado > 0 ? lucroEstimado / totalArredondado : 0,
  }
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

/**
 * Calcula o total comercial. Quando há preço unitário informado, ele prevalece
 * sobre o custo calculado; desconto e frete continuam sendo valores do pedido.
 *
 * @param {{
 *   custoCalculado: number,
 *   quantidade: number,
 *   precoUnitario?: number | null,
 *   desconto?: number,
 *   freteCobrado?: number
 * }} input
 */
export function calcularValorVenda(input) {
  const { custoCalculado, quantidade, precoUnitario = null, desconto = 0, freteCobrado = 0 } = input
  if (!Number.isFinite(custoCalculado) || custoCalculado < 0) throw new RangeError('custoCalculado inválido')
  if (!Number.isSafeInteger(quantidade) || quantidade < 1) throw new RangeError('quantidade inválida')
  if (precoUnitario !== null && (!Number.isFinite(precoUnitario) || precoUnitario <= 0)) {
    throw new RangeError('precoUnitario inválido')
  }
  for (const [campo, valor] of [['desconto', desconto], ['freteCobrado', freteCobrado]]) {
    if (!Number.isFinite(valor) || valor < 0) throw new RangeError(`${campo} inválido`)
  }

  const baseComercial = precoUnitario === null ? custoCalculado : precoUnitario * quantidade
  if (desconto > baseComercial + freteCobrado) throw new RangeError('desconto excede o valor do orçamento')
  return arredondarMoeda(baseComercial - desconto + freteCobrado)
}
