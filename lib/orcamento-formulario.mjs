import {
  DIMENSIONAMENTO_PLATES_AUTOMATICO,
  DIMENSIONAMENTO_PLATES_MANUAL,
  MODO_CALCULO_PLATES,
  MODO_CALCULO_TRADICIONAL,
} from './orcamento-plates.mjs'

function escalar(valor, fator) {
  return valor === '' ? '' : Math.round(Number(valor) * fator * 1000) / 1000
}

export function resolverAtivacaoModoPlates({
  modoAtual,
  possuiPlates,
  quantidade,
  quantidadeRevisada,
}) {
  if (modoAtual === MODO_CALCULO_PLATES) {
    return { alterarModo: false, inicializarPlates: false, quantidadeRevisada }
  }
  return {
    alterarModo: true,
    inicializarPlates: !possuiPlates,
    quantidadeRevisada: possuiPlates ? quantidadeRevisada : quantidade,
  }
}

export function aplicarAlteracaoQuantidade({
  modoCalculo,
  quantidadeAtual,
  novaQuantidade,
  tempoHoras,
  materiais,
  insumos,
}) {
  if (!Number.isSafeInteger(novaQuantidade) || novaQuantidade < 1 ||
      !Number.isSafeInteger(quantidadeAtual) || quantidadeAtual < 1) {
    throw new Error('INVALID_QUANTITY')
  }
  const fator = novaQuantidade / quantidadeAtual
  return {
    quantidade: novaQuantidade,
    tempoHoras: modoCalculo === MODO_CALCULO_TRADICIONAL
      ? escalar(tempoHoras, fator)
      : tempoHoras,
    materiais: modoCalculo === MODO_CALCULO_TRADICIONAL
      ? materiais.map((item) => ({ ...item, pesoGasto: escalar(item.pesoGasto, fator) }))
      : materiais,
    insumos: insumos.map((item) => {
      const quantidadeBase = item.quantidadeReferencia ?? item.quantidade
      const quantidadeComercialBase = item.quantidadeComercialReferencia ?? quantidadeAtual
      return {
        ...item,
        quantidade: escalar(quantidadeBase, novaQuantidade / quantidadeComercialBase),
      }
    }),
  }
}

export function invalidarParciaisIncompativeis(plates, quantidade) {
  let invalidou = false
  const atualizadas = plates.map((plate) => {
    const capacidade = Number(plate.capacidadeComercial)
    const restante = Number.isSafeInteger(capacidade) && capacidade > 0 ? quantidade % capacidade : null
    const possuiParcialReal = plate.parcialQuantidadeComercial != null ||
      plate.tempoParcialSegundos !== '' ||
      plate.filamentos.some((material) => material.gramasParcial !== '')
    if (!possuiParcialReal || restante === plate.parcialQuantidadeComercial) return plate
    invalidou = true
    return {
      ...plate,
      parcialQuantidadeComercial: null,
      tempoParcialSegundos: '',
      filamentos: plate.filamentos.map((material) => ({ ...material, gramasParcial: '' })),
    }
  })
  return { plates: atualizadas, invalidou }
}

export function resolverTrocaParaDimensionamentoManual({
  dimensionamentoAtual,
  quantidadeRevisada,
  confirmar = false,
}) {
  if (dimensionamentoAtual === DIMENSIONAMENTO_PLATES_MANUAL) {
    return { alterar: false, solicitarConfirmacao: false, quantidadeRevisada }
  }
  if (dimensionamentoAtual !== DIMENSIONAMENTO_PLATES_AUTOMATICO) {
    throw new Error('INVALID_PLATES_SIZING_MODE')
  }
  if (!confirmar) {
    return { alterar: false, solicitarConfirmacao: true, quantidadeRevisada }
  }
  return { alterar: true, solicitarConfirmacao: false, quantidadeRevisada: null }
}

export function estadoParcialRealFormulario(plate, quantidade) {
  const capacidade = Number(plate.capacidadeComercial)
  const quantidadeValida = Number.isSafeInteger(quantidade) && quantidade > 0
  const capacidadeValida = Number.isSafeInteger(capacidade) && capacidade > 0
  const quantidadeParcial = quantidadeValida && capacidadeValida ? quantidade % capacidade : null
  const editando = plate.parcialQuantidadeComercial != null ||
    plate.tempoParcialSegundos !== '' ||
    plate.filamentos.some((material) => material.gramasParcial !== '')
  const erros = []

  if (editando) {
    if (quantidadeParcial == null || quantidadeParcial <= 0 ||
        plate.parcialQuantidadeComercial !== quantidadeParcial) {
      erros.push('A parcial real não corresponde ao restante atual da referência.')
    }
    const tempo = Number(plate.tempoParcialSegundos)
    if (plate.tempoParcialSegundos === '' || !Number.isFinite(tempo) || tempo <= 0) {
      erros.push('Informe um tempo real da parcial maior que zero.')
    }
    if (plate.filamentos.some((material) => {
      const gramas = Number(material.gramasParcial)
      return material.gramasParcial === '' || !Number.isFinite(gramas) || gramas <= 0
    })) {
      erros.push('Informe uma gramagem real maior que zero para cada filamento da parcial.')
    }
  }

  return {
    editando,
    quantidadeParcial,
    valida: !editando || erros.length === 0,
    erros,
  }
}

export function assinaturaConversaoPlates(quantidade, agregacao) {
  if (!agregacao) throw new Error('INVALID_PLATES_AGGREGATION')
  return JSON.stringify({
    quantidade,
    tempoTotalMinutos: agregacao.tempoTotalMinutos,
    materiais: agregacao.materiais.map((item) => [item.filamento_id, item.peso_gasto_gramas]),
  })
}

export function converterPlatesParaTradicional({
  quantidade,
  agregacao,
  assinaturaAnterior,
  tempoHoras,
  materiais,
}) {
  const assinatura = assinaturaConversaoPlates(quantidade, agregacao)
  if (assinatura === assinaturaAnterior) {
    return { tempoHoras, materiais, assinatura, sincronizou: false }
  }
  return {
    tempoHoras: agregacao.tempoTotalHoras,
    materiais: agregacao.materiais.map((item) => ({
      id: `plate-total-${item.filamento_id}`,
      filamentoId: String(item.filamento_id),
      pesoGasto: item.peso_gasto_gramas,
    })),
    assinatura,
    sincronizou: true,
  }
}
