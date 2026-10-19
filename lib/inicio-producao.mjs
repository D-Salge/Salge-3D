import { calcularValorSinal } from './sinal.mjs'

const centavos = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100

function exigirOperador(contexto) {
  if (!contexto || !['admin', 'operador'].includes(contexto.perfil)) throw new Error('FORBIDDEN')
  if (!Number.isSafeInteger(contexto.tenantId) || !Number.isSafeInteger(contexto.usuarioId)) {
    throw new Error('UNAUTHORIZED')
  }
}

function registrarEvento(db, contexto, pedidoId, entidade, entidadeId, descricao) {
  db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
    VALUES (?, ?, ?, ?, ?)`
  ).run(contexto.tenantId, pedidoId, contexto.usuarioId,
    entidade === 'Pedido' ? 'Status de produção' : 'Lote de produção', descricao)
  db.prepare(`INSERT INTO auditoria
    (tenant_id, usuario_id, entidade, entidade_id, acao, descricao)
    VALUES (?, ?, ?, ?, ?, ?)`
  ).run(contexto.tenantId, contexto.usuarioId, entidade, entidadeId,
    entidade === 'Pedido' ? 'STATUS_PRODUCAO' : 'ATUALIZAR', descricao)
}

export function calcularSinalPendenteProducao({ valorTotal, sinalPercentual, totalRecebido }) {
  const recebido = Number(totalRecebido)
  if (!Number.isFinite(recebido) || recebido < 0) throw new RangeError('Total recebido inválido.')
  return centavos(Math.max(0, calcularValorSinal(valorTotal, sinalPercentual) - recebido))
}

export function exigirSinalParaIniciarProducao(pedido) {
  const pendente = calcularSinalPendenteProducao(pedido)
  if (pendente > 0.009) throw new Error(`SIGNAL_PENDING:${pendente}`)
}

export function iniciarProducaoPedidoNoBanco(db, contexto, pedidoId) {
  exigirOperador(contexto)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) throw new Error('INVALID_INPUT')
  return db.transaction(() => {
    const pedido = db.prepare(`SELECT status, orcamento_status,
        valor_total_cobrado AS valorTotal, sinal_percentual AS sinalPercentual,
        COALESCE((SELECT SUM(r.valor) FROM recebimentos r
          WHERE r.pedido_id = pedidos.id AND r.tenant_id = pedidos.tenant_id
            AND r.estornado_em IS NULL), 0) AS totalRecebido
      FROM pedidos WHERE id = ? AND tenant_id = ?`
    ).get(pedidoId, contexto.tenantId)
    if (!pedido) throw new Error('NOT_FOUND')
    if (pedido.orcamento_status !== 'Aprovado') throw new Error('NOT_APPROVED')
    if (pedido.status === 'Imprimindo') return 'UNCHANGED'
    if (pedido.status !== 'Fila') throw new Error('INVALID_TRANSITION')

    exigirSinalParaIniciarProducao(pedido)
    const atualizado = db.prepare(`UPDATE pedidos SET status = 'Imprimindo'
      WHERE id = ? AND tenant_id = ? AND status = 'Fila'`
    ).run(pedidoId, contexto.tenantId)
    if (atualizado.changes !== 1) throw new Error('STATUS_CHANGED')
    registrarEvento(db, contexto, pedidoId, 'Pedido', pedidoId, 'Fila → Imprimindo')
    return 'UPDATED'
  }).immediate()
}

export function atualizarLoteProducaoNoBanco(db, contexto, data) {
  exigirOperador(contexto)
  const statusValidos = ['Planejado', 'Imprimindo', 'Concluído', 'Cancelado']
  if (!data || !Number.isSafeInteger(data.loteId) || data.loteId <= 0 ||
      !statusValidos.includes(data.status) ||
      !Number.isFinite(data.quantidadeProduzida) || data.quantidadeProduzida < 0 ||
      (data.tempoRealHoras !== null && (!Number.isFinite(data.tempoRealHoras) || data.tempoRealHoras < 0))) {
    throw new Error('INVALID_INPUT')
  }

  return db.transaction(() => {
    const lote = db.prepare(`SELECT l.id, l.pedido_id, l.codigo, l.status,
        l.quantidade_planejada, l.quantidade_produzida, l.tempo_real_horas,
        p.status AS pedido_status, p.orcamento_status,
        p.valor_total_cobrado AS valorTotal, p.sinal_percentual AS sinalPercentual,
        COALESCE((SELECT SUM(r.valor) FROM recebimentos r
          WHERE r.pedido_id = p.id AND r.tenant_id = p.tenant_id
            AND r.estornado_em IS NULL), 0) AS totalRecebido
      FROM lotes_producao l
      JOIN pedidos p ON p.id = l.pedido_id AND p.tenant_id = l.tenant_id
      WHERE l.id = ? AND l.tenant_id = ?`
    ).get(data.loteId, contexto.tenantId)
    if (!lote) throw new Error('NOT_FOUND')
    if (lote.status === 'Cancelado') throw new Error('CANCELED')
    if (data.quantidadeProduzida + 0.001 < lote.quantidade_produzida) throw new Error('REGRESSION')
    if (data.quantidadeProduzida > lote.quantidade_planejada + 0.001) throw new Error('OVER')
    if (data.status === 'Concluído' &&
        Math.abs(data.quantidadeProduzida - lote.quantidade_planejada) > 0.001) {
      throw new Error('INCOMPLETE')
    }

    const quantidadeIgual = Math.abs(data.quantidadeProduzida - lote.quantidade_produzida) <= 0.001
    const tempoIgual = data.tempoRealHoras === null
      ? lote.tempo_real_horas === null
      : lote.tempo_real_horas !== null && Math.abs(data.tempoRealHoras - lote.tempo_real_horas) <= 0.001
    const loteInalterado = lote.status === data.status && quantidadeIgual && tempoIgual
    const precisaSincronizarInicio = lote.pedido_status === 'Fila' &&
      lote.status === 'Imprimindo' && data.status === 'Imprimindo'
    if (loteInalterado && !precisaSincronizarInicio) {
      return { resultado: 'UNCHANGED', pedidoId: lote.pedido_id }
    }

    const tentaIniciarPedido = lote.pedido_status === 'Fila' && (
      data.status === 'Imprimindo' || data.status === 'Concluído' ||
      data.quantidadeProduzida > lote.quantidade_produzida + 0.001
    )
    if (tentaIniciarPedido) {
      if (lote.orcamento_status !== 'Aprovado') throw new Error('NOT_APPROVED')
      exigirSinalParaIniciarProducao(lote)
    }

    const transicoesPermitidas = {
      Planejado: ['Imprimindo', 'Cancelado'],
      Imprimindo: ['Imprimindo', 'Concluído', 'Cancelado'],
      Concluído: [],
    }
    if (lote.status === 'Planejado' && data.status === 'Planejado') {
      throw new Error('PRODUCTION_NOT_STARTED')
    }
    if (!transicoesPermitidas[lote.status]?.includes(data.status)) {
      throw new Error('INVALID_LOT_TRANSITION')
    }

    db.prepare(`UPDATE lotes_producao SET status = ?, quantidade_produzida = ?, tempo_real_horas = ?,
        inicio_em = CASE WHEN ? = 'Imprimindo' AND inicio_em IS NULL
          THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE inicio_em END,
        fim_em = CASE WHEN ? = 'Concluído'
          THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE fim_em END
      WHERE id = ? AND tenant_id = ?`
    ).run(data.status, data.quantidadeProduzida, data.tempoRealHoras,
      data.status, data.status, data.loteId, contexto.tenantId)

    const produzido = db.prepare(`SELECT COALESCE(SUM(quantidade_produzida), 0) AS total
      FROM lotes_producao WHERE pedido_id = ? AND tenant_id = ? AND status != 'Cancelado'`
    ).get(lote.pedido_id, contexto.tenantId).total
    const pedidoAtualizado = db.prepare(`UPDATE pedidos
      SET quantidade_produzida = MAX(quantidade_produzida, MIN(quantidade, ?)),
        status = CASE WHEN ? = 'Imprimindo' AND status = 'Fila' THEN 'Imprimindo' ELSE status END
      WHERE id = ? AND tenant_id = ?`
    ).run(produzido, data.status, lote.pedido_id, contexto.tenantId)
    if (pedidoAtualizado.changes !== 1) throw new Error('STATUS_CHANGED')

    const descricao = `${lote.codigo}: ${lote.status} → ${data.status}; ` +
      `${data.quantidadeProduzida}/${lote.quantidade_planejada}`
    registrarEvento(db, contexto, lote.pedido_id, 'LoteProducao', data.loteId, descricao)
    return { resultado: 'UPDATED', pedidoId: lote.pedido_id }
  }).immediate()
}

export function mensagemErroInicioProducao(error) {
  const codigo = error instanceof Error ? error.message : ''
  if (codigo.startsWith('SIGNAL_PENDING:')) {
    const pendente = Number(codigo.split(':')[1])
    return `Ainda faltam R$ ${pendente.toFixed(2).replace('.', ',')} do sinal para iniciar a produção.`
  }
  const mensagens = {
    INVALID_INPUT: 'Dados de produção inválidos.',
    NOT_FOUND: 'Pedido ou lote não encontrado.',
    NOT_APPROVED: 'Aprove o orçamento antes de iniciar a produção.',
    INVALID_TRANSITION: 'Essa mudança de status não é permitida.',
    INVALID_LOT_TRANSITION: 'Essa transição de status do lote não é permitida.',
    PRODUCTION_NOT_STARTED: 'Inicie o lote antes de registrar avanço ou tempo de produção.',
    STATUS_CHANGED: 'Os dados mudaram durante a operação. Tente novamente.',
  }
  return mensagens[codigo] ?? null
}
