function adicionarMinutos(iso, minutos) {
  return new Date(new Date(iso).getTime() + minutos * 60 * 1000).toISOString()
}

function prioridadeStatus(status) {
  return status === 'Imprimindo' ? 0 : 1
}

function prioridadePedido(prioridade) {
  return prioridade === 'Urgente' ? 0 : prioridade === 'Alta' ? 1 : 2
}

function compararPedidos(a, b) {
  const status = prioridadeStatus(a.status) - prioridadeStatus(b.status)
  if (status !== 0) return status
  const prioridade = prioridadePedido(a.prioridade_producao) - prioridadePedido(b.prioridade_producao)
  if (prioridade !== 0) return prioridade
  const ordemA = Number.isFinite(a.ordem_fila) ? a.ordem_fila : Number.MAX_SAFE_INTEGER
  const ordemB = Number.isFinite(b.ordem_fila) ? b.ordem_fila : Number.MAX_SAFE_INTEGER
  if (ordemA !== ordemB) return ordemA - ordemB
  const entregaA = a.data_entrega || '9999-12-31'
  const entregaB = b.data_entrega || '9999-12-31'
  if (entregaA !== entregaB) return entregaA.localeCompare(entregaB)
  return String(a.data_pedido).localeCompare(String(b.data_pedido)) || a.id - b.id
}

function impressoraCompativel(pedido, impressora) {
  if (pedido.impressora_preferida_id && pedido.impressora_preferida_id !== impressora.id) return false
  if (!Number.isFinite(pedido.diametro_bico_mm) || pedido.diametro_bico_mm <= 0) return true
  const bicoAtual = Number.parseFloat(String(impressora.bico_atual ?? '').replace(',', '.'))
  return Number.isFinite(bicoAtual) && Math.abs(bicoAtual - pedido.diametro_bico_mm) < 0.011
}

function proximoHorarioLivre(inicioIso, duracaoHoras, bloqueios = []) {
  let inicio = new Date(inicioIso)
  if (Number.isNaN(inicio.getTime())) throw new RangeError('Data inicial inválida.')
  const duracaoMs = duracaoHoras * 60 * 60 * 1000
  const ordenados = bloqueios
    .map((item) => ({ ...item, inicio: new Date(item.inicio_em), fim: new Date(item.fim_em) }))
    .filter((item) => !Number.isNaN(item.inicio.getTime()) && !Number.isNaN(item.fim.getTime()) && item.fim > item.inicio)
    .sort((a, b) => a.inicio - b.inicio)

  let alterado = true
  while (alterado) {
    alterado = false
    const fim = new Date(inicio.getTime() + duracaoMs)
    for (const bloqueio of ordenados) {
      if (inicio < bloqueio.fim && fim > bloqueio.inicio) {
        inicio = new Date(bloqueio.fim)
        alterado = true
        break
      }
    }
  }
  return {
    inicio: inicio.toISOString(),
    fim: new Date(inicio.getTime() + duracaoMs).toISOString(),
  }
}

function agendarFila(impressora, pedidos, inicioBase) {
  const intervalo = Number.isFinite(impressora.intervalo_entre_trabalhos_minutos)
    ? Math.max(0, impressora.intervalo_entre_trabalhos_minutos)
    : 0
  let cursor = inicioBase
  const agendados = pedidos.map((pedido) => {
    const horario = proximoHorarioLivre(cursor, pedido.tempo_impressao_horas, impressora.bloqueios)
    cursor = adicionarMinutos(horario.fim, intervalo)
    return {
      ...pedido,
      inicio_previsto_calculado: horario.inicio,
      fim_previsto_calculado: horario.fim,
      atrasado: Boolean(pedido.data_entrega && horario.fim.slice(0, 10) > pedido.data_entrega.slice(0, 10)),
      incompatibilidade_tecnica: !impressoraCompativel(pedido, impressora),
    }
  })
  return { agendados, cursor }
}

/** Planeja filas, respeitando prioridade, ordem manual, bloqueios e intervalo operacional. */
export function planejarFilaProducao({ impressoras, pedidos, agora }) {
  const inicioBase = new Date(agora)
  if (Number.isNaN(inicioBase.getTime())) throw new RangeError('Data inicial inválida.')

  const pedidosValidos = pedidos.filter((pedido) => (
    ['Fila', 'Imprimindo'].includes(pedido.status) &&
    Number.isFinite(pedido.tempo_impressao_horas) &&
    pedido.tempo_impressao_horas > 0
  ))
  const impressorasDisponiveis = new Set(impressoras.map((impressora) => impressora.id))
  const semImpressoraBase = pedidosValidos
    .filter((pedido) => !pedido.impressora_id || !impressorasDisponiveis.has(pedido.impressora_id))
    .sort(compararPedidos)

  const cursores = new Map()
  const filas = impressoras.map((impressora) => {
    const atribuidos = pedidosValidos
      .filter((pedido) => pedido.impressora_id === impressora.id)
      .sort(compararPedidos)
    const { agendados, cursor } = agendarFila(impressora, atribuidos, inicioBase.toISOString())
    cursores.set(impressora.id, cursor)
    return {
      ...impressora,
      pedidos: agendados,
      horas_planejadas: atribuidos.reduce((total, pedido) => total + pedido.tempo_impressao_horas, 0),
      livre_em: agendados.at(-1)?.fim_previsto_calculado ?? inicioBase.toISOString(),
      atrasados: agendados.filter((pedido) => pedido.atrasado).length,
    }
  })

  const semImpressora = semImpressoraBase.map((pedido) => {
    let melhor = null
    for (const impressora of impressoras.filter((item) => impressoraCompativel(pedido, item))) {
      const horario = proximoHorarioLivre(
        cursores.get(impressora.id) ?? inicioBase.toISOString(),
        pedido.tempo_impressao_horas,
        impressora.bloqueios,
      )
      if (!melhor || horario.fim < melhor.fim_previsto_sugerido) {
        melhor = {
          impressora_sugerida_id: impressora.id,
          impressora_sugerida_nome: impressora.nome,
          inicio_previsto_sugerido: horario.inicio,
          fim_previsto_sugerido: horario.fim,
        }
      }
    }
    if (!melhor) return { ...pedido, impressora_sugerida_id: null, impressora_sugerida_nome: null,
      inicio_previsto_sugerido: null, fim_previsto_sugerido: null, atrasado_sugerido: false }
    const impressora = impressoras.find((item) => item.id === melhor.impressora_sugerida_id)
    cursores.set(melhor.impressora_sugerida_id, adicionarMinutos(
      melhor.fim_previsto_sugerido,
      impressora?.intervalo_entre_trabalhos_minutos ?? 0,
    ))
    return {
      ...pedido,
      ...melhor,
      atrasado_sugerido: Boolean(pedido.data_entrega && melhor.fim_previsto_sugerido.slice(0, 10) > pedido.data_entrega.slice(0, 10)),
    }
  })

  return { impressoras: filas, semImpressora }
}
