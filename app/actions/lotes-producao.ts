'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { dividirQuantidadeEmPlacas, validarQuantidadeLote } from '@/lib/lotes-producao.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface LoteProducao {
  id: number
  pedido_id: number
  numero_orcamento: string | null
  nome_da_peca: string
  cliente_nome: string
  quantidade_pedido: number
  codigo: string
  impressora_id: number | null
  impressora_nome: string | null
  quantidade_planejada: number
  quantidade_produzida: number
  status: 'Planejado' | 'Imprimindo' | 'Concluído' | 'Cancelado'
  placa_referencia: string | null
  inicio_em: string | null
  fim_em: string | null
  tempo_real_horas: number | null
  observacoes: string | null
}

export interface PedidoParaLote {
  id: number
  numero_orcamento: string | null
  nome_da_peca: string
  cliente_nome: string
  quantidade: number
  quantidade_planejada: number
  quantidade_produzida: number
  unidades_por_placa: number | null
  impressora_preferida_id: number | null
  impressora_preferida_nome: string | null
  placa_referencia_padrao: string | null
}

export async function getLotesProducao(): Promise<{ lotes: LoteProducao[]; pedidos: PedidoParaLote[] }> {
  const lotes = db.prepare(`
    SELECT l.id, l.pedido_id, p.numero_orcamento, p.nome_da_peca, c.nome AS cliente_nome,
      p.quantidade AS quantidade_pedido, l.codigo, l.impressora_id, imp.nome AS impressora_nome,
      l.quantidade_planejada, l.quantidade_produzida, l.status, l.placa_referencia,
      l.inicio_em, l.fim_em, l.tempo_real_horas, l.observacoes
    FROM lotes_producao l
    JOIN pedidos p ON p.id = l.pedido_id AND p.tenant_id = l.tenant_id
    JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN impressoras imp ON imp.id = l.impressora_id
    WHERE l.tenant_id = ?
    ORDER BY CASE l.status WHEN 'Imprimindo' THEN 0 WHEN 'Planejado' THEN 1 WHEN 'Concluído' THEN 2 ELSE 3 END,
      l.criado_em DESC, l.id DESC
  `).all(TENANT_ID) as LoteProducao[]
  const pedidos = db.prepare(`
    SELECT p.id, p.numero_orcamento, p.nome_da_peca, c.nome AS cliente_nome,
      p.quantidade, p.quantidade_produzida,
      pv.unidades_por_placa, pv.impressora_preferida_id,
      imp.nome AS impressora_preferida_nome, pv.placa_referencia AS placa_referencia_padrao,
      COALESCE((SELECT SUM(l.quantidade_planejada) FROM lotes_producao l
        WHERE l.pedido_id = p.id AND l.status != 'Cancelado'), 0) AS quantidade_planejada
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN produto_versoes pv ON pv.id = COALESCE(p.produto_versao_id, (
      SELECT pv_ativa.id FROM produto_versoes pv_ativa
      WHERE pv_ativa.produto_id = p.produto_id AND pv_ativa.ativa = 1
      ORDER BY pv_ativa.versao DESC LIMIT 1
    ))
    LEFT JOIN impressoras imp ON imp.id = pv.impressora_preferida_id AND imp.tenant_id = p.tenant_id AND imp.ativo = 1
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Aprovado'
      AND p.status IN ('Fila', 'Imprimindo', 'Acabamento')
    ORDER BY p.data_entrega IS NULL, p.data_entrega, p.id
  `).all(TENANT_ID) as PedidoParaLote[]
  return { lotes, pedidos }
}

export async function criarLotesAutomaticos(pedidoId: number): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) return { success: false, message: 'Pedido inválido.' }
    let criados = 0
    let capacidade = 0
    const criar = db.transaction(() => {
      const pedido = db.prepare(`SELECT p.id, p.quantidade, p.quantidade_produzida, p.status,
          p.orcamento_status, pv.unidades_por_placa, pv.impressora_preferida_id,
          pv.placa_referencia
        FROM pedidos p
        LEFT JOIN produto_versoes pv ON pv.id = COALESCE(p.produto_versao_id, (
          SELECT pv_ativa.id FROM produto_versoes pv_ativa
          WHERE pv_ativa.produto_id = p.produto_id AND pv_ativa.ativa = 1
          ORDER BY pv_ativa.versao DESC LIMIT 1
        ))
        WHERE p.id = ? AND p.tenant_id = ?`
      ).get(pedidoId, TENANT_ID) as {
        id: number; quantidade: number; quantidade_produzida: number; status: string; orcamento_status: string
        unidades_por_placa: number | null; impressora_preferida_id: number | null; placa_referencia: string | null
      } | undefined
      if (!pedido) throw new Error('NOT_FOUND')
      if (pedido.orcamento_status !== 'Aprovado' || ['Finalizado', 'Cancelado'].includes(pedido.status)) throw new Error('INVALID_STATUS')
      if (!pedido.unidades_por_placa) throw new Error('NO_PROFILE')
      if (!Number.isSafeInteger(pedido.quantidade)) throw new Error('NON_INTEGER')
      capacidade = pedido.unidades_por_placa

      const resumo = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(quantidade_planejada), 0) AS planejada
        FROM lotes_producao WHERE pedido_id = ? AND tenant_id = ? AND status != 'Cancelado'`
      ).get(pedidoId, TENANT_ID) as { total: number; planejada: number }
      if (resumo.total === 0 && pedido.quantidade_produzida > 0) {
        db.prepare(`INSERT INTO lotes_producao (
          tenant_id, usuario_id, pedido_id, codigo, quantidade_planejada,
          quantidade_produzida, status, observacoes, fim_em
        ) VALUES (?, ?, ?, ?, ?, ?, 'Concluído', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`
        ).run(TENANT_ID, USUARIO_ID, pedidoId, `LOTE-${String(pedidoId).padStart(6, '0')}-BASE`,
          pedido.quantidade_produzida, pedido.quantidade_produzida,
          'Produção anterior preservada ao ativar o controle por lotes')
        resumo.planejada = pedido.quantidade_produzida
      }
      const restante = pedido.quantidade - resumo.planejada
      if (restante <= 0.001) throw new Error('NO_REMAINING')
      if (!Number.isSafeInteger(restante)) throw new Error('NON_INTEGER')
      const placas = dividirQuantidadeEmPlacas(restante, capacidade)
      let sequencia = (db.prepare('SELECT COUNT(*) AS total FROM lotes_producao WHERE pedido_id = ?')
        .get(pedidoId) as { total: number }).total + 1
      let impressoraId = pedido.impressora_preferida_id
      if (impressoraId && !db.prepare('SELECT 1 FROM impressoras WHERE id = ? AND tenant_id = ? AND ativo = 1').get(impressoraId, TENANT_ID)) {
        impressoraId = null
      }
      const inserir = db.prepare(`INSERT INTO lotes_producao (
        tenant_id, usuario_id, pedido_id, impressora_id, codigo,
        quantidade_planejada, placa_referencia, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      placas.forEach((quantidade, indice) => {
        const codigo = `LOTE-${String(pedidoId).padStart(6, '0')}-${String(sequencia++).padStart(2, '0')}`
        const referencia = pedido.placa_referencia
          ? `${pedido.placa_referencia} · ${indice + 1}/${placas.length}`
          : `Placa ${indice + 1}/${placas.length}`
        inserir.run(TENANT_ID, USUARIO_ID, pedidoId, impressoraId, codigo, quantidade,
          referencia, `Gerado automaticamente com capacidade de ${capacidade} unidade(s) por placa`)
      })
      criados = placas.length
      registrarAuditoria(db, { entidade: 'Pedido', entidadeId: pedidoId, acao: 'GERAR_PLACAS',
        descricao: `${criados} placa(s) · capacidade ${capacidade}` })
    })
    try { criar.immediate() } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_FOUND') return { success: false, message: 'Pedido não encontrado.' }
      if (code === 'INVALID_STATUS') return { success: false, message: 'O pedido precisa estar aprovado e em produção.' }
      if (code === 'NO_PROFILE') return { success: false, message: 'Defina as unidades por placa na ficha técnica do produto.' }
      if (code === 'NON_INTEGER') return { success: false, message: 'A geração automática exige uma quantidade inteira de peças.' }
      if (code === 'NO_REMAINING') return { success: false, message: 'Toda a quantidade do pedido já está distribuída em lotes.' }
      throw error
    }
    revalidatePath('/producao')
    revalidatePath(`/pedidos/${pedidoId}`)
    return { success: true, message: `${criados} placa(s) criada(s) automaticamente, com até ${capacidade} unidade(s) cada.` }
  } catch (error) {
    console.error('[criarLotesAutomaticos]', error)
    return { success: false, message: 'Não foi possível gerar as placas automaticamente.' }
  }
}

export async function criarLoteProducao(data: {
  pedidoId: number
  quantidade: number
  impressoraId: number | null
  placaReferencia: string
  observacoes: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0 ||
        !Number.isFinite(data.quantidade) || data.quantidade <= 0) {
      return { success: false, message: 'Pedido ou quantidade inválida.' }
    }
    const criar = db.transaction(() => {
      const pedido = db.prepare(`
        SELECT id, quantidade, quantidade_produzida, status, orcamento_status
        FROM pedidos WHERE id = ? AND tenant_id = ?
      `).get(data.pedidoId, TENANT_ID) as {
        id: number; quantidade: number; quantidade_produzida: number; status: string; orcamento_status: string
      } | undefined
      if (!pedido) throw new Error('NOT_FOUND')
      if (pedido.orcamento_status !== 'Aprovado' || ['Finalizado', 'Cancelado'].includes(pedido.status)) throw new Error('INVALID_STATUS')
      const resumo = db.prepare(`
        SELECT COUNT(*) AS total, COALESCE(SUM(quantidade_planejada), 0) AS planejada
        FROM lotes_producao WHERE pedido_id = ? AND tenant_id = ? AND status != 'Cancelado'
      `).get(data.pedidoId, TENANT_ID) as { total: number; planejada: number }

      if (resumo.total === 0 && pedido.quantidade_produzida > 0) {
        db.prepare(`
          INSERT INTO lotes_producao (
            tenant_id, usuario_id, pedido_id, codigo, quantidade_planejada,
            quantidade_produzida, status, observacoes, fim_em
          ) VALUES (?, ?, ?, ?, ?, ?, 'Concluído', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        `).run(
          TENANT_ID, USUARIO_ID, data.pedidoId, `LOTE-${String(data.pedidoId).padStart(6, '0')}-BASE`,
          pedido.quantidade_produzida, pedido.quantidade_produzida,
          'Produção anterior preservada ao ativar o controle por lotes',
        )
        resumo.planejada = pedido.quantidade_produzida
      }
      if (!validarQuantidadeLote({
        quantidadePedido: pedido.quantidade,
        quantidadePlanejadaExistente: resumo.planejada,
        quantidadeNovoLote: data.quantidade,
      })) throw new Error(`OVER:${Math.max(0, pedido.quantidade - resumo.planejada)}`)
      if (data.impressoraId) {
        const impressora = db.prepare('SELECT 1 FROM impressoras WHERE id = ? AND tenant_id = ? AND ativo = 1')
          .get(data.impressoraId, TENANT_ID)
        if (!impressora) throw new Error('PRINTER_NOT_FOUND')
      }
      const sequencia = (db.prepare('SELECT COUNT(*) AS total FROM lotes_producao WHERE pedido_id = ?')
        .get(data.pedidoId) as { total: number }).total + 1
      const codigo = `LOTE-${String(data.pedidoId).padStart(6, '0')}-${String(sequencia).padStart(2, '0')}`
      const result = db.prepare(`
        INSERT INTO lotes_producao (
          tenant_id, usuario_id, pedido_id, impressora_id, codigo,
          quantidade_planejada, placa_referencia, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        TENANT_ID, USUARIO_ID, data.pedidoId, data.impressoraId, codigo,
        data.quantidade, data.placaReferencia.trim() || null, data.observacoes.trim() || null,
      )
      registrarAuditoria(db, {
        entidade: 'LoteProducao', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR',
        descricao: `${codigo} · ${data.quantidade} unidade(s)`,
      })
    })
    try { criar.immediate() } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_FOUND') return { success: false, message: 'Pedido não encontrado.' }
      if (code === 'INVALID_STATUS') return { success: false, message: 'O pedido precisa estar aprovado e em produção.' }
      if (code === 'PRINTER_NOT_FOUND') return { success: false, message: 'Impressora não encontrada.' }
      if (code.startsWith('OVER:')) return { success: false, message: `Só restam ${code.split(':')[1]} unidade(s) sem lote.` }
      throw error
    }
    revalidatePath('/producao')
    revalidatePath(`/pedidos/${data.pedidoId}`)
    return { success: true, message: 'Lote de produção criado.' }
  } catch (error) {
    console.error('[criarLoteProducao]', error)
    return { success: false, message: 'Não foi possível criar o lote.' }
  }
}

export async function atualizarLoteProducao(data: {
  loteId: number
  status: string
  quantidadeProduzida: number
  tempoRealHoras: number | null
}): Promise<{ success: boolean; message: string }> {
  try {
    const statusValidos = ['Planejado', 'Imprimindo', 'Concluído', 'Cancelado']
    if (!Number.isSafeInteger(data.loteId) || data.loteId <= 0 || !statusValidos.includes(data.status) ||
        !Number.isFinite(data.quantidadeProduzida) || data.quantidadeProduzida < 0 ||
        (data.tempoRealHoras !== null && (!Number.isFinite(data.tempoRealHoras) || data.tempoRealHoras < 0))) {
      return { success: false, message: 'Dados do lote inválidos.' }
    }
    let pedidoId = 0
    const atualizar = db.transaction(() => {
      const lote = db.prepare(`
        SELECT id, pedido_id, codigo, status, quantidade_planejada, quantidade_produzida
        FROM lotes_producao WHERE id = ? AND tenant_id = ?
      `).get(data.loteId, TENANT_ID) as LoteProducao | undefined
      if (!lote) throw new Error('NOT_FOUND')
      pedidoId = lote.pedido_id
      if (lote.status === 'Cancelado') throw new Error('CANCELED')
      if (data.quantidadeProduzida + 0.001 < lote.quantidade_produzida) throw new Error('REGRESSION')
      if (data.quantidadeProduzida > lote.quantidade_planejada + 0.001) throw new Error('OVER')
      if (data.status === 'Concluído' && Math.abs(data.quantidadeProduzida - lote.quantidade_planejada) > 0.001) throw new Error('INCOMPLETE')
      db.prepare(`
        UPDATE lotes_producao SET status = ?, quantidade_produzida = ?, tempo_real_horas = ?,
          inicio_em = CASE WHEN ? = 'Imprimindo' AND inicio_em IS NULL THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE inicio_em END,
          fim_em = CASE WHEN ? = 'Concluído' THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') ELSE fim_em END
        WHERE id = ? AND tenant_id = ?
      `).run(data.status, data.quantidadeProduzida, data.tempoRealHoras, data.status, data.status, data.loteId, TENANT_ID)
      const produzido = (db.prepare(`
        SELECT COALESCE(SUM(quantidade_produzida), 0) AS total FROM lotes_producao
        WHERE pedido_id = ? AND tenant_id = ? AND status != 'Cancelado'
      `).get(pedidoId, TENANT_ID) as { total: number }).total
      db.prepare(`
        UPDATE pedidos SET quantidade_produzida = MAX(quantidade_produzida, MIN(quantidade, ?)),
          status = CASE WHEN ? = 'Imprimindo' AND status = 'Fila' THEN 'Imprimindo' ELSE status END
        WHERE id = ? AND tenant_id = ?
      `).run(produzido, data.status, pedidoId, TENANT_ID)
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Lote de produção', ?)
      `).run(TENANT_ID, pedidoId, USUARIO_ID, `${lote.codigo}: ${lote.status} → ${data.status}; ${data.quantidadeProduzida}/${lote.quantidade_planejada}`)
      registrarAuditoria(db, {
        entidade: 'LoteProducao', entidadeId: data.loteId, acao: 'ATUALIZAR',
        descricao: `${data.status} · ${data.quantidadeProduzida}/${lote.quantidade_planejada}`,
      })
    })
    try { atualizar.immediate() } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_FOUND') return { success: false, message: 'Lote não encontrado.' }
      if (code === 'CANCELED') return { success: false, message: 'Lote cancelado não pode ser alterado.' }
      if (code === 'REGRESSION') return { success: false, message: 'A quantidade produzida não pode diminuir.' }
      if (code === 'OVER') return { success: false, message: 'Produção maior que a quantidade planejada.' }
      if (code === 'INCOMPLETE') return { success: false, message: 'Para concluir, informe toda a quantidade planejada.' }
      throw error
    }
    revalidatePath('/producao')
    revalidatePath(`/pedidos/${pedidoId}`)
    return { success: true, message: 'Lote atualizado e progresso do pedido sincronizado.' }
  } catch (error) {
    console.error('[atualizarLoteProducao]', error)
    return { success: false, message: 'Não foi possível atualizar o lote.' }
  }
}
