export const MODO_CALCULO_TRADICIONAL = 'Tradicional'
export const MODO_CALCULO_PLATES = 'Plates'

const LIMITE_PLATES = 100
const LIMITE_FILAMENTOS_POR_PLATE = 16

function inteiroPositivo(valor, campo, maximo = 100_000) {
  if (!Number.isSafeInteger(valor) || valor <= 0 || valor > maximo) {
    throw new Error(`INVALID_${campo}`)
  }
  return valor
}

function numeroPositivo(valor, campo, maximo = 1_000_000) {
  if (!Number.isFinite(valor) || valor <= 0 || valor > maximo) {
    throw new Error(`INVALID_${campo}`)
  }
  return valor
}

export function validarEAgruparPlates(plates) {
  if (!Array.isArray(plates) || plates.length < 1 || plates.length > LIMITE_PLATES) {
    throw new Error('INVALID_PLATES')
  }

  let totalExecucoes = 0
  let tempoTotalMinutos = 0
  const materiaisPorFilamento = new Map()
  const normalizadas = plates.map((plate, indice) => {
    if (!plate || typeof plate.nome !== 'string' || !plate.nome.trim() || plate.nome.trim().length > 120) {
      throw new Error('INVALID_PLATE_NAME')
    }
    const quantidadePecas = inteiroPositivo(plate.quantidade_pecas, 'PLATE_QUANTITY')
    const repeticoes = inteiroPositivo(plate.repeticoes, 'PLATE_REPETITIONS', 10_000)
    const tempoExecucaoMinutos = inteiroPositivo(plate.tempo_execucao_minutos, 'PLATE_TIME', 600_000)
    if (!Array.isArray(plate.filamentos) || plate.filamentos.length < 1 || plate.filamentos.length > LIMITE_FILAMENTOS_POR_PLATE) {
      throw new Error('INVALID_PLATE_MATERIALS')
    }

    const filamentosVistos = new Set()
    const filamentos = plate.filamentos.map((material) => {
      const filamentoId = inteiroPositivo(material?.filamento_id, 'FILAMENT_ID')
      const gramasPorExecucao = numeroPositivo(material?.gramas_por_execucao, 'FILAMENT_WEIGHT', 100_000)
      if (filamentosVistos.has(filamentoId)) throw new Error('DUPLICATE_PLATE_FILAMENT')
      filamentosVistos.add(filamentoId)
      materiaisPorFilamento.set(
        filamentoId,
        (materiaisPorFilamento.get(filamentoId) ?? 0) + gramasPorExecucao * repeticoes,
      )
      return { filamento_id: filamentoId, gramas_por_execucao: gramasPorExecucao }
    })

    totalExecucoes += repeticoes
    tempoTotalMinutos += tempoExecucaoMinutos * repeticoes
    if (!Number.isSafeInteger(totalExecucoes) || totalExecucoes > 100_000 ||
        !Number.isSafeInteger(tempoTotalMinutos) || tempoTotalMinutos > 600_000) {
      throw new Error('PLATES_TOTAL_TOO_LARGE')
    }

    return {
      ordem: indice + 1,
      nome: plate.nome.trim(),
      quantidade_pecas: quantidadePecas,
      repeticoes,
      tempo_execucao_minutos: tempoExecucaoMinutos,
      filamentos,
    }
  })

  return {
    plates: normalizadas,
    totalExecucoes,
    tempoTotalMinutos,
    tempoTotalHoras: tempoTotalMinutos / 60,
    materiais: Array.from(materiaisPorFilamento, ([filamento_id, peso_gasto_gramas]) => ({
      filamento_id,
      peso_gasto_gramas,
    })),
  }
}

export function substituirPlatesPedidoNoBanco(db, contexto, pedidoId, plates) {
  const pedido = db.prepare('SELECT id FROM pedidos WHERE id = ? AND tenant_id = ?')
    .get(pedidoId, contexto.tenantId)
  if (!pedido) throw new Error('NOT_FOUND')

  const filamentoDaEmpresa = db.prepare('SELECT id FROM filamentos WHERE id = ? AND tenant_id = ?')
  for (const plate of plates) {
    for (const material of plate.filamentos) {
      if (!filamentoDaEmpresa.get(material.filamento_id, contexto.tenantId)) {
        throw new Error('INVALID_FILAMENT')
      }
    }
  }

  db.prepare('DELETE FROM pedido_plates WHERE pedido_id = ? AND tenant_id = ?')
    .run(pedidoId, contexto.tenantId)
  if (plates.length === 0) return

  const inserirPlate = db.prepare(`
    INSERT INTO pedido_plates (
      tenant_id, pedido_id, ordem, nome, quantidade_pecas, repeticoes, tempo_execucao_minutos
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const inserirFilamento = db.prepare(`
    INSERT INTO pedido_plate_filamentos (
      tenant_id, plate_id, filamento_id, gramas_por_execucao
    ) VALUES (?, ?, ?, ?)
  `)
  for (const plate of plates) {
    const plateId = Number(inserirPlate.run(
      contexto.tenantId,
      pedidoId,
      plate.ordem,
      plate.nome,
      plate.quantidade_pecas,
      plate.repeticoes,
      plate.tempo_execucao_minutos,
    ).lastInsertRowid)
    for (const material of plate.filamentos) {
      inserirFilamento.run(
        contexto.tenantId,
        plateId,
        material.filamento_id,
        material.gramas_por_execucao,
      )
    }
  }
}

export function obterPlatesPedidoNoBanco(db, contexto, pedidoId) {
  const plates = db.prepare(`
    SELECT pp.id, pp.ordem, pp.nome, pp.quantidade_pecas, pp.repeticoes,
      pp.tempo_execucao_minutos
    FROM pedido_plates pp
    JOIN pedidos p ON p.id = pp.pedido_id AND p.tenant_id = pp.tenant_id
    WHERE pp.pedido_id = ? AND pp.tenant_id = ?
    ORDER BY pp.ordem, pp.id
  `).all(pedidoId, contexto.tenantId)
  const buscarFilamentos = db.prepare(`
    SELECT ppf.filamento_id, ppf.gramas_por_execucao
    FROM pedido_plate_filamentos ppf
    JOIN filamentos f ON f.id = ppf.filamento_id AND f.tenant_id = ppf.tenant_id
    WHERE ppf.plate_id = ? AND ppf.tenant_id = ?
    ORDER BY ppf.id
  `)
  return plates.map((plate) => ({
    ...plate,
    filamentos: buscarFilamentos.all(plate.id, contexto.tenantId),
  }))
}
