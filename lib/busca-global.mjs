export function normalizarTermoBusca(valor, limite = 80) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ').slice(0, limite)
}

export function normalizarTextoBusca(valor) {
  return normalizarTermoBusca(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

export function criarPadraoLike(valor) {
  const termo = normalizarTextoBusca(valor)
  if (termo.length < 2) return null
  return `%${termo.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')}%`
}

