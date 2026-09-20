'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { adicionarMeses, dividirEmParcelas } from '@/lib/financeiro.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface Impressora {
  id: number
  nome: string
  modelo: string | null
  potencia_w: number
  custo_hora: number
  status: 'Disponivel' | 'Em uso' | 'Manutencao' | 'Inativa'
  pedidos_ativos?: number
  horas_planejadas?: number
}

export interface PedidoMaterialDetalhe {
  id: number
  filamento_id: number
  nome: string
  peso_gasto_gramas: number
  consumo_real_gramas: number | null
  custo_calculado: number
}

export interface PedidoInsumoDetalhe {
  id: number
  insumo_id: number
  nome: string
  unidade: string
  quantidade: number
  consumo_real: number | null
  custo_calculado: number
}

export interface HistoricoPedido {
  id: number
  evento: string
  descricao: string
  criado_em: string
}

export interface AnexoPedido {
  id: number
  nome: string
  url: string
  criado_em: string
}

export interface ParcelaPedido {
  id: number
  numero: number
  valor: number
  vencimento_em: string
  recebido: number
  saldo: number
  situacao: 'Pago' | 'Parcial' | 'Atrasado' | 'Em aberto'
}

export interface PedidoDetalhes {
  id: number
  numero_orcamento: string
  nome_da_peca: string
  descricao: string | null
  cliente_nome: string
  cliente_telefone: string | null
  cliente_email: string | null
  status: string
  orcamento_status: string
  data_pedido: string
  data_entrega: string | null
  validade_orcamento: string | null
  vencimento_em: string | null
  parcelas: number
  condicao_pagamento: string | null
  tempo_impressao_horas: number
  tempo_real_horas: number | null
  custo_filamento: number
  custo_insumos: number
  custo_energia: number
  valor_reserva_maquina: number
  custo_embalagem: number
  frete_pago: number
  custo_extra_real: number
  valor_total_cobrado: number
  total_recebido: number
  saldo_pendente: number
  custo_real: number
  lucro_liquido: number
  margem_percentual: number
  falhas_impressao: number
  impressora_id: number | null
  impressora_nome: string | null
  inicio_previsto: string | null
  fim_previsto: string | null
  materiais: PedidoMaterialDetalhe[]
  insumos: PedidoInsumoDetalhe[]
  historico: HistoricoPedido[]
  anexos: AnexoPedido[]
  parcelas_receber: ParcelaPedido[]
}

export async function getImpressoras(): Promise<Impressora[]> {
  return db.prepare(`
    SELECT imp.id, imp.nome, imp.modelo, imp.potencia_w, imp.custo_hora, imp.status,
      COUNT(CASE WHEN p.status IN ('Fila', 'Imprimindo', 'Acabamento')
        AND p.orcamento_status = 'Aprovado' THEN 1 END) AS pedidos_ativos,
      COALESCE(SUM(CASE WHEN p.status IN ('Fila', 'Imprimindo', 'Acabamento')
        AND p.orcamento_status = 'Aprovado' THEN p.tempo_impressao_horas ELSE 0 END), 0) AS horas_planejadas
    FROM impressoras imp
    LEFT JOIN pedidos p ON p.impressora_id = imp.id AND p.tenant_id = imp.tenant_id
    WHERE imp.tenant_id = ? AND imp.ativo = 1
    GROUP BY imp.id
    ORDER BY imp.nome
  `).all(TENANT_ID) as Impressora[]
}

export async function salvarImpressora(
  id: number | null,
  data: Omit<Impressora, 'id' | 'pedidos_ativos' | 'horas_planejadas'>,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!data.nome.trim()) return { success: false, message: 'Informe o nome da impressora.' }
    if (!Number.isFinite(data.potencia_w) || data.potencia_w < 0 ||
        !Number.isFinite(data.custo_hora) || data.custo_hora < 0) {
      return { success: false, message: 'Potência ou custo por hora inválido.' }
    }
    if (!['Disponivel', 'Em uso', 'Manutencao', 'Inativa'].includes(data.status)) {
      return { success: false, message: 'Status da impressora inválido.' }
    }

    if (id) {
      const result = db.prepare(`
        UPDATE impressoras SET nome = ?, modelo = ?, potencia_w = ?, custo_hora = ?, status = ?
        WHERE id = ? AND tenant_id = ? AND ativo = 1
      `).run(
        data.nome.trim(), data.modelo?.trim() || null, data.potencia_w,
        data.custo_hora, data.status, id, TENANT_ID,
      )
      if (result.changes !== 1) return { success: false, message: 'Impressora não encontrada.' }
    } else {
      db.prepare(`
        INSERT INTO impressoras (tenant_id, nome, modelo, potencia_w, custo_hora, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        TENANT_ID, data.nome.trim(), data.modelo?.trim() || null,
        data.potencia_w, data.custo_hora, data.status,
      )
    }
    revalidatePath('/impressoras')
    revalidatePath('/producao')
    return { success: true, message: id ? 'Impressora atualizada.' : 'Impressora cadastrada.' }
  } catch (error) {
    console.error('[salvarImpressora]', error)
    return { success: false, message: 'Erro interno ao salvar impressora.' }
  }
}

export async function arquivarImpressora(id: number): Promise<{ success: boolean; message: string }> {
  try {
    const ativa = db.prepare(`
      SELECT COUNT(*) AS total FROM pedidos
      WHERE tenant_id = ? AND impressora_id = ? AND status IN ('Fila', 'Imprimindo', 'Acabamento')
    `).get(TENANT_ID, id) as { total: number }
    if (ativa.total > 0) {
      return { success: false, message: 'Realoque os pedidos ativos antes de arquivar.' }
    }
    const result = db.prepare(
      'UPDATE impressoras SET ativo = 0 WHERE id = ? AND tenant_id = ? AND ativo = 1',
    ).run(id, TENANT_ID)
    if (result.changes !== 1) return { success: false, message: 'Impressora não encontrada.' }
    revalidatePath('/impressoras')
    return { success: true, message: 'Impressora arquivada.' }
  } catch (error) {
    console.error('[arquivarImpressora]', error)
    return { success: false, message: 'Erro interno ao arquivar impressora.' }
  }
}

export async function atualizarStatusOrcamento(
  pedidoId: number,
  novoStatus: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const transicoes: Record<string, string[]> = {
      Rascunho: ['Enviado', 'Aprovado', 'Recusado'],
      Enviado: ['Aprovado', 'Recusado', 'Expirado'],
      Aprovado: [],
      Recusado: [],
      Expirado: ['Enviado', 'Aprovado'],
    }
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !(novoStatus in transicoes)) {
      return { success: false, message: 'Orçamento ou status inválido.' }
    }

    const atualizar = db.transaction(() => {
      const atual = db.prepare(`
        SELECT orcamento_status, valor_total_cobrado, parcelas,
          COALESCE(vencimento_em, substr(data_pedido, 1, 10)) AS primeiro_vencimento
        FROM pedidos WHERE id = ? AND tenant_id = ?
      `).get(pedidoId, TENANT_ID) as {
        orcamento_status: string
        valor_total_cobrado: number
        parcelas: number
        primeiro_vencimento: string
      } | undefined
      if (!atual) throw new Error('NOT_FOUND')
      if (atual.orcamento_status === novoStatus) return
      if (!transicoes[atual.orcamento_status]?.includes(novoStatus)) throw new Error('INVALID_TRANSITION')

      db.prepare(`
        UPDATE pedidos
        SET orcamento_status = ?,
            validade_orcamento = CASE
              WHEN ? = 'Expirado' AND ? = 'Enviado' THEN date('now', '+7 days')
              ELSE validade_orcamento
            END
        WHERE id = ? AND tenant_id = ?
      `).run(novoStatus, atual.orcamento_status, novoStatus, pedidoId, TENANT_ID)
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Status do orçamento', ?)
      `).run(TENANT_ID, pedidoId, USUARIO_ID, `${atual.orcamento_status} → ${novoStatus}`)

      if (novoStatus === 'Aprovado') {
        const total = db.prepare(
          'SELECT COUNT(*) AS total FROM parcelas_receber WHERE pedido_id = ?',
        ).get(pedidoId) as { total: number }
        if (total.total === 0) {
          const inserir = db.prepare(`
            INSERT INTO parcelas_receber (tenant_id, pedido_id, numero, valor, vencimento_em)
            VALUES (?, ?, ?, ?, ?)
          `)
          dividirEmParcelas(atual.valor_total_cobrado, atual.parcelas).forEach((valor, index) => {
            inserir.run(
              TENANT_ID,
              pedidoId,
              index + 1,
              valor,
              adicionarMeses(atual.primeiro_vencimento, index),
            )
          })
        }
      }

      registrarAuditoria(db, {
        entidade: 'Pedido',
        entidadeId: pedidoId,
        acao: 'STATUS_ORCAMENTO',
        descricao: `${atual.orcamento_status} → ${novoStatus}`,
      })
    })
    atualizar()
    revalidatePath('/')
    revalidatePath('/orcamentos')
    revalidatePath('/producao')
    revalidatePath(`/pedidos/${pedidoId}`)
    return { success: true, message: `Orçamento marcado como ${novoStatus}.` }
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { success: false, message: 'Orçamento não encontrado.' }
    }
    if (error instanceof Error && error.message === 'INVALID_TRANSITION') {
      return { success: false, message: 'Essa mudança de status não é permitida.' }
    }
    console.error('[atualizarStatusOrcamento]', error)
    return { success: false, message: 'Erro interno ao atualizar orçamento.' }
  }
}

export async function getPedidoDetalhes(pedidoId: number): Promise<PedidoDetalhes | null> {
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) return null

  const pedido = db.prepare(`
    SELECT p.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
      c.email AS cliente_email, imp.nome AS impressora_nome,
      COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS total_recebido,
      MAX(0, p.valor_total_cobrado - COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)) AS saldo_pendente,
      (
        COALESCE((SELECT SUM(COALESCE(pf.consumo_real_gramas, pf.peso_gasto_gramas)
          * f.preco_rolo / f.peso_rolo_gramas)
          FROM pedido_filamentos pf JOIN filamentos f ON f.id = pf.filamento_id
          WHERE pf.pedido_id = p.id), 0) +
        COALESCE((SELECT SUM(COALESCE(pi.consumo_real, pi.quantidade) * pi.custo_unitario_snap)
          FROM pedido_insumos pi WHERE pi.pedido_id = p.id), 0) +
        p.custo_energia +
        COALESCE(p.tempo_real_horas, p.tempo_impressao_horas) *
          CASE WHEN imp.custo_hora > 0 THEN imp.custo_hora ELSE t.custo_hora_maquina END +
        p.taxa_operacional + p.custo_embalagem + p.frete_pago +
        p.taxas_comissoes + p.custo_extra_real
      ) AS custo_real
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id
    JOIN tenants t ON t.id = p.tenant_id
    LEFT JOIN impressoras imp ON imp.id = p.impressora_id
    WHERE p.id = ? AND p.tenant_id = ?
  `).get(pedidoId, TENANT_ID) as (Omit<PedidoDetalhes, 'materiais' | 'insumos' | 'historico' | 'anexos' | 'parcelas_receber' | 'lucro_liquido' | 'margem_percentual'> & {
    custo_real: number
  }) | undefined
  if (!pedido) return null

  const materiais = db.prepare(`
    SELECT pf.id, pf.filamento_id, f.material || ' ' || f.cor AS nome,
      pf.peso_gasto_gramas, pf.consumo_real_gramas, pf.custo_calculado
    FROM pedido_filamentos pf
    JOIN filamentos f ON f.id = pf.filamento_id
    WHERE pf.pedido_id = ? ORDER BY pf.id
  `).all(pedidoId) as PedidoMaterialDetalhe[]
  const insumos = db.prepare(`
    SELECT pi.id, pi.insumo_id, i.nome, i.unidade, pi.quantidade,
      pi.consumo_real, pi.custo_calculado
    FROM pedido_insumos pi JOIN insumos i ON i.id = pi.insumo_id
    WHERE pi.pedido_id = ? ORDER BY pi.id
  `).all(pedidoId) as PedidoInsumoDetalhe[]
  const historico = db.prepare(`
    SELECT id, evento, descricao, criado_em FROM historico_pedidos
    WHERE pedido_id = ? ORDER BY criado_em DESC, id DESC
  `).all(pedidoId) as HistoricoPedido[]
  const anexos = db.prepare(`
    SELECT id, nome, url, criado_em FROM anexos_pedido
    WHERE pedido_id = ? ORDER BY criado_em DESC
  `).all(pedidoId) as AnexoPedido[]
  const parcelasReceber = db.prepare(`
    WITH dados AS (
      SELECT pr.*,
        COALESCE(SUM(pr.valor) OVER (
          PARTITION BY pr.pedido_id ORDER BY pr.numero
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS valor_anterior,
        COALESCE((SELECT SUM(r.valor) FROM recebimentos r
          WHERE r.pedido_id = pr.pedido_id AND r.estornado_em IS NULL), 0) AS total_recebido
      FROM parcelas_receber pr
      WHERE pr.pedido_id = ? AND pr.cancelada_em IS NULL
    )
    SELECT id, numero, valor, vencimento_em,
      MAX(0, MIN(valor, total_recebido - valor_anterior)) AS recebido,
      valor - MAX(0, MIN(valor, total_recebido - valor_anterior)) AS saldo,
      CASE
        WHEN valor <= MAX(0, MIN(valor, total_recebido - valor_anterior)) THEN 'Pago'
        WHEN MAX(0, MIN(valor, total_recebido - valor_anterior)) > 0 THEN 'Parcial'
        WHEN date(vencimento_em) < date('now') THEN 'Atrasado'
        ELSE 'Em aberto'
      END AS situacao
    FROM dados ORDER BY numero
  `).all(pedidoId) as ParcelaPedido[]

  const lucroLiquido = Math.round((pedido.valor_total_cobrado - pedido.custo_real) * 100) / 100
  const margemPercentual = pedido.valor_total_cobrado > 0
    ? Math.round((lucroLiquido / pedido.valor_total_cobrado) * 10000) / 100
    : 0
  return {
    ...pedido,
    lucro_liquido: lucroLiquido,
    margem_percentual: margemPercentual,
    materiais,
    insumos,
    historico,
    anexos,
    parcelas_receber: parcelasReceber,
  }
}

export async function salvarOperacaoPedido(data: {
  pedidoId: number
  impressoraId: number | null
  inicioPrevisto: string
  fimPrevisto: string
  tempoRealHoras: number | null
  custoExtraReal: number
  falhasImpressao: number
  materiais: { id: number; consumoReal: number | null }[]
  insumos: { id: number; consumoReal: number | null }[]
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0) {
      return { success: false, message: 'Pedido inválido.' }
    }
    if (data.impressoraId !== null && (!Number.isSafeInteger(data.impressoraId) || data.impressoraId <= 0)) {
      return { success: false, message: 'Impressora inválida.' }
    }
    if (data.tempoRealHoras !== null && (!Number.isFinite(data.tempoRealHoras) || data.tempoRealHoras < 0)) {
      return { success: false, message: 'Tempo real inválido.' }
    }
    if (!Number.isFinite(data.custoExtraReal) || data.custoExtraReal < 0 ||
        !Number.isSafeInteger(data.falhasImpressao) || data.falhasImpressao < 0) {
      return { success: false, message: 'Custos ou falhas inválidos.' }
    }

    const salvar = db.transaction(() => {
      if (data.impressoraId !== null) {
        const impressora = db.prepare(
          'SELECT id FROM impressoras WHERE id = ? AND tenant_id = ? AND ativo = 1',
        ).get(data.impressoraId, TENANT_ID)
        if (!impressora) throw new Error('INVALID_PRINTER')
      }

      const result = db.prepare(`
        UPDATE pedidos SET impressora_id = ?, inicio_previsto = ?, fim_previsto = ?,
          tempo_real_horas = ?, custo_extra_real = ?, falhas_impressao = ?
        WHERE id = ? AND tenant_id = ? AND status NOT IN ('Finalizado', 'Cancelado')
      `).run(
        data.impressoraId, data.inicioPrevisto || null, data.fimPrevisto || null,
        data.tempoRealHoras, data.custoExtraReal, data.falhasImpressao,
        data.pedidoId, TENANT_ID,
      )
      if (result.changes !== 1) throw new Error('NOT_FOUND')

      const updateMaterial = db.prepare(`
        UPDATE pedido_filamentos SET consumo_real_gramas = ?
        WHERE id = ? AND pedido_id = ?
      `)
      for (const item of data.materiais) {
        if (!Number.isSafeInteger(item.id) || item.id <= 0 ||
            (item.consumoReal !== null && (!Number.isFinite(item.consumoReal) || item.consumoReal < 0))) {
          throw new Error('INVALID_CONSUMPTION')
        }
        if (updateMaterial.run(item.consumoReal, item.id, data.pedidoId).changes !== 1) {
          throw new Error('INVALID_CONSUMPTION')
        }
      }

      const updateInsumo = db.prepare(`
        UPDATE pedido_insumos SET consumo_real = ? WHERE id = ? AND pedido_id = ?
      `)
      for (const item of data.insumos) {
        if (!Number.isSafeInteger(item.id) || item.id <= 0 ||
            (item.consumoReal !== null && (!Number.isFinite(item.consumoReal) || item.consumoReal < 0))) {
          throw new Error('INVALID_CONSUMPTION')
        }
        if (updateInsumo.run(item.consumoReal, item.id, data.pedidoId).changes !== 1) {
          throw new Error('INVALID_CONSUMPTION')
        }
      }

      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Operação atualizada', 'Planejamento e consumo real revisados')
      `).run(TENANT_ID, data.pedidoId, USUARIO_ID)
    })
    salvar()
    revalidatePath('/')
    revalidatePath('/producao')
    revalidatePath('/impressoras')
    revalidatePath(`/pedidos/${data.pedidoId}`)
    return { success: true, message: 'Operação e custos reais atualizados.' }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'NOT_FOUND') return { success: false, message: 'Pedido não encontrado ou já encerrado.' }
    if (code === 'INVALID_PRINTER') return { success: false, message: 'Impressora não encontrada.' }
    if (code === 'INVALID_CONSUMPTION') return { success: false, message: 'Consumo real inválido.' }
    console.error('[salvarOperacaoPedido]', error)
    return { success: false, message: 'Erro interno ao atualizar operação.' }
  }
}

export async function salvarAnexoPedido(data: {
  pedidoId: number
  nome: string
  url: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!data.nome.trim()) return { success: false, message: 'Informe o nome do arquivo.' }
    let url: URL
    try {
      url = new URL(data.url)
    } catch {
      return { success: false, message: 'Informe uma URL válida.' }
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { success: false, message: 'A URL deve usar http ou https.' }
    }
    const pedido = db.prepare('SELECT id FROM pedidos WHERE id = ? AND tenant_id = ?')
      .get(data.pedidoId, TENANT_ID)
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }
    db.prepare('INSERT INTO anexos_pedido (pedido_id, nome, url) VALUES (?, ?, ?)')
      .run(data.pedidoId, data.nome.trim().slice(0, 160), url.toString())
    revalidatePath(`/pedidos/${data.pedidoId}`)
    return { success: true, message: 'Link anexado ao pedido.' }
  } catch (error) {
    console.error('[salvarAnexoPedido]', error)
    return { success: false, message: 'Erro interno ao anexar link.' }
  }
}

export async function removerAnexoPedido(id: number, pedidoId: number): Promise<{ success: boolean; message: string }> {
  try {
    const result = db.prepare(`
      DELETE FROM anexos_pedido WHERE id = ? AND pedido_id = ?
        AND EXISTS (SELECT 1 FROM pedidos p WHERE p.id = pedido_id AND p.tenant_id = ?)
    `).run(id, pedidoId, TENANT_ID)
    if (result.changes !== 1) return { success: false, message: 'Anexo não encontrado.' }
    revalidatePath(`/pedidos/${pedidoId}`)
    return { success: true, message: 'Anexo removido.' }
  } catch (error) {
    console.error('[removerAnexoPedido]', error)
    return { success: false, message: 'Erro interno ao remover anexo.' }
  }
}
