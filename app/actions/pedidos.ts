'use server'

/**
 * app/actions/pedidos.ts  —  v2
 * Server Actions para o módulo de pedidos.
 * Suporta múltiplos filamentos por pedido via tabela pedido_filamentos.
 */

import db from '@/lib/db'
import { arredondarMoeda, calcularOrcamento } from '@/lib/orcamento.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1 // MVP single-tenant

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface Cliente {
  id: number
  nome: string
  telefone: string | null
}

export interface Filamento {
  id: number
  material: string
  cor: string
  peso_rolo_gramas: number
  preco_rolo: number
}

export interface ActionResult {
  success: boolean
  message: string
  pedidoId?: number
  valorTotal?: number
}

export interface PedidoResumo {
  id: number
  nome_da_peca: string
  cliente_nome: string
  cliente_telefone: string | null
  materiais: string
  peso_total_gramas: number
  tempo_impressao_horas: number
  custo_filamento: number
  valor_reserva_maquina: number
  taxa_operacional: number
  valor_total_cobrado: number
  status: string
  data_pedido: string
}

export interface DashboardStats {
  pedidosMes: number
  faturamentoBruto: number   // pedidos finalizados no mês atual
  custosTotais: number       // custos dos pedidos finalizados no mês atual
  pedidosFinalizadosMes: number
  pedidosEmProducao: number  // status aprovado ou em_producao (para badge da sidebar)
  pedidosTotal: number       // total histórico
}
// ─── Dashboard stats ─────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const pedidosMesRow = db
    .prepare(
      `SELECT COUNT(*) AS pedidos_mes
       FROM pedidos
       WHERE tenant_id = ?
         AND status != 'Cancelado'
         AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as { pedidos_mes: number }

  const financeiroMes = db
    .prepare(
      `SELECT
         COUNT(*) AS pedidos_finalizados,
         COALESCE(SUM(valor_total_cobrado), 0)                   AS faturamento_bruto,
         COALESCE(SUM(custo_filamento + valor_reserva_maquina), 0) AS custos_totais
       FROM pedidos
       WHERE tenant_id = ?
         AND status = 'Finalizado'
         AND strftime('%Y-%m', COALESCE(data_conclusao, data_pedido)) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as {
      pedidos_finalizados: number
      faturamento_bruto: number
      custos_totais: number
    }

  const emProducaoRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM pedidos
       WHERE tenant_id = ? AND status IN ('Fila', 'Imprimindo', 'Acabamento')`
    )
    .get(TENANT_ID) as { cnt: number }

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM pedidos WHERE tenant_id = ?`)
    .get(TENANT_ID) as { cnt: number }

  return {
    pedidosMes:        pedidosMesRow.pedidos_mes,
    faturamentoBruto:  financeiroMes.faturamento_bruto,
    custosTotais:      financeiroMes.custos_totais,
    pedidosFinalizadosMes: financeiroMes.pedidos_finalizados,
    pedidosEmProducao: emProducaoRow.cnt,
    pedidosTotal:      totalRow.cnt,
  }
}

// ─── Queries de leitura ───────────────────────────────────────────────────────

export async function getClientes(): Promise<Cliente[]> {
  return db
    .prepare(
      `SELECT id, nome, telefone
       FROM clientes
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY nome ASC`
    )
    .all(TENANT_ID) as Cliente[]
}

export async function getFilamentos(): Promise<Filamento[]> {
  return db
    .prepare(
      `SELECT id, material, cor, peso_rolo_gramas, preco_rolo
       FROM filamentos
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY material ASC, cor ASC`
    )
    .all(TENANT_ID) as Filamento[]
}

export async function getPedidosRecentes(limite = 20): Promise<PedidoResumo[]> {
  return db
    .prepare(
      `SELECT
         p.id,
         p.nome_da_peca,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         COALESCE(
           (SELECT GROUP_CONCAT(f.material || ' ' || f.cor, ' · ')
            FROM pedido_filamentos pf
            JOIN filamentos f ON f.id = pf.filamento_id
            WHERE pf.pedido_id = p.id), '—'
         ) AS materiais,
         COALESCE(
           (SELECT SUM(pf.peso_gasto_gramas)
            FROM pedido_filamentos pf
            WHERE pf.pedido_id = p.id), 0
         ) AS peso_total_gramas,
         p.tempo_impressao_horas,
         p.custo_filamento,
         p.valor_reserva_maquina,
         p.taxa_operacional,
         p.valor_total_cobrado,
         p.status,
         p.data_pedido
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       WHERE p.tenant_id = ?
       ORDER BY p.data_pedido DESC
       LIMIT ?`
    )
    .all(TENANT_ID, limite) as PedidoResumo[]
}

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export interface MaterialInput {
  filamento_id: number
  peso_gasto_gramas: number
}

export interface CriarPedidoInput {
  nome_da_peca: string
  cliente_id: number
  tempo_impressao_horas: number
  materials: MaterialInput[]
}

// ─── Mutation: criar pedido com múltiplos filamentos ─────────────────────────

export async function criarPedido(data: CriarPedidoInput): Promise<ActionResult> {
  try {
    const { nome_da_peca, cliente_id, tempo_impressao_horas, materials } = data

    if (typeof nome_da_peca !== 'string' || !nome_da_peca.trim())
      return { success: false, message: 'Informe o nome da peça.' }
    if (nome_da_peca.trim().length > 160)
      return { success: false, message: 'O nome da peça deve ter até 160 caracteres.' }
    if (!Number.isSafeInteger(cliente_id) || cliente_id <= 0)
      return { success: false, message: 'Selecione um cliente válido.' }
    if (!Number.isFinite(tempo_impressao_horas) || tempo_impressao_horas <= 0 || tempo_impressao_horas > 10_000)
      return { success: false, message: 'Tempo de impressão inválido.' }
    if (!Array.isArray(materials) || materials.length === 0 || materials.length > 8)
      return { success: false, message: 'Adicione de um a oito materiais.' }

    const pesosPorFilamento = new Map<number, number>()
    for (const material of materials) {
      if (
        !Number.isSafeInteger(material.filamento_id) ||
        material.filamento_id <= 0 ||
        !Number.isFinite(material.peso_gasto_gramas) ||
        material.peso_gasto_gramas <= 0 ||
        material.peso_gasto_gramas > 100_000
      ) {
        return { success: false, message: 'Material ou peso inválido.' }
      }
      pesosPorFilamento.set(
        material.filamento_id,
        (pesosPorFilamento.get(material.filamento_id) ?? 0) + material.peso_gasto_gramas,
      )
    }
    const materialsValidos = Array.from(pesosPorFilamento, ([filamento_id, peso_gasto_gramas]) => ({
      filamento_id,
      peso_gasto_gramas,
    }))

    // Verifica se o cliente pertence ao tenant
    const clienteOk = db
      .prepare('SELECT id FROM clientes WHERE id = ? AND tenant_id = ? AND ativo = 1')
      .get(cliente_id, TENANT_ID)
    if (!clienteOk) return { success: false, message: 'Cliente inválido.' }

    const filamentosMap = new Map<number, Filamento>()
    for (const m of materialsValidos) {
      const fil = db
        .prepare(
          `SELECT id, material, cor, peso_rolo_gramas, preco_rolo
           FROM filamentos
           WHERE id = ? AND tenant_id = ? AND ativo = 1`,
        )
        .get(m.filamento_id, TENANT_ID) as Filamento | undefined
      if (!fil) return { success: false, message: `Filamento ID ${m.filamento_id} inválido.` }
      filamentosMap.set(m.filamento_id, fil)
    }

    const configuracao = db
      .prepare('SELECT taxa_operacional, custo_hora_maquina FROM tenants WHERE id = ? AND ativo = 1')
      .get(TENANT_ID) as { taxa_operacional: number; custo_hora_maquina: number } | undefined
    if (!configuracao) return { success: false, message: 'Configuração da empresa não encontrada.' }

    const totais = calcularOrcamento({
      tempoImpressaoHoras: tempo_impressao_horas,
      custoHoraMaquina: configuracao.custo_hora_maquina,
      taxaOperacional: configuracao.taxa_operacional,
      materiais: materialsValidos.map((m) => {
        const filamento = filamentosMap.get(m.filamento_id)!
        return {
          pesoGramas: m.peso_gasto_gramas,
          custoPorGrama: filamento.preco_rolo / filamento.peso_rolo_gramas,
        }
      }),
    })

    // Transação: insere pedido + todos os filamentos atomicamente
    const inserir = db.transaction(() => {
      // 1. Insere o pedido
      const pedidoResult = db
        .prepare(
          `INSERT INTO pedidos (
            tenant_id, usuario_id, cliente_id,
            nome_da_peca, tempo_impressao_horas,
            custo_filamento, valor_reserva_maquina, taxa_operacional, valor_total_cobrado,
            status
          ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 'Fila')`
        )
        .run(
          TENANT_ID,
          cliente_id,
          nome_da_peca.trim(),
          tempo_impressao_horas,
          totais.materialCost,
          totais.machineReserve,
          totais.operationalFee,
          totais.total
        )

      const pedidoId = pedidoResult.lastInsertRowid as number

      // 2. Insere cada linha de filamento
      const stmtPF = db.prepare(
        `INSERT INTO pedido_filamentos (pedido_id, filamento_id, peso_gasto_gramas, custo_calculado)
         VALUES (?, ?, ?, ?)`
      )

      for (const m of materialsValidos) {
        const fil = filamentosMap.get(m.filamento_id)!
        const custoItem = arredondarMoeda(m.peso_gasto_gramas * (fil.preco_rolo / fil.peso_rolo_gramas))
        stmtPF.run(pedidoId, m.filamento_id, m.peso_gasto_gramas, custoItem)
      }

      return pedidoId
    })

    const pedidoId = inserir()

    revalidatePath('/')
    revalidatePath('/orcamentos')
    revalidatePath('/producao')

    return {
      success: true,
      message: `Orçamento "${nome_da_peca.trim()}" criado com sucesso!`,
      pedidoId,
      valorTotal: totais.total,
    }
  } catch (err) {
    console.error('[criarPedido]', err)
    return { success: false, message: 'Erro interno ao salvar. Tente novamente.' }
  }
}

// ─── Kanban (Produção) ────────────────────────────────────────────────────────

export async function getPedidosKanban(): Promise<PedidoResumo[]> {
  return db
    .prepare(
      `SELECT
         p.id,
         p.nome_da_peca,
         c.nome AS cliente_nome,
         c.telefone AS cliente_telefone,
         COALESCE(
           (SELECT GROUP_CONCAT(
              f.material || ' ' || f.cor || '|' || 
              pf.peso_gasto_gramas || '|' || 
              COALESCE(f.estoque_gramas, f.peso_rolo_gramas), 
              '///'
            )
            FROM pedido_filamentos pf
            JOIN filamentos f ON f.id = pf.filamento_id
            WHERE pf.pedido_id = p.id), ''
         ) AS materiais,
         COALESCE(
           (SELECT SUM(pf.peso_gasto_gramas)
            FROM pedido_filamentos pf
            WHERE pf.pedido_id = p.id), 0
         ) AS peso_total_gramas,
         p.tempo_impressao_horas,
         p.custo_filamento,
         p.valor_reserva_maquina,
         p.taxa_operacional,
         p.valor_total_cobrado,
         p.status,
         p.data_pedido
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       WHERE p.tenant_id = ? AND p.status IN ('Fila', 'Imprimindo', 'Acabamento', 'Finalizado')
       ORDER BY p.data_pedido ASC`
    )
    .all(TENANT_ID) as PedidoResumo[]
}

export async function atualizarStatusPedido(pedidoId: number, novoStatus: string): Promise<ActionResult> {
  try {
    const transicoesPermitidas: Record<string, string[]> = {
      Fila: ['Imprimindo', 'Cancelado'],
      Imprimindo: ['Acabamento', 'Cancelado'],
      Acabamento: ['Finalizado', 'Cancelado'],
      Finalizado: [],
      Cancelado: [],
    }
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      return { success: false, message: 'Pedido inválido.' }
    }
    if (!(novoStatus in transicoesPermitidas)) {
      return { success: false, message: 'Status inválido.' }
    }

    const atualizar = db.transaction(() => {
      const pedido = db
        .prepare('SELECT status FROM pedidos WHERE id = ? AND tenant_id = ?')
        .get(pedidoId, TENANT_ID) as { status: string } | undefined

      if (!pedido) throw new Error('NOT_FOUND')
      if (pedido.status === novoStatus) return 'UNCHANGED'
      if (!transicoesPermitidas[pedido.status]?.includes(novoStatus)) {
        throw new Error('INVALID_TRANSITION')
      }

      if (novoStatus === 'Finalizado') {
        const filamentosDoPedido = db
          .prepare(
            `SELECT
               pf.filamento_id,
               SUM(pf.peso_gasto_gramas) AS peso_gasto_gramas,
               f.material,
               f.cor,
               COALESCE(f.estoque_gramas, f.peso_rolo_gramas) AS estoque_gramas
             FROM pedido_filamentos pf
             JOIN filamentos f ON f.id = pf.filamento_id AND f.tenant_id = ?
             WHERE pf.pedido_id = ?
             GROUP BY pf.filamento_id, f.material, f.cor, f.estoque_gramas, f.peso_rolo_gramas`,
          )
          .all(TENANT_ID, pedidoId) as {
            filamento_id: number
            peso_gasto_gramas: number
            material: string
            cor: string
            estoque_gramas: number
          }[]

        for (const item of filamentosDoPedido) {
          if (item.estoque_gramas < item.peso_gasto_gramas) {
            throw new Error(`INSUFFICIENT_STOCK:${item.material} ${item.cor}`)
          }
        }

        const baixarEstoque = db.prepare(
          `UPDATE filamentos
           SET estoque_gramas = COALESCE(estoque_gramas, peso_rolo_gramas) - ?
           WHERE id = ?
             AND tenant_id = ?
             AND COALESCE(estoque_gramas, peso_rolo_gramas) >= ?`,
        )

        for (const item of filamentosDoPedido) {
          const baixa = baixarEstoque.run(
            item.peso_gasto_gramas,
            item.filamento_id,
            TENANT_ID,
            item.peso_gasto_gramas,
          )
          if (baixa.changes !== 1) throw new Error('STOCK_CHANGED')
        }
      }

      const res = db
        .prepare(
          `UPDATE pedidos
           SET status = ?,
               data_conclusao = CASE
                 WHEN ? = 'Finalizado' THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 ELSE data_conclusao
               END
           WHERE id = ? AND tenant_id = ? AND status = ?`,
        )
        .run(novoStatus, novoStatus, pedidoId, TENANT_ID, pedido.status)

      if (res.changes !== 1) throw new Error('STATUS_CHANGED')
      return 'UPDATED'
    })

    try {
      const resultado = atualizar()
      if (resultado === 'UNCHANGED') {
        return { success: true, message: `O pedido já está em ${novoStatus}.` }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message === 'NOT_FOUND') {
        return { success: false, message: 'Pedido não encontrado.' }
      }
      if (message === 'INVALID_TRANSITION') {
        return { success: false, message: 'Essa mudança de status não é permitida.' }
      }
      if (message.startsWith('INSUFFICIENT_STOCK:')) {
        return {
          success: false,
          message: `Estoque insuficiente de ${message.slice('INSUFFICIENT_STOCK:'.length)}.`,
        }
      }
      if (message === 'STOCK_CHANGED' || message === 'STATUS_CHANGED') {
        return { success: false, message: 'Os dados mudaram durante a operação. Tente novamente.' }
      }
      throw err
    }

    revalidatePath('/producao')
    revalidatePath('/')
    revalidatePath('/orcamentos')
    return { success: true, message: `Status alterado para ${novoStatus}` }
  } catch (err) {
    console.error('[atualizarStatusPedido]', err)
    return { success: false, message: 'Erro interno ao atualizar status.' }
  }
}
