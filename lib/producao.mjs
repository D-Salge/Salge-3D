function adicionarHoras(iso, horas) {
  return new Date(new Date(iso).getTime() + horas * 60 * 60 * 1000).toISOString()
}

function prioridadeStatus(status) {
  return status === 'Imprimindo' ? 0 : 1
}

/** Planeja a fila de cada impressora em execução contínua, sem sobreposição. */
export function planejarFilaProducao({ impressoras, pedidos, agora }) {
  const inicioBase = new Date(agora)
  if (Number.isNaN(inicioBase.getTime())) throw new RangeError('Data inicial inválida.')

  const pedidosValidos = pedidos.filter((pedido) => (
    ['Fila', 'Imprimindo'].includes(pedido.status) &&
    Number.isFinite(pedido.tempo_impressao_horas) &&
    pedido.tempo_impressao_horas > 0
  ))
  const impressorasDisponiveis = new Set(impressoras.map((impressora) => impressora.id))
  const semImpressora = pedidosValidos.filter((pedido) => (
    !pedido.impressora_id || !impressorasDisponiveis.has(pedido.impressora_id)
  ))

  const filas = impressoras.map((impressora) => {
    const atribuidos = pedidosValidos
      .filter((pedido) => pedido.impressora_id === impressora.id)
      .sort((a, b) => {
        const status = prioridadeStatus(a.status) - prioridadeStatus(b.status)
        if (status !== 0) return status
        const entregaA = a.data_entrega || '9999-12-31'
        const entregaB = b.data_entrega || '9999-12-31'
        if (entregaA !== entregaB) return entregaA.localeCompare(entregaB)
        return String(a.data_pedido).localeCompare(String(b.data_pedido)) || a.id - b.id
      })

    let cursor = inicioBase.toISOString()
    const agendados = atribuidos.map((pedido) => {
      const inicioPrevisto = cursor
      const fimPrevisto = adicionarHoras(inicioPrevisto, pedido.tempo_impressao_horas)
      cursor = fimPrevisto
      return {
        ...pedido,
        inicio_previsto_calculado: inicioPrevisto,
        fim_previsto_calculado: fimPrevisto,
        atrasado: Boolean(pedido.data_entrega && fimPrevisto.slice(0, 10) > pedido.data_entrega.slice(0, 10)),
      }
    })

    return {
      ...impressora,
      pedidos: agendados,
      horas_planejadas: atribuidos.reduce((total, pedido) => total + pedido.tempo_impressao_horas, 0),
      livre_em: agendados.at(-1)?.fim_previsto_calculado ?? inicioBase.toISOString(),
      atrasados: agendados.filter((pedido) => pedido.atrasado).length,
    }
  })

  return { impressoras: filas, semImpressora }
}
