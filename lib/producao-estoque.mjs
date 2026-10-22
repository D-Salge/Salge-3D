const STATUS = ['Planejada', 'Em produção', 'Conferência', 'Concluída', 'Cancelada', 'Falhou']
const OPERACAO_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,159}$/

function moeda(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100
}

function exigirOperador(contexto) {
  if (!contexto || !Number.isSafeInteger(contexto.tenantId) || !Number.isSafeInteger(contexto.usuarioId)) {
    throw new Error('UNAUTHORIZED')
  }
  if (!['admin', 'operador'].includes(contexto.perfil)) throw new Error('FORBIDDEN')
}

function auditar(db, contexto, entidade, entidadeId, acao, descricao, detalhes) {
  db.prepare(`INSERT INTO auditoria
    (tenant_id, usuario_id, entidade, entidade_id, acao, descricao, dados_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(contexto.tenantId, contexto.usuarioId, entidade, entidadeId, acao, descricao,
    detalhes === undefined ? null : JSON.stringify(detalhes))
}

function validarLista(lista, chaveId, chaveQuantidade) {
  if (!Array.isArray(lista) || lista.length > 100) throw new Error('INVALID_INPUT')
  const ids = new Set()
  for (const item of lista) {
    if (!Number.isSafeInteger(item[chaveId]) || item[chaveId] <= 0 || ids.has(item[chaveId]) ||
        !Number.isFinite(item[chaveQuantidade]) || item[chaveQuantidade] < 0 || item[chaveQuantidade] > 1_000_000) {
      throw new Error('INVALID_INPUT')
    }
    ids.add(item[chaveId])
  }
}

function validarOrdem(data) {
  if (!data || !Number.isSafeInteger(data.produtoId) || data.produtoId <= 0 ||
      !Number.isSafeInteger(data.produtoVersaoId) || data.produtoVersaoId <= 0 ||
      !Number.isSafeInteger(data.quantidadePlanejada) || data.quantidadePlanejada <= 0 ||
      !Number.isSafeInteger(data.quantidadePorPlate) || data.quantidadePorPlate <= 0 ||
      !Number.isSafeInteger(data.execucoesPlanejadas) || data.execucoesPlanejadas <= 0 ||
      !Number.isFinite(data.tempoEstimadoExecucaoHoras) || data.tempoEstimadoExecucaoHoras < 0 ||
      (data.impressoraId !== null && (!Number.isSafeInteger(data.impressoraId) || data.impressoraId <= 0))) {
    throw new Error('INVALID_INPUT')
  }
  if (typeof data.identificacaoLote !== 'string' || !data.identificacaoLote.trim() || data.identificacaoLote.trim().length > 80 ||
      (data.dataPrevista && !/^\d{4}-\d{2}-\d{2}$/.test(data.dataPrevista)) ||
      typeof data.observacoes !== 'string' || data.observacoes.length > 2000 ||
      typeof data.arquivosReferencia !== 'string' || data.arquivosReferencia.length > 4000) {
    throw new Error('INVALID_INPUT')
  }
  validarLista(data.filamentos, 'filamentoId', 'gramasPrevistas')
  validarLista(data.insumos, 'insumoId', 'quantidadePrevista')
}

/** Cria uma ordem interna sem cliente, parcelas, recebimentos ou receita. */
export function criarOrdemProducaoEstoqueNoBanco(db, contexto, data) {
  exigirOperador(contexto)
  validarOrdem(data)
  return db.transaction(() => {
    const versao = db.prepare(`SELECT pv.id, pv.produto_id
      FROM produto_versoes pv JOIN produtos_catalogo pc ON pc.id = pv.produto_id
      WHERE pv.id = ? AND pv.produto_id = ? AND pc.tenant_id = ? AND pc.ativo = 1`
    ).get(data.produtoVersaoId, data.produtoId, contexto.tenantId)
    if (!versao) throw new Error('PRODUCT_NOT_FOUND')
    if (data.impressoraId && !db.prepare(`SELECT 1 FROM impressoras
      WHERE id = ? AND tenant_id = ? AND ativo = 1`).get(data.impressoraId, contexto.tenantId)) {
      throw new Error('PRINTER_NOT_FOUND')
    }
    for (const item of data.filamentos) {
      if (!db.prepare('SELECT 1 FROM filamentos WHERE id = ? AND tenant_id = ? AND ativo = 1')
        .get(item.filamentoId, contexto.tenantId)) throw new Error('MATERIAL_NOT_FOUND')
    }
    for (const item of data.insumos) {
      if (!db.prepare('SELECT 1 FROM insumos WHERE id = ? AND tenant_id = ? AND ativo = 1')
        .get(item.insumoId, contexto.tenantId)) throw new Error('MATERIAL_NOT_FOUND')
    }
    const sequencia = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM ordens_producao_estoque WHERE tenant_id = ?')
      .get(contexto.tenantId).proximo
    const codigo = `OPE-${String(sequencia).padStart(6, '0')}`
    const resultado = db.prepare(`INSERT INTO ordens_producao_estoque (
      tenant_id, usuario_id, produto_id, produto_versao_id, impressora_id, codigo,
      identificacao_lote, quantidade_planejada, quantidade_por_plate, execucoes_planejadas,
      tempo_estimado_execucao_horas, data_prevista, observacoes, arquivos_referencia
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(contexto.tenantId, contexto.usuarioId, data.produtoId, data.produtoVersaoId,
      data.impressoraId, codigo, data.identificacaoLote.trim(), data.quantidadePlanejada,
      data.quantidadePorPlate, data.execucoesPlanejadas, data.tempoEstimadoExecucaoHoras,
      data.dataPrevista || null, data.observacoes.trim() || null, data.arquivosReferencia.trim() || null)
    const ordemId = Number(resultado.lastInsertRowid)
    const inserirFilamento = db.prepare(`INSERT INTO ordem_producao_estoque_filamentos
      (tenant_id, ordem_id, filamento_id, gramas_previstas) VALUES (?, ?, ?, ?)`)
    for (const item of data.filamentos) inserirFilamento.run(contexto.tenantId, ordemId, item.filamentoId, item.gramasPrevistas)
    const inserirInsumo = db.prepare(`INSERT INTO ordem_producao_estoque_insumos
      (tenant_id, ordem_id, insumo_id, quantidade_prevista) VALUES (?, ?, ?, ?)`)
    for (const item of data.insumos) inserirInsumo.run(contexto.tenantId, ordemId, item.insumoId, item.quantidadePrevista)
    auditar(db, contexto, 'OrdemProducaoEstoque', ordemId, 'CRIAR',
      `${codigo} · ${data.quantidadePlanejada} unidade(s)`, { identificacaoLote: data.identificacaoLote.trim() })
    return { ordemId, codigo }
  }).immediate()
}

export function atualizarStatusOrdemProducaoEstoqueNoBanco(db, contexto, ordemId, novoStatus) {
  exigirOperador(contexto)
  if (!Number.isSafeInteger(ordemId) || ordemId <= 0 || !STATUS.includes(novoStatus)) throw new Error('INVALID_INPUT')
  const transicoes = {
    Planejada: ['Em produção', 'Cancelada'],
    'Em produção': ['Conferência', 'Falhou', 'Cancelada'],
    Conferência: ['Concluída', 'Falhou'],
    Concluída: [], Cancelada: [], Falhou: [],
  }
  return db.transaction(() => {
    const ordem = db.prepare('SELECT status FROM ordens_producao_estoque WHERE id = ? AND tenant_id = ?')
      .get(ordemId, contexto.tenantId)
    if (!ordem) throw new Error('NOT_FOUND')
    if (ordem.status === novoStatus) return 'UNCHANGED'
    if (novoStatus === 'Concluída' || !transicoes[ordem.status]?.includes(novoStatus)) throw new Error('INVALID_TRANSITION')
    const colunaData = novoStatus === 'Em produção' ? 'iniciada_em' : novoStatus === 'Conferência' ? 'conferencia_em' : novoStatus === 'Cancelada' ? 'cancelada_em' : null
    const atualizado = db.prepare(`UPDATE ordens_producao_estoque SET status = ?${colunaData ? `, ${colunaData} = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')` : ''}
      WHERE id = ? AND tenant_id = ? AND status = ?`).run(novoStatus, ordemId, contexto.tenantId, ordem.status)
    if (atualizado.changes !== 1) throw new Error('STATUS_CHANGED')
    auditar(db, contexto, 'OrdemProducaoEstoque', ordemId, 'STATUS', `${ordem.status} → ${novoStatus}`)
    return 'UPDATED'
  }).immediate()
}

function baixarFilamentoFIFO(db, contexto, ordemId, item) {
  const filamento = db.prepare(`SELECT material || ' ' || cor AS nome,
      COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo, preco_rolo, peso_rolo_gramas
    FROM filamentos WHERE id = ? AND tenant_id = ?`).get(item.filamentoId, contexto.tenantId)
  if (!filamento || filamento.saldo + 0.0001 < item.gramasReais) throw new Error(`INSUFFICIENT_STOCK:${filamento?.nome ?? 'filamento'}`)
  const lotes = db.prepare(`SELECT id, saldo_gramas, peso_inicial_gramas, preco_compra
    FROM lotes_filamento WHERE tenant_id = ? AND filamento_id = ? AND ativo = 1 AND saldo_gramas > 0
    ORDER BY COALESCE(aberto_em, substr(criado_em, 1, 10)), id`).all(contexto.tenantId, item.filamentoId)
  if (lotes.reduce((soma, lote) => soma + lote.saldo_gramas, 0) + 0.0001 < item.gramasReais) {
    throw new Error(`INSUFFICIENT_STOCK:${filamento.nome} (lotes)`)
  }
  if (db.prepare(`UPDATE filamentos SET estoque_gramas = COALESCE(estoque_gramas, peso_rolo_gramas) - ?
    WHERE id = ? AND tenant_id = ? AND COALESCE(estoque_gramas, peso_rolo_gramas) >= ?`)
    .run(item.gramasReais, item.filamentoId, contexto.tenantId, item.gramasReais).changes !== 1) throw new Error('STOCK_CHANGED')
  let restante = item.gramasReais
  let saldoCorrente = filamento.saldo
  let custo = 0
  for (const lote of lotes) {
    if (restante <= 0.0001) break
    const quantidade = Math.min(restante, lote.saldo_gramas)
    if (db.prepare(`UPDATE lotes_filamento SET saldo_gramas = saldo_gramas - ?
      WHERE id = ? AND tenant_id = ? AND saldo_gramas >= ?`).run(quantidade, lote.id, contexto.tenantId, quantidade).changes !== 1) {
      throw new Error('STOCK_CHANGED')
    }
    const custoGrama = lote.preco_compra > 0 && lote.peso_inicial_gramas > 0
      ? lote.preco_compra / lote.peso_inicial_gramas
      : filamento.preco_rolo / filamento.peso_rolo_gramas
    custo += quantidade * custoGrama
    db.prepare(`INSERT INTO movimentos_estoque (
      tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id,
      ordem_producao_estoque_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo
    ) VALUES (?, ?, 'Filamento', ?, ?, ?, 'Saida', ?, ?, ?, 'Consumo da produção para estoque')`
    ).run(contexto.tenantId, contexto.usuarioId, item.filamentoId, lote.id, ordemId,
      quantidade, saldoCorrente, saldoCorrente - quantidade)
    saldoCorrente -= quantidade
    restante = Math.max(0, restante - quantidade)
  }
  return moeda(custo)
}

function baixarInsumo(db, contexto, ordemId, item) {
  const insumo = db.prepare('SELECT nome, estoque_atual, custo_unitario FROM insumos WHERE id = ? AND tenant_id = ?')
    .get(item.insumoId, contexto.tenantId)
  if (!insumo || insumo.estoque_atual + 0.0001 < item.quantidadeReal) throw new Error(`INSUFFICIENT_STOCK:${insumo?.nome ?? 'insumo'}`)
  if (db.prepare(`UPDATE insumos SET estoque_atual = estoque_atual - ?
    WHERE id = ? AND tenant_id = ? AND estoque_atual >= ?`)
    .run(item.quantidadeReal, item.insumoId, contexto.tenantId, item.quantidadeReal).changes !== 1) throw new Error('STOCK_CHANGED')
  db.prepare(`INSERT INTO movimentos_estoque (
    tenant_id, usuario_id, tipo_item, item_id, ordem_producao_estoque_id,
    tipo, quantidade, saldo_anterior, saldo_posterior, motivo
  ) VALUES (?, ?, 'Insumo', ?, ?, 'Saida', ?, ?, ?, 'Consumo da produção para estoque')`
  ).run(contexto.tenantId, contexto.usuarioId, item.insumoId, ordemId, item.quantidadeReal,
    insumo.estoque_atual, insumo.estoque_atual - item.quantidadeReal)
  return { custo: moeda(item.quantidadeReal * insumo.custo_unitario), custoUnitario: insumo.custo_unitario }
}

function validarConclusao(data) {
  if (!data || !Number.isSafeInteger(data.ordemId) || data.ordemId <= 0 ||
      !OPERACAO_RE.test(data.operacaoId || '') ||
      !Number.isSafeInteger(data.quantidadeFabricada) || data.quantidadeFabricada <= 0 ||
      !Number.isSafeInteger(data.quantidadeAprovada) || data.quantidadeAprovada <= 0 ||
      !Number.isSafeInteger(data.quantidadeReprovada) || data.quantidadeReprovada < 0 ||
      data.quantidadeFabricada !== data.quantidadeAprovada + data.quantidadeReprovada ||
      !Number.isFinite(data.tempoRealHoras) || data.tempoRealHoras < 0 ||
      !Number.isFinite(data.horasTrabalhoReal) || data.horasTrabalhoReal < 0 ||
      !Number.isSafeInteger(data.falhas) || data.falhas < 0 ||
      !Number.isFinite(data.custosAdicionais) || data.custosAdicionais < 0 ||
      typeof data.desperdiciosObservacoes !== 'string' || data.desperdiciosObservacoes.length > 2000) {
    throw new Error('INVALID_INPUT')
  }
  validarLista(data.filamentos, 'filamentoId', 'gramasReais')
  validarLista(data.insumos, 'insumoId', 'quantidadeReal')
}

/** Conclusão atômica: baixa materiais uma vez, fixa custos e cria a entrada acabada. */
export function concluirOrdemProducaoEstoqueNoBanco(db, contexto, data) {
  exigirOperador(contexto)
  validarConclusao(data)
  return db.transaction(() => {
    const ordem = db.prepare(`SELECT o.*, i.potencia_w, i.custo_hora,
        t.tarifa_energia_kwh, t.potencia_impressora_w, t.custo_hora_maquina, t.valor_hora_trabalho
      FROM ordens_producao_estoque o
      JOIN tenants t ON t.id = o.tenant_id
      LEFT JOIN impressoras i ON i.id = o.impressora_id AND i.tenant_id = o.tenant_id
      WHERE o.id = ? AND o.tenant_id = ?`).get(data.ordemId, contexto.tenantId)
    if (!ordem) throw new Error('NOT_FOUND')
    if (ordem.status === 'Concluída') {
      if (ordem.operacao_conclusao_id === data.operacaoId) return { resultado: 'UNCHANGED', loteId: db.prepare('SELECT id FROM lotes_produtos_acabados WHERE ordem_id = ?').get(data.ordemId).id }
      throw new Error('ALREADY_COMPLETED')
    }
    if (ordem.status !== 'Conferência') throw new Error('INVALID_TRANSITION')
    const previstosFilamentos = new Set(db.prepare('SELECT filamento_id FROM ordem_producao_estoque_filamentos WHERE ordem_id = ?').all(data.ordemId).map(item => item.filamento_id))
    const previstosInsumos = new Set(db.prepare('SELECT insumo_id FROM ordem_producao_estoque_insumos WHERE ordem_id = ?').all(data.ordemId).map(item => item.insumo_id))
    if (data.filamentos.some(item => !previstosFilamentos.has(item.filamentoId)) ||
        data.insumos.some(item => !previstosInsumos.has(item.insumoId))) throw new Error('MATERIAL_NOT_FOUND')

    let custoMateriais = 0
    for (const item of data.filamentos) {
      const custo = baixarFilamentoFIFO(db, contexto, data.ordemId, item)
      custoMateriais += custo
      db.prepare(`UPDATE ordem_producao_estoque_filamentos SET gramas_reais = ?, custo_real = ?
        WHERE ordem_id = ? AND filamento_id = ? AND tenant_id = ?`
      ).run(item.gramasReais, custo, data.ordemId, item.filamentoId, contexto.tenantId)
    }
    for (const item of data.insumos) {
      const custo = baixarInsumo(db, contexto, data.ordemId, item)
      custoMateriais += custo.custo
      db.prepare(`UPDATE ordem_producao_estoque_insumos
        SET quantidade_real = ?, custo_unitario_real = ?, custo_real = ?
        WHERE ordem_id = ? AND insumo_id = ? AND tenant_id = ?`
      ).run(item.quantidadeReal, custo.custoUnitario, custo.custo, data.ordemId, item.insumoId, contexto.tenantId)
    }
    const potencia = ordem.potencia_w ?? ordem.potencia_impressora_w
    const custoHora = ordem.custo_hora > 0 ? ordem.custo_hora : ordem.custo_hora_maquina
    const custoEnergia = moeda(data.tempoRealHoras * potencia / 1000 * ordem.tarifa_energia_kwh)
    const custoMaquina = moeda(data.tempoRealHoras * custoHora)
    const custoTrabalho = moeda(data.horasTrabalhoReal * ordem.valor_hora_trabalho)
    custoMateriais = moeda(custoMateriais)
    const custoTotal = moeda(custoMateriais + custoEnergia + custoMaquina + custoTrabalho + data.custosAdicionais)
    const custoUnitario = moeda(custoTotal / data.quantidadeAprovada)
    const loteResultado = db.prepare(`INSERT INTO lotes_produtos_acabados (
      tenant_id, ordem_id, produto_id, produto_versao_id, codigo,
      quantidade_produzida, quantidade_aprovada, quantidade_reprovada,
      custo_total, custo_unitario, fabricado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
    ).run(contexto.tenantId, data.ordemId, ordem.produto_id, ordem.produto_versao_id,
      ordem.identificacao_lote, data.quantidadeFabricada, data.quantidadeAprovada,
      data.quantidadeReprovada, custoTotal, custoUnitario)
    const loteId = Number(loteResultado.lastInsertRowid)
    db.prepare(`INSERT INTO movimentos_produtos_acabados (
      tenant_id, usuario_id, lote_id, tipo, quantidade, custo_unitario, custo_total,
      operacao_id, motivo
    ) VALUES (?, ?, ?, 'Entrada', ?, ?, ?, ?, 'Conclusão da produção para estoque')`
    ).run(contexto.tenantId, contexto.usuarioId, loteId, data.quantidadeAprovada,
      custoUnitario, custoTotal, `producao:${data.operacaoId}`)
    const atualizado = db.prepare(`UPDATE ordens_producao_estoque SET status = 'Concluída',
      quantidade_fabricada = ?, quantidade_aprovada = ?, quantidade_reprovada = ?,
      tempo_real_horas = ?, horas_trabalho_real = ?, desperdicios_observacoes = ?, falhas = ?,
      custos_adicionais = ?, custo_materiais_real = ?, custo_energia_real = ?,
      custo_maquina_real = ?, custo_trabalho_real = ?, custo_total_real = ?, custo_unitario_real = ?,
      operacao_conclusao_id = ?, concluida_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND tenant_id = ? AND status = 'Conferência'`
    ).run(data.quantidadeFabricada, data.quantidadeAprovada, data.quantidadeReprovada,
      data.tempoRealHoras, data.horasTrabalhoReal, data.desperdiciosObservacoes.trim() || null,
      data.falhas, data.custosAdicionais, custoMateriais, custoEnergia, custoMaquina,
      custoTrabalho, custoTotal, custoUnitario, data.operacaoId, data.ordemId, contexto.tenantId)
    if (atualizado.changes !== 1) throw new Error('STATUS_CHANGED')
    auditar(db, contexto, 'OrdemProducaoEstoque', data.ordemId, 'CONCLUIR',
      `${data.quantidadeAprovada} aprovada(s) · lote ${ordem.identificacao_lote}`,
      { fabricadas: data.quantidadeFabricada, reprovadas: data.quantidadeReprovada, custoTotal, custoUnitario, loteId })
    return { resultado: 'CREATED', loteId, custoTotal, custoUnitario }
  }).immediate()
}

const SALDO_LOTE_SQL = `
  SELECT l.id, l.custo_unitario,
    COALESCE(SUM(CASE m.tipo
      WHEN 'Entrada' THEN m.quantidade WHEN 'Devolução' THEN m.quantidade WHEN 'Ajuste entrada' THEN m.quantidade
      WHEN 'Saída' THEN -m.quantidade WHEN 'Perda' THEN -m.quantidade WHEN 'Ajuste saída' THEN -m.quantidade ELSE 0 END), 0) AS saldo_fisico,
    COALESCE((SELECT SUM(r.quantidade_reservada - r.quantidade_saida)
      FROM reservas_produtos_acabados r
      WHERE r.lote_id = l.id AND r.tenant_id = l.tenant_id AND r.liberada_em IS NULL), 0) AS reservado
  FROM lotes_produtos_acabados l
  LEFT JOIN movimentos_produtos_acabados m ON m.lote_id = l.id AND m.tenant_id = l.tenant_id
  WHERE l.tenant_id = ? AND l.produto_id = ? AND l.produto_versao_id = ?
  GROUP BY l.id
  ORDER BY l.fabricado_em, l.id`

function reservarPedidoDentro(db, contexto, pedidoId) {
  const pedido = db.prepare(`SELECT id, atendimento_tipo, produto_id, produto_versao_id, quantidade, status
    FROM pedidos WHERE id = ? AND tenant_id = ?`).get(pedidoId, contexto.tenantId)
  if (!pedido) throw new Error('NOT_FOUND')
  if (pedido.atendimento_tipo !== 'Estoque' || !pedido.produto_id || !pedido.produto_versao_id) throw new Error('NOT_STOCK_ORDER')
  if (pedido.status === 'Cancelado') throw new Error('INVALID_STATUS')
  const existentes = db.prepare(`SELECT COALESCE(SUM(quantidade_reservada), 0) AS total,
      COALESCE(SUM(quantidade_reservada * l.custo_unitario), 0) AS custo
    FROM reservas_produtos_acabados r JOIN lotes_produtos_acabados l ON l.id = r.lote_id
    WHERE r.pedido_id = ? AND r.tenant_id = ? AND r.liberada_em IS NULL`).get(pedidoId, contexto.tenantId)
  if (existentes.total > 0) {
    if (existentes.total !== pedido.quantidade) throw new Error('RESERVATION_CONFLICT')
    return { resultado: 'UNCHANGED', custoEstimado: moeda(existentes.custo) }
  }
  let restante = pedido.quantidade
  let custo = 0
  const lotes = db.prepare(SALDO_LOTE_SQL).all(contexto.tenantId, pedido.produto_id, pedido.produto_versao_id)
  for (const lote of lotes) {
    const disponivel = Math.floor(lote.saldo_fisico - lote.reservado)
    if (disponivel <= 0) continue
    const quantidade = Math.min(restante, disponivel)
    db.prepare(`INSERT INTO reservas_produtos_acabados
      (tenant_id, pedido_id, lote_id, quantidade_reservada) VALUES (?, ?, ?, ?)`
    ).run(contexto.tenantId, pedidoId, lote.id, quantidade)
    custo += quantidade * lote.custo_unitario
    restante -= quantidade
    if (restante === 0) break
  }
  if (restante > 0) throw new Error(`INSUFFICIENT_FINISHED_STOCK:${pedido.quantidade - restante}`)
  custo = moeda(custo)
  db.prepare('UPDATE pedidos SET custo_produto_acabado_estimado = ? WHERE id = ? AND tenant_id = ?')
    .run(custo, pedidoId, contexto.tenantId)
  auditar(db, contexto, 'Pedido', pedidoId, 'RESERVAR_ESTOQUE_ACABADO', `${pedido.quantidade} unidade(s) reservada(s)`, { custoEstimado: custo })
  return { resultado: 'CREATED', custoEstimado: custo }
}

export function reservarProdutosAcabadosParaPedidoNoBanco(db, contexto, pedidoId) {
  exigirOperador(contexto)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) throw new Error('INVALID_INPUT')
  return db.transaction(() => reservarPedidoDentro(db, contexto, pedidoId)).immediate()
}

function operacaoJaAplicada(db, tenantId, operacaoId, tipo) {
  return Boolean(db.prepare(`SELECT 1 FROM movimentos_produtos_acabados
    WHERE tenant_id = ? AND tipo = ? AND substr(operacao_id, 1, ?) = ? LIMIT 1`)
    .get(tenantId, tipo, operacaoId.length + 1, `${operacaoId}:`))
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{tenantId: number, usuarioId: number, perfil: string}} contexto
 * @param {{pedidoId: number, quantidade: number, operacaoId: string, entregaId?: number | null}} dados
 */
export function confirmarSaidaProdutosAcabadosNoBanco(db, contexto, dados) {
  const { pedidoId, quantidade, operacaoId, entregaId = null } = dados
  exigirOperador(contexto)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !Number.isSafeInteger(quantidade) || quantidade <= 0 ||
      !OPERACAO_RE.test(operacaoId || '') || (entregaId !== null && (!Number.isSafeInteger(entregaId) || entregaId <= 0))) throw new Error('INVALID_INPUT')
  return db.transaction(() => {
    const pedido = db.prepare(`SELECT atendimento_tipo, status FROM pedidos WHERE id = ? AND tenant_id = ?`)
      .get(pedidoId, contexto.tenantId)
    if (!pedido) throw new Error('NOT_FOUND')
    if (pedido.atendimento_tipo !== 'Estoque') throw new Error('NOT_STOCK_ORDER')
    if (pedido.status === 'Cancelado') throw new Error('INVALID_STATUS')
    if (operacaoJaAplicada(db, contexto.tenantId, operacaoId, 'Saída')) return { resultado: 'UNCHANGED', custo: 0 }
    let restante = quantidade
    let custo = 0
    const reservas = db.prepare(`SELECT r.id, r.lote_id, r.quantidade_reservada, r.quantidade_saida, l.custo_unitario
      FROM reservas_produtos_acabados r JOIN lotes_produtos_acabados l ON l.id = r.lote_id
      WHERE r.pedido_id = ? AND r.tenant_id = ? AND r.liberada_em IS NULL
      ORDER BY l.fabricado_em, l.id`).all(pedidoId, contexto.tenantId)
    for (const reserva of reservas) {
      if (restante === 0) break
      const pendente = reserva.quantidade_reservada - reserva.quantidade_saida
      const usar = Math.min(restante, pendente)
      if (usar <= 0) continue
      db.prepare(`UPDATE reservas_produtos_acabados SET quantidade_saida = quantidade_saida + ?
        WHERE id = ? AND tenant_id = ? AND quantidade_saida + ? <= quantidade_reservada`
      ).run(usar, reserva.id, contexto.tenantId, usar)
      const custoItem = moeda(usar * reserva.custo_unitario)
      db.prepare(`INSERT INTO movimentos_produtos_acabados (
        tenant_id, usuario_id, lote_id, pedido_id, entrega_id, tipo, quantidade,
        custo_unitario, custo_total, operacao_id, motivo
      ) VALUES (?, ?, ?, ?, ?, 'Saída', ?, ?, ?, ?, 'Venda atendida com estoque acabado')`
      ).run(contexto.tenantId, contexto.usuarioId, reserva.lote_id, pedidoId, entregaId,
        usar, reserva.custo_unitario, custoItem, `${operacaoId}:${reserva.id}`)
      custo += custoItem
      restante -= usar
    }
    if (restante > 0) throw new Error('INSUFFICIENT_RESERVATION')
    custo = moeda(custo)
    db.prepare(`UPDATE pedidos SET custo_produto_acabado_real = custo_produto_acabado_real + ?
      WHERE id = ? AND tenant_id = ?`).run(custo, pedidoId, contexto.tenantId)
    auditar(db, contexto, 'Pedido', pedidoId, 'SAIDA_ESTOQUE_ACABADO', `${quantidade} unidade(s) · custo ${custo.toFixed(2)}`,
      { quantidade, custo, entregaId, operacaoId })
    return { resultado: 'CREATED', custo }
  }).immediate()
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{tenantId: number, usuarioId: number, perfil: string}} contexto
 * @param {{pedidoId: number, entregaId?: number | null, operacaoId: string, todas?: boolean}} dados
 */
export function devolverSaidaProdutosAcabadosNoBanco(db, contexto, dados) {
  const { pedidoId, entregaId = null, operacaoId, todas = false } = dados
  exigirOperador(contexto)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !OPERACAO_RE.test(operacaoId || '')) throw new Error('INVALID_INPUT')
  return db.transaction(() => {
    if (operacaoJaAplicada(db, contexto.tenantId, operacaoId, 'Devolução')) return { resultado: 'UNCHANGED', custo: 0 }
    const filtroEntrega = todas ? '1 = 1' : entregaId === null ? 'm.entrega_id IS NULL' : 'm.entrega_id = ?'
    const parametros = todas || entregaId === null ? [pedidoId, contexto.tenantId] : [pedidoId, contexto.tenantId, entregaId]
    const saidas = db.prepare(`SELECT m.lote_id, SUM(m.quantidade) AS quantidade,
        MAX(m.custo_unitario) AS custo_unitario
      FROM movimentos_produtos_acabados m
      WHERE m.pedido_id = ? AND m.tenant_id = ? AND m.tipo = 'Saída' AND ${filtroEntrega}
      GROUP BY m.lote_id`).all(...parametros)
    if (saidas.length === 0) return { resultado: 'UNCHANGED', custo: 0 }
    let custo = 0
    for (const saida of saidas) {
      const devolvido = db.prepare(`SELECT COALESCE(SUM(quantidade), 0) AS total
        FROM movimentos_produtos_acabados WHERE pedido_id = ? AND tenant_id = ?
          AND lote_id = ? AND tipo = 'Devolução' AND ${todas ? '1 = 1' : entregaId === null ? 'entrega_id IS NULL' : 'entrega_id = ?'}`
      ).get(...(todas || entregaId === null
        ? [pedidoId, contexto.tenantId, saida.lote_id]
        : [pedidoId, contexto.tenantId, saida.lote_id, entregaId])).total
      const quantidade = saida.quantidade - devolvido
      if (quantidade <= 0) continue
      const custoItem = moeda(quantidade * saida.custo_unitario)
      db.prepare(`INSERT INTO movimentos_produtos_acabados (
        tenant_id, usuario_id, lote_id, pedido_id, entrega_id, tipo, quantidade,
        custo_unitario, custo_total, operacao_id, motivo
      ) VALUES (?, ?, ?, ?, ?, 'Devolução', ?, ?, ?, ?, 'Devolução/estorno de produto acabado')`
      ).run(contexto.tenantId, contexto.usuarioId, saida.lote_id, pedidoId, entregaId,
        quantidade, saida.custo_unitario, custoItem, `${operacaoId}:${saida.lote_id}`)
      custo += custoItem
    }
    custo = moeda(custo)
    db.prepare(`UPDATE pedidos SET custo_produto_acabado_real = MAX(0, custo_produto_acabado_real - ?)
      WHERE id = ? AND tenant_id = ?`).run(custo, pedidoId, contexto.tenantId)
    auditar(db, contexto, 'Pedido', pedidoId, 'DEVOLVER_ESTOQUE_ACABADO', `Custo devolvido ${custo.toFixed(2)}`, { entregaId, operacaoId })
    return { resultado: custo > 0 ? 'CREATED' : 'UNCHANGED', custo }
  }).immediate()
}

export function liberarOuDevolverPedidoEstoqueNoBanco(db, contexto, pedidoId, operacaoId) {
  exigirOperador(contexto)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !OPERACAO_RE.test(operacaoId || '')) throw new Error('INVALID_INPUT')
  return db.transaction(() => {
    devolverSaidaProdutosAcabadosNoBanco(db, contexto, { pedidoId, operacaoId, todas: true })
    db.prepare(`UPDATE reservas_produtos_acabados SET liberada_em = COALESCE(liberada_em, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      WHERE pedido_id = ? AND tenant_id = ?`).run(pedidoId, contexto.tenantId)
    auditar(db, contexto, 'Pedido', pedidoId, 'LIBERAR_RESERVA_ESTOQUE_ACABADO', 'Reserva liberada pelo cancelamento')
    return 'UPDATED'
  }).immediate()
}

export function consultarSaldoProdutoAcabadoNoBanco(db, tenantId, produtoId, produtoVersaoId) {
  if (![tenantId, produtoId, produtoVersaoId].every(valor => Number.isSafeInteger(valor) && valor > 0)) throw new Error('INVALID_INPUT')
  const lotes = db.prepare(SALDO_LOTE_SQL).all(tenantId, produtoId, produtoVersaoId)
  return lotes.reduce((resumo, lote) => ({
    fisico: resumo.fisico + Number(lote.saldo_fisico),
    reservado: resumo.reservado + Number(lote.reservado),
    disponivel: resumo.disponivel + Number(lote.saldo_fisico) - Number(lote.reservado),
  }), { fisico: 0, reservado: 0, disponivel: 0 })
}

export function ajustarEstoqueProdutoAcabadoNoBanco(db, contexto, dados) {
  exigirOperador(contexto)
  const tipos = ['Perda', 'Ajuste entrada', 'Ajuste saída']
  if (!dados || !Number.isSafeInteger(dados.loteId) || dados.loteId <= 0 ||
      !tipos.includes(dados.tipo) || !Number.isSafeInteger(dados.quantidade) || dados.quantidade <= 0 ||
      !OPERACAO_RE.test(dados.operacaoId || '') || typeof dados.motivo !== 'string' ||
      !dados.motivo.trim() || dados.motivo.trim().length > 500) throw new Error('INVALID_INPUT')
  return db.transaction(() => {
    const repetido = db.prepare('SELECT id FROM movimentos_produtos_acabados WHERE tenant_id = ? AND operacao_id = ?')
      .get(contexto.tenantId, dados.operacaoId)
    if (repetido) return 'UNCHANGED'
    const lote = db.prepare(`SELECT l.id, l.produto_id, l.produto_versao_id, l.custo_unitario,
        COALESCE(SUM(CASE m.tipo WHEN 'Entrada' THEN m.quantidade WHEN 'Devolução' THEN m.quantidade WHEN 'Ajuste entrada' THEN m.quantidade
          WHEN 'Saída' THEN -m.quantidade WHEN 'Perda' THEN -m.quantidade WHEN 'Ajuste saída' THEN -m.quantidade ELSE 0 END), 0) AS saldo,
        COALESCE((SELECT SUM(r.quantidade_reservada - r.quantidade_saida) FROM reservas_produtos_acabados r
          WHERE r.lote_id = l.id AND r.tenant_id = l.tenant_id AND r.liberada_em IS NULL), 0) AS reservado
      FROM lotes_produtos_acabados l LEFT JOIN movimentos_produtos_acabados m ON m.lote_id = l.id
      WHERE l.id = ? AND l.tenant_id = ? GROUP BY l.id`).get(dados.loteId, contexto.tenantId)
    if (!lote) throw new Error('NOT_FOUND')
    if (dados.tipo !== 'Ajuste entrada' && lote.saldo - lote.reservado < dados.quantidade) {
      throw new Error('INSUFFICIENT_FINISHED_STOCK')
    }
    const custo = moeda(dados.quantidade * lote.custo_unitario)
    db.prepare(`INSERT INTO movimentos_produtos_acabados (
      tenant_id, usuario_id, lote_id, tipo, quantidade, custo_unitario, custo_total,
      operacao_id, motivo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(contexto.tenantId, contexto.usuarioId, dados.loteId, dados.tipo, dados.quantidade,
      lote.custo_unitario, custo, dados.operacaoId, dados.motivo.trim())
    auditar(db, contexto, 'LoteProdutoAcabado', dados.loteId, dados.tipo.toUpperCase().replaceAll(' ', '_'),
      `${dados.quantidade} unidade(s) · ${dados.motivo.trim()}`)
    return 'CREATED'
  }).immediate()
}

