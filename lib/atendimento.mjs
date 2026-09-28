export const TIPOS_OCORRENCIA = [
  'Falha de impressão', 'Defeito', 'Devolução', 'Garantia', 'Reimpressão', 'Outro',
]

export const ACOES_OCORRENCIA = ['Reimprimir', 'Trocar', 'Estornar', 'Crédito', 'Sem ação']

export function normalizarCodigoRastreio(valor) {
  return String(valor || '').trim().replace(/\s+/g, '').toUpperCase().slice(0, 100)
}

export function determinarStatusExpedicao({ postadoEm, entregueEm, previsaoEntrega, hoje }) {
  if (entregueEm) return 'Entregue'
  if (postadoEm && previsaoEntrega && previsaoEntrega < hoje) return 'Atrasado'
  if (postadoEm) return 'Em trânsito'
  return 'Preparando'
}

export function resumirAtendimento(ocorrencias, expedicoes, hoje) {
  return {
    ocorrenciasAbertas: ocorrencias.filter((item) => !['Resolvida', 'Cancelada'].includes(item.status)).length,
    reimpressoesPendentes: ocorrencias.filter((item) => item.acao === 'Reimprimir' && item.status !== 'Resolvida').length,
    expedicoesEmAberto: expedicoes.filter((item) => !['Entregue', 'Cancelada'].includes(item.status)).length,
    expedicoesAtrasadas: expedicoes.filter((item) => item.status !== 'Cancelada' && determinarStatusExpedicao({
      postadoEm: item.postado_em, entregueEm: item.entregue_em,
      previsaoEntrega: item.previsao_entrega, hoje,
    }) === 'Atrasado').length,
  }
}
