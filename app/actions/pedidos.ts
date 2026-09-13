'use server'

/**
 * app/actions/pedidos.ts  —  v2
 * Server Actions para o módulo de pedidos.
 * Suporta múltiplos filamentos por pedido via tabela pedido_filamentos.
 */

import db from '@/lib/db'
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
  faturamentoBruto: number   // soma valor_total_cobrado no mês atual
  custosTotais: number       // soma custo_filamento + valor_reserva_maquina no mês atual
  pedidosEmProducao: number  // status aprovado ou em_producao (para badge da sidebar)
  pedidosTotal: number       // total histórico
}
// ─── Dashboard stats ─────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  // Mês atual no formato YYYY-MM (SQLite usa UTC; aceitável para MVP)
  const mesStat = db
    .prepare(
      `SELECT
         COUNT(*) AS pedidos_mes,
         COALESCE(SUM(valor_total_cobrado), 0)                   AS faturamento_bruto,
         COALESCE(SUM(custo_filamento + valor_reserva_maquina), 0) AS custos_totais
       FROM pedidos
       WHERE tenant_id = ?
         AND strftime('%Y-%m', data_pedido) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as {
      pedidos_mes: number
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
    pedidosMes:        mesStat.pedidos_mes,
    faturamentoBruto:  mesStat.faturamento_bruto,
    custosTotais:      mesStat.custos_totais,
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
  custo_filamento: number
  valor_reserva_maquina: number
  taxa_operacional: number
  valor_total_cobrado: number
}

// ─── Mutation: criar pedido com múltiplos filamentos ─────────────────────────

export async function criarPedido(data: CriarPedidoInput): Promise<ActionResult> {
  try {
    const {
      nome_da_peca,
      cliente_id,
      tempo_impressao_horas,
      materials,
      custo_filamento,
      valor_reserva_maquina,
      taxa_operacional,
      valor_total_cobrado,
    } = data

    // Validações básicas
    if (!nome_da_peca?.trim())     return { success: false, message: 'Informe o nome da peça.' }
    if (!cliente_id)               return { success: false, message: 'Selecione um cliente.' }
    if (tempo_impressao_horas <= 0) return { success: false, message: 'Tempo de impressão inválido.' }
    if (!materials || materials.length === 0)
                                   return { success: false, message: 'Adicione pelo menos um material.' }

    const materialsValidos = materials.filter(m => m.filamento_id && m.peso_gasto_gramas > 0)
    if (materialsValidos.length === 0)
                                   return { success: false, message: 'Preencha o peso de pelo menos um material.' }

    // Verifica se o cliente pertence ao tenant
    const clienteOk = db
      .prepare('SELECT id FROM clientes WHERE id = ? AND tenant_id = ?')
      .get(cliente_id, TENANT_ID)
    if (!clienteOk) return { success: false, message: 'Cliente inválido.' }

    // Verifica se todos os filamentos pertencem ao tenant
    for (const m of materialsValidos) {
      const filOk = db
        .prepare('SELECT id FROM filamentos WHERE id = ? AND tenant_id = ?')
        .get(m.filamento_id, TENANT_ID)
      if (!filOk) return { success: false, message: `Filamento ID ${m.filamento_id} inválido.` }
    }

    // Busca os filamentos para calcular custo snapshot
    const filamentosMap = new Map<number, Filamento>()
    for (const m of materialsValidos) {
      if (!filamentosMap.has(m.filamento_id)) {
        const fil = db
          .prepare('SELECT id, material, cor, peso_rolo_gramas, preco_rolo FROM filamentos WHERE id = ?')
          .get(m.filamento_id) as Filamento
        filamentosMap.set(m.filamento_id, fil)
      }
    }

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
          custo_filamento,
          valor_reserva_maquina,
          taxa_operacional,
          valor_total_cobrado
        )

      const pedidoId = pedidoResult.lastInsertRowid as number

      // 2. Insere cada linha de filamento
      const stmtPF = db.prepare(
        `INSERT INTO pedido_filamentos (pedido_id, filamento_id, peso_gasto_gramas, custo_calculado)
         VALUES (?, ?, ?, ?)`
      )

      for (const m of materialsValidos) {
        const fil = filamentosMap.get(m.filamento_id)!
        const custoItem = m.peso_gasto_gramas * (fil.preco_rolo / fil.peso_rolo_gramas)
        stmtPF.run(pedidoId, m.filamento_id, m.peso_gasto_gramas, custoItem)
      }

      return pedidoId
    })

    const pedidoId = inserir()

    revalidatePath('/')

    return {
      success: true,
      message: `Orçamento "${nome_da_peca.trim()}" criado com sucesso!`,
      pedidoId,
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
    const validStatuses = ['Fila', 'Imprimindo', 'Acabamento', 'Finalizado', 'Cancelado']
    if (!validStatuses.includes(novoStatus)) {
      return { success: false, message: 'Status inválido.' }
    }

    // Transação atômica
    const atualizar = db.transaction(() => {
      // 1. Atualiza o status
      const res = db
        .prepare('UPDATE pedidos SET status = ? WHERE id = ? AND tenant_id = ?')
        .run(novoStatus, pedidoId, TENANT_ID)

      if (res.changes === 0) {
        throw new Error('NOT_FOUND')
      }

      // 2. Se finalizado, baixa o estoque
      if (novoStatus === 'Finalizado') {
        const filamentosDoPedido = db
          .prepare('SELECT filamento_id, peso_gasto_gramas FROM pedido_filamentos WHERE pedido_id = ?')
          .all(pedidoId) as { filamento_id: number; peso_gasto_gramas: number }[]

        const stmtAtualizaEstoque = db.prepare(
          `UPDATE filamentos 
           SET estoque_gramas = COALESCE(estoque_gramas, peso_rolo_gramas) - ? 
           WHERE id = ? AND tenant_id = ?`
        )

        for (const item of filamentosDoPedido) {
          stmtAtualizaEstoque.run(item.peso_gasto_gramas, item.filamento_id, TENANT_ID)
        }
      }
    })

    try {
      atualizar()
    } catch (err: any) {
      if (err.message === 'NOT_FOUND') {
        return { success: false, message: 'Pedido não encontrado.' }
      }
      throw err
    }

    revalidatePath('/producao')
    revalidatePath('/')
    return { success: true, message: `Status alterado para ${novoStatus}` }
  } catch (err) {
    console.error('[atualizarStatusPedido]', err)
    return { success: false, message: 'Erro interno ao atualizar status.' }
  }
}

