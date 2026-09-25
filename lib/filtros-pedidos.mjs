function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function filtrarPedidos(pedidos, filtros = {}) {
  const busca = normalizar(filtros.busca)
  return pedidos.filter((pedido) => {
    if (busca) {
      const conteudo = normalizar(`${pedido.numero_orcamento ?? ''} ${pedido.nome_da_peca} ${pedido.cliente_nome}`)
      if (!conteudo.includes(busca)) return false
    }
    if (filtros.orcamento && filtros.orcamento !== 'Todos' && pedido.orcamento_status !== filtros.orcamento) return false
    if (filtros.producao && filtros.producao !== 'Todos' && pedido.status !== filtros.producao) return false
    const saldo = Math.max(0, Number(pedido.valor_total_cobrado) - Number(pedido.total_recebido))
    if (filtros.financeiro === 'Pendente' && saldo <= 0) return false
    if (filtros.financeiro === 'Quitado' && saldo > 0) return false
    return true
  })
}

export function resumirPedidos(pedidos) {
  return pedidos.reduce((resumo, pedido) => {
    const total = Number(pedido.valor_total_cobrado) || 0
    const recebido = Number(pedido.total_recebido) || 0
    resumo.quantidade += 1
    resumo.total += total
    resumo.recebido += recebido
    resumo.pendente += Math.max(0, total - recebido)
    return resumo
  }, { quantidade: 0, total: 0, recebido: 0, pendente: 0 })
}
