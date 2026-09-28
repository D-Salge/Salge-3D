export function normalizarNomeProduto(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

export function proximaVersao(versoes) {
  return Math.max(0, ...versoes.map((item) => Number(item) || 0)) + 1
}

export function custoFichaTecnica(itens) {
  return Math.round(itens.reduce((total, item) => total +
    Number(item.quantidadePorUnidade || 0) * Number(item.custoUnitario || 0), 0) * 100) / 100
}
