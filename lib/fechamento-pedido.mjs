import { confirmarSaidaProdutosAcabadosNoBanco } from './producao-estoque.mjs'

/**
 * @typedef {{
 *   pedidoId: number, impressoraId: number | null, inicioPrevisto: string, fimPrevisto: string,
 *   tempoRealHoras: number | null, custoExtraReal: number, falhasImpressao: number,
 *   materiais: Array<{id: number, consumoReal: number | null, filamentoIdReal?: number}>,
 *   insumos: Array<{id: number, consumoReal: number | null}>
 * }} RevisaoOperacao
 */

function baixarEstoquePedido(db, pedidoId, tenantId, usuarioId) {
    const filamentosDoPedido = db
        .prepare(`SELECT
               pf.filamento_id,
               SUM(COALESCE(pf.consumo_real_gramas, pf.peso_gasto_gramas)) AS quantidade,
               f.material || ' ' || f.cor AS nome,
               COALESCE(f.estoque_gramas, f.peso_rolo_gramas) AS estoque
             FROM pedido_filamentos pf
             JOIN filamentos f ON f.id = pf.filamento_id AND f.tenant_id = ?
             WHERE pf.pedido_id = ?
             GROUP BY pf.filamento_id, f.material, f.cor, f.estoque_gramas, f.peso_rolo_gramas`)
        .all(tenantId, pedidoId);
    const insumosDoPedido = db
        .prepare(`SELECT
               pi.insumo_id,
               SUM(COALESCE(pi.consumo_real, pi.quantidade)) AS quantidade,
               i.nome,
               i.estoque_atual AS estoque
             FROM pedido_insumos pi
             JOIN insumos i ON i.id = pi.insumo_id AND i.tenant_id = ?
             WHERE pi.pedido_id = ?
             GROUP BY pi.insumo_id, i.nome, i.estoque_atual`)
        .all(tenantId, pedidoId);
    for (const item of [...filamentosDoPedido, ...insumosDoPedido]) {
        if (item.estoque < item.quantidade) {
            throw new Error(`INSUFFICIENT_STOCK:${item.nome}`);
        }
    }
    const baixarFilamento = db.prepare(`UPDATE filamentos
           SET estoque_gramas = COALESCE(estoque_gramas, peso_rolo_gramas) - ?
           WHERE id = ? AND tenant_id = ?
             AND COALESCE(estoque_gramas, peso_rolo_gramas) >= ?`);
    for (const item of filamentosDoPedido) {
        if (item.quantidade <= 0)
            continue;
        const saldoAnterior = item.estoque;
        const lotes = db.prepare(`
            SELECT id, saldo_gramas FROM lotes_filamento
            WHERE tenant_id = ? AND filamento_id = ? AND ativo = 1 AND saldo_gramas > 0
            ORDER BY COALESCE(aberto_em, substr(criado_em, 1, 10)), id
          `).all(tenantId, item.filamento_id);
        const saldoLotes = lotes.reduce((total, lote) => total + lote.saldo_gramas, 0);
        if (saldoLotes + 0.001 < item.quantidade) {
            throw new Error(`INSUFFICIENT_STOCK:${item.nome} (lotes)`);
        }
        const baixa = baixarFilamento.run(item.quantidade, item.filamento_id, tenantId, item.quantidade);
        if (baixa.changes !== 1)
            throw new Error('STOCK_CHANGED');
        let restante = item.quantidade;
        let saldoCorrente = saldoAnterior;
        const baixarLote = db.prepare(`
            UPDATE lotes_filamento SET saldo_gramas = saldo_gramas - ?
            WHERE id = ? AND tenant_id = ? AND saldo_gramas >= ?
          `);
        const movimentoLote = db.prepare(`
            INSERT INTO movimentos_estoque (
              tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id,
              pedido_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo
            ) VALUES (?, ?, 'Filamento', ?, ?, ?, 'Saida', ?, ?, ?, 'Consumo do pedido finalizado')
          `);
        for (const lote of lotes) {
            if (restante <= 0)
                break;
            const quantidade = Math.min(restante, lote.saldo_gramas);
            if (baixarLote.run(quantidade, lote.id, tenantId, quantidade).changes !== 1) {
                throw new Error('STOCK_CHANGED');
            }
            movimentoLote.run(tenantId, usuarioId, item.filamento_id, lote.id, pedidoId, quantidade, saldoCorrente, saldoCorrente - quantidade);
            saldoCorrente -= quantidade;
            restante = Math.round((restante - quantidade) * 1000) / 1000;
        }
    }
    const baixarInsumo = db.prepare(`UPDATE insumos
           SET estoque_atual = estoque_atual - ?
           WHERE id = ? AND tenant_id = ? AND estoque_atual >= ?`);
    for (const item of insumosDoPedido) {
        if (item.quantidade <= 0)
            continue;
        const saldoAnterior = item.estoque;
        const baixa = baixarInsumo.run(item.quantidade, item.insumo_id, tenantId, item.quantidade);
        if (baixa.changes !== 1)
            throw new Error('STOCK_CHANGED');
        db.prepare(`
            INSERT INTO movimentos_estoque (
              tenant_id, usuario_id, tipo_item, item_id, pedido_id, tipo, quantidade,
              saldo_anterior, saldo_posterior, motivo
            ) VALUES (?, ?, 'Insumo', ?, ?, 'Saida', ?, ?, ?, 'Consumo do pedido finalizado')
          `).run(tenantId, usuarioId, item.insumo_id, pedidoId, item.quantidade, saldoAnterior, saldoAnterior - item.quantidade);
    }
}
function exigirOperador(contexto) {
  if (!contexto || !['admin', 'operador'].includes(contexto.perfil)) throw new Error('FORBIDDEN')
  if (!Number.isSafeInteger(contexto.tenantId) || !Number.isSafeInteger(contexto.usuarioId)) throw new Error('UNAUTHORIZED')
}

function registrarEvento(db, contexto, pedidoId, evento, descricao, dados = null) {
  db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
    VALUES (?, ?, ?, ?, ?)`).run(contexto.tenantId, pedidoId, contexto.usuarioId, evento, descricao)
  db.prepare(`INSERT INTO auditoria (tenant_id, usuario_id, entidade, entidade_id, acao, descricao, dados_json)
    VALUES (?, ?, 'Pedido', ?, ?, ?, ?)`).run(contexto.tenantId, contexto.usuarioId, pedidoId,
      evento === 'Status de produção' ? 'STATUS_PRODUCAO' : 'REVISAO_OPERACAO', descricao,
      dados === null ? null : JSON.stringify(dados))
}

/** Executada dentro da transação de salvar ou finalizar, sem confirmar alterações parciais. */
function salvarRevisao(db, contexto, data) {
  if (!data || !Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0) throw new Error('INVALID_INPUT')
  if (data.impressoraId !== null && (!Number.isSafeInteger(data.impressoraId) || data.impressoraId <= 0)) throw new Error('INVALID_PRINTER')
  if (data.tempoRealHoras !== null && (!Number.isFinite(data.tempoRealHoras) || data.tempoRealHoras < 0)) throw new Error('INVALID_INPUT')
  if (!Number.isFinite(data.custoExtraReal) || data.custoExtraReal < 0 || !Number.isSafeInteger(data.falhasImpressao) || data.falhasImpressao < 0) throw new Error('INVALID_INPUT')
  if (!Array.isArray(data.materiais) || data.materiais.length > 100 || !Array.isArray(data.insumos) || data.insumos.length > 100) throw new Error('INVALID_CONSUMPTION')
  if (data.impressoraId !== null && !db.prepare('SELECT 1 FROM impressoras WHERE id = ? AND tenant_id = ? AND ativo = 1').get(data.impressoraId, contexto.tenantId)) throw new Error('INVALID_PRINTER')

  const atualizado = db.prepare(`UPDATE pedidos SET impressora_id = ?, inicio_previsto = ?, fim_previsto = ?,
      tempo_real_horas = ?, custo_extra_real = ?, falhas_impressao = ?
    WHERE id = ? AND tenant_id = ? AND status NOT IN ('Finalizado', 'Cancelado')`).run(
      data.impressoraId, data.inicioPrevisto || null, data.fimPrevisto || null, data.tempoRealHoras,
      data.custoExtraReal, data.falhasImpressao, data.pedidoId, contexto.tenantId)
  if (atualizado.changes !== 1) throw new Error('NOT_FOUND')

  const ids = new Set()
  for (const item of data.materiais) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id) ||
      (item.consumoReal !== null && (!Number.isFinite(item.consumoReal) || item.consumoReal < 0))) throw new Error('INVALID_CONSUMPTION')
    ids.add(item.id)
    const original = db.prepare(`SELECT pf.filamento_id, pf.peso_gasto_gramas, pf.custo_calculado,
        f.material || ' ' || f.cor AS nome
      FROM pedido_filamentos pf JOIN filamentos f ON f.id = pf.filamento_id AND f.tenant_id = ?
      WHERE pf.id = ? AND pf.pedido_id = ?`).get(contexto.tenantId, item.id, data.pedidoId)
    if (!original) throw new Error('INVALID_CONSUMPTION')
    const filamentoId = item.filamentoIdReal ?? original.filamento_id
    if (!Number.isSafeInteger(filamentoId) || filamentoId <= 0) throw new Error('INVALID_FILAMENT')
    if (filamentoId !== original.filamento_id) {
      const substituto = db.prepare(`SELECT material || ' ' || cor AS nome FROM filamentos
        WHERE id = ? AND tenant_id = ? AND ativo = 1`).get(filamentoId, contexto.tenantId)
      if (!substituto) throw new Error('INVALID_FILAMENT')
      registrarEvento(db, contexto, data.pedidoId, 'Filamento substituído',
        `${original.nome} (#${original.filamento_id}) → ${substituto.nome} (#${filamentoId}). Preço e custo orçado preservados.`,
        { linhaId: item.id, filamentoOriginal: original, filamentoRealId: filamentoId })
    }
    db.prepare('UPDATE pedido_filamentos SET consumo_real_gramas = ?, filamento_id = ? WHERE id = ? AND pedido_id = ?')
      .run(item.consumoReal, filamentoId, item.id, data.pedidoId)
  }
  ids.clear()
  for (const item of data.insumos) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id) ||
      (item.consumoReal !== null && (!Number.isFinite(item.consumoReal) || item.consumoReal < 0))) throw new Error('INVALID_CONSUMPTION')
    ids.add(item.id)
    const atualizado = db.prepare('UPDATE pedido_insumos SET consumo_real = ? WHERE id = ? AND pedido_id = ?')
      .run(item.consumoReal, item.id, data.pedidoId)
    if (atualizado.changes !== 1) throw new Error('INVALID_CONSUMPTION')
  }
  registrarEvento(db, contexto, data.pedidoId, 'Operação atualizada', 'Planejamento e consumo real revisados')
}

export function salvarOperacaoNoBanco(db, contexto, data) {
  exigirOperador(contexto)
  db.transaction(() => salvarRevisao(db, contexto, data)).immediate()
}

/**
 * Revisão, substituições, baixa FIFO, histórico e status são confirmados juntos.
 * @param {import('better-sqlite3').Database} db
 * @param {{tenantId: number, usuarioId: number, perfil: string}} contexto
 * @param {number} pedidoId
 * @param {RevisaoOperacao | null} revisao
 */
export function finalizarPedidoNoBanco(db, contexto, pedidoId, revisao = null) {
  exigirOperador(contexto)
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || (revisao && revisao.pedidoId !== pedidoId)) throw new Error('INVALID_INPUT')
  return db.transaction(() => {
    const pedido = db.prepare(`SELECT status, orcamento_status, quantidade, quantidade_produzida, atendimento_tipo
      FROM pedidos WHERE id = ? AND tenant_id = ?`).get(pedidoId, contexto.tenantId)
    if (!pedido) throw new Error('NOT_FOUND')
    if (pedido.orcamento_status !== 'Aprovado') throw new Error('NOT_APPROVED')
    if (pedido.status === 'Finalizado') return 'UNCHANGED'
    if (pedido.status !== 'Acabamento') throw new Error('INVALID_TRANSITION')
    if (pedido.quantidade_produzida > 0 && pedido.quantidade_produzida < pedido.quantidade) {
      throw new Error(`INCOMPLETE_PRODUCTION:${pedido.quantidade_produzida}:${pedido.quantidade}`)
    }
    if (revisao) salvarRevisao(db, contexto, revisao)
    if (pedido.atendimento_tipo === 'Estoque') {
      const pendente = db.prepare(`SELECT COALESCE(SUM(quantidade_reservada - quantidade_saida), 0) AS total
        FROM reservas_produtos_acabados WHERE pedido_id = ? AND tenant_id = ? AND liberada_em IS NULL`
      ).get(pedidoId, contexto.tenantId).total
      if (pendente > 0) confirmarSaidaProdutosAcabadosNoBanco(db, contexto, {
        pedidoId, quantidade: pendente, operacaoId: `finalizacao-pedido-${pedidoId}`,
      })
    } else {
      baixarEstoquePedido(db, pedidoId, contexto.tenantId, contexto.usuarioId)
    }
    const atualizado = db.prepare(`UPDATE pedidos SET status = 'Finalizado', quantidade_produzida = quantidade,
      data_conclusao = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND tenant_id = ? AND status = 'Acabamento'`).run(pedidoId, contexto.tenantId)
    if (atualizado.changes !== 1) throw new Error('STATUS_CHANGED')
    registrarEvento(db, contexto, pedidoId, 'Status de produção', 'Acabamento → Finalizado')
    return 'UPDATED'
  }).immediate()
}

export function mensagemErroFechamento(error) {
  const codigo = error instanceof Error ? error.message : ''
  const mensagens = {
    UNAUTHORIZED: 'Sua sessão expirou. Entre novamente para concluir o pedido.',
    FORBIDDEN: 'Seu perfil não permite alterar ou finalizar pedidos.',
    NOT_FOUND: 'Pedido não encontrado ou já encerrado.',
    NOT_APPROVED: 'Aprove o orçamento antes de finalizar a produção.',
    INVALID_TRANSITION: 'O pedido precisa estar em Acabamento para ser finalizado.',
    INVALID_INPUT: 'Confira os dados da revisão antes de continuar.',
    INVALID_PRINTER: 'Impressora não encontrada ou inválida.',
    INVALID_FILAMENT: 'Selecione um filamento ativo da empresa para substituir o material usado.',
    INVALID_CONSUMPTION: 'Confira os materiais e os consumos informados.',
    STOCK_CHANGED: 'O estoque mudou durante a operação. Atualize a página e confira os saldos.',
    STATUS_CHANGED: 'O pedido mudou durante a operação. Atualize a página e tente novamente.',
  }
  if (mensagens[codigo]) return mensagens[codigo]
  if (codigo.startsWith('INSUFFICIENT_STOCK:')) return `Não foi possível finalizar: estoque insuficiente de ${codigo.slice('INSUFFICIENT_STOCK:'.length)}. Confira o saldo e os lotes ou selecione o filamento realmente utilizado. Nenhuma baixa foi gravada.`
  if (codigo.startsWith('INCOMPLETE_PRODUCTION:')) {
    const [, produzida, total] = codigo.split(':')
    return `Ainda existem ${Number(total) - Number(produzida)} unidade(s) para produzir. Atualize o progresso antes de finalizar.`
  }
  return null
}
