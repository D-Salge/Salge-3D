'use server'

/**
 * app/actions/pedidos.ts  -  v3
 * Server Actions para o modulo de pedidos (ERP completo).
 * Suporta: multiplos filamentos, insumos, custos detalhados,
 * desconto, frete, data de entrega, recebimentos e dashboard stats.
 */

import db from '@/lib/db'
import { arredondarMoeda, calcularOrcamento } from '@/lib/orcamento.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

// --- Tipos publicos ---

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
  custo_insumos: number
  custo_energia: number
  custo_embalagem: number
  valor_reserva_maquina: number
  taxa_operacional: number
  desconto: number
  frete_cobrado: number
  frete_pago: number
  valor_total_cobrado: number
  status: string
  data_pedido: string
  data_entrega: string | null
  total_recebido: number
}

export interface DashboardStats {
  pedidosMes: number
  faturamentoBruto: number
  custosTotais: number
  pedidosFinalizadosMes: number
  pedidosEmProducao: number
  pedidosTotal: number
  totalRecebidoMes: number
  inadimplenciaTotal: number
}

// --- Dashboard stats ---

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
         COALESCE(SUM(valor_total_cobrado), 0) AS faturamento_bruto,
         COALESCE(SUM(
           custo_filamento + custo_insumos + custo_energia +
           valor_reserva_maquina + custo_embalagem + frete_pago
         ), 0) AS custos_totais
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
    .prepare('SELECT COUNT(*) AS cnt FROM pedidos WHERE tenant_id = ?')
    .get(TENANT_ID) as { cnt: number }

  const recebidoMesRow = db
    .prepare(
      `SELECT COALESCE(SUM(r.valor), 0) AS total
       FROM recebimentos r
       WHERE r.tenant_id = ?
         AND strftime('%Y-%m', r.data_recebimento) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as { total: number }

  const inadimplenciaRow = db
    .prepare(
      `SELECT COALESCE(SUM(
         p.valor_total_cobrado -
         COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0)
       ), 0) AS total
       FROM pedidos p
       WHERE p.tenant_id = ?
         AND p.status = 'Finalizado'
         AND p.valor_total_cobrado >
               COALESCE((SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0)`
    )
    .get(TENANT_ID) as { total: number }

  return {
    pedidosMes:        pedidosMesRow.pedidos_mes,
    faturamentoBruto:  financeiroMes.faturamento_bruto,
    custosTotais:      financeiroMes.custos_totais,
    pedidosFinalizadosMes: financeiroMes.pedidos_finalizados,
    pedidosEmProducao: emProducaoRow.cnt,
    pedidosTotal:      totalRow.cnt,
    totalRecebidoMes:  recebidoMesRow.total,
    inadimplenciaTotal: inadimplenciaRow.total,
  }
}

// --- Queries de leitura ---

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
         c.nome  AS cliente_nome,
         c.telefone AS cliente_telefone,
         COALESCE(
           (SELECT GROUP_CONCAT(f.material || ' ' || f.cor, ' · ')
            FROM pedido_filamentos pf
            JOIN filamentos f ON f.id = pf.filamento_id
            WHERE pf.pedido_id = p.id), 'sem filamento'
         ) AS materiais,
         COALESCE(
           (SELECT SUM(pf.peso_gasto_gramas)
            FROM pedido_filamentos pf
            WHERE pf.pedido_id = p.id), 0
         ) AS peso_total_gramas,
         p.tempo_impressao_horas,
         p.custo_filamento,
         p.custo_insumos,
         p.custo_energia,
         p.custo_embalagem,
         p.valor_reserva_maquina,
         p.taxa_operacional,
         p.desconto,
         p.frete_cobrado,
         p.frete_pago,
         p.valor_total_cobrado,
         p.status,
         p.data_pedido,
         p.data_entrega,
         COALESCE(
           (SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0
         ) AS total_recebido
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       WHERE p.tenant_id = ?
       ORDER BY p.data_pedido DESC
       LIMIT ?`
    )
    .all(TENANT_ID, limite) as PedidoResumo[]
}

// --- Tipos de entrada ---

export interface MaterialInput {
  filamento_id: number
  peso_gasto_gramas: number
}

export interface InsumoInput {
  insumo_id: number
  quantidade: number
}

export interface CriarPedidoInput {
  nome_da_peca: string
  cliente_id: number
  tempo_impressao_horas: number
  materials: MaterialInput[]
  insumos: InsumoInput[]
  custo_embalagem: number
  desconto: number
  frete_cobrado: number
  frete_pago: number
  data_entrega?: string
}

// --- Mutation: criar pedido ---

export async function criarPedido(data: CriarPedidoInput): Promise<ActionResult> {
  try {
    const {
      nome_da_peca,
      cliente_id,
      tempo_impressao_horas,
      materials,
      insumos,
      custo_embalagem,
      desconto,
      frete_cobrado,
      frete_pago,
      data_entrega,
    } = data

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
    if (!Array.isArray(insumos) || insumos.length > 20)
      return { success: false, message: 'Lista de insumos inválida.' }

    for (const valor of [custo_embalagem, desconto, frete_cobrado, frete_pago]) {
      if (!Number.isFinite(valor) || valor < 0 || valor > 1_000_000) {
        return { success: false, message: 'Custos, desconto ou frete inválidos.' }
      }
    }
    if (data_entrega && !/^\d{4}-\d{2}-\d{2}$/.test(data_entrega)) {
      return { success: false, message: 'Data de entrega inválida.' }
    }

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

    const quantidadesPorInsumo = new Map<number, number>()
    for (const insumo of insumos) {
      if (
        !Number.isSafeInteger(insumo.insumo_id) ||
        insumo.insumo_id <= 0 ||
        !Number.isFinite(insumo.quantidade) ||
        insumo.quantidade <= 0 ||
        insumo.quantidade > 100_000
      ) {
        return { success: false, message: 'Insumo ou quantidade inválida.' }
      }
      quantidadesPorInsumo.set(
        insumo.insumo_id,
        (quantidadesPorInsumo.get(insumo.insumo_id) ?? 0) + insumo.quantidade,
      )
    }
    const insumosValidos = Array.from(quantidadesPorInsumo, ([insumo_id, quantidade]) => ({
      insumo_id,
      quantidade,
    }))

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

    const insumosMap = new Map<number, { nome: string; custo_unitario: number }>()
    for (const i of insumosValidos) {
      const ins = db
        .prepare('SELECT nome, custo_unitario FROM insumos WHERE id = ? AND tenant_id = ? AND ativo = 1')
        .get(i.insumo_id, TENANT_ID) as { nome: string; custo_unitario: number } | undefined
      if (!ins) return { success: false, message: `Insumo ID ${i.insumo_id} inválido.` }
      insumosMap.set(i.insumo_id, ins)
    }

    const configuracao = db
      .prepare(
        `SELECT taxa_operacional, custo_hora_maquina, tarifa_energia_kwh, potencia_impressora_w
         FROM tenants WHERE id = ? AND ativo = 1`,
      )
      .get(TENANT_ID) as {
        taxa_operacional: number
        custo_hora_maquina: number
        tarifa_energia_kwh: number
        potencia_impressora_w: number
      } | undefined
    if (!configuracao) return { success: false, message: 'Configuração da empresa não encontrada.' }

    const totaisBasicos = calcularOrcamento({
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
    const custoInsumos = arredondarMoeda(insumosValidos.reduce((total, item) => {
      return total + item.quantidade * insumosMap.get(item.insumo_id)!.custo_unitario
    }, 0))
    const custoEnergia = arredondarMoeda(
      (configuracao.potencia_impressora_w / 1000) *
      tempo_impressao_horas *
      configuracao.tarifa_energia_kwh,
    )
    const embalagem = arredondarMoeda(custo_embalagem)
    const descontoValidado = arredondarMoeda(desconto)
    const freteCobrado = arredondarMoeda(frete_cobrado)
    const fretePago = arredondarMoeda(frete_pago)
    const subtotal = arredondarMoeda(
      totaisBasicos.total + custoInsumos + custoEnergia + embalagem + freteCobrado,
    )
    if (descontoValidado > subtotal) {
      return { success: false, message: 'O desconto não pode ser maior que o valor do orçamento.' }
    }
    const valorTotal = arredondarMoeda(subtotal - descontoValidado)

    const inserir = db.transaction(() => {
      // 1. Insere o pedido
      const pedidoResult = db
        .prepare(
          `INSERT INTO pedidos (
            tenant_id, usuario_id, cliente_id,
            nome_da_peca, tempo_impressao_horas,
            custo_filamento, custo_insumos, custo_energia,
            valor_reserva_maquina, taxa_operacional, custo_embalagem,
            desconto, frete_cobrado, frete_pago,
            valor_total_cobrado, data_entrega,
            status
          ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Fila')`
        )
        .run(
          TENANT_ID,
          cliente_id,
          nome_da_peca.trim(),
          tempo_impressao_horas,
          totaisBasicos.materialCost,
          custoInsumos,
          custoEnergia,
          totaisBasicos.machineReserve,
          totaisBasicos.operationalFee,
          embalagem,
          descontoValidado,
          freteCobrado,
          fretePago,
          valorTotal,
          data_entrega ?? null,
        )

      const pedidoId = pedidoResult.lastInsertRowid as number

      // 2. Insere cada filamento
      const stmtPF = db.prepare(
        `INSERT INTO pedido_filamentos (pedido_id, filamento_id, peso_gasto_gramas, custo_calculado)
         VALUES (?, ?, ?, ?)`
      )

      for (const m of materialsValidos) {
        const fil = filamentosMap.get(m.filamento_id)!
        const custoItem = arredondarMoeda(m.peso_gasto_gramas * (fil.preco_rolo / fil.peso_rolo_gramas))
        stmtPF.run(pedidoId, m.filamento_id, m.peso_gasto_gramas, custoItem)
      }

      // 3. Insere cada insumo com snapshot do custo unitario
      const stmtPI = db.prepare(
        `INSERT INTO pedido_insumos (pedido_id, insumo_id, quantidade, custo_unitario_snap, custo_calculado)
         VALUES (?, ?, ?, ?, ?)`
      )

      for (const i of insumosValidos) {
        const ins = insumosMap.get(i.insumo_id)!
        const custoCalc = arredondarMoeda(i.quantidade * ins.custo_unitario)
        stmtPI.run(pedidoId, i.insumo_id, i.quantidade, ins.custo_unitario, custoCalc)
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
      valorTotal,
    }
  } catch (err) {
    console.error('[criarPedido]', err)
    return { success: false, message: 'Erro interno ao salvar. Tente novamente.' }
  }
}

// --- Kanban (Producao) ---

export async function getPedidosKanban(): Promise<PedidoResumo[]> {
  return db
    .prepare(
      `SELECT
         p.id,
         p.nome_da_peca,
         c.nome  AS cliente_nome,
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
         p.custo_insumos,
         p.custo_energia,
         p.custo_embalagem,
         p.valor_reserva_maquina,
         p.taxa_operacional,
         p.desconto,
         p.frete_cobrado,
         p.frete_pago,
         p.valor_total_cobrado,
         p.status,
         p.data_pedido,
         p.data_entrega,
         COALESCE(
           (SELECT SUM(r.valor) FROM recebimentos r WHERE r.pedido_id = p.id), 0
         ) AS total_recebido
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
               SUM(pf.peso_gasto_gramas) AS quantidade,
               f.material || ' ' || f.cor AS nome,
               COALESCE(f.estoque_gramas, f.peso_rolo_gramas) AS estoque
             FROM pedido_filamentos pf
             JOIN filamentos f ON f.id = pf.filamento_id AND f.tenant_id = ?
             WHERE pf.pedido_id = ?
             GROUP BY pf.filamento_id, f.material, f.cor, f.estoque_gramas, f.peso_rolo_gramas`,
          )
          .all(TENANT_ID, pedidoId) as {
            filamento_id: number
            quantidade: number
            nome: string
            estoque: number
          }[]

        const insumosDoPedido = db
          .prepare(
            `SELECT
               pi.insumo_id,
               SUM(pi.quantidade) AS quantidade,
               i.nome,
               i.estoque_atual AS estoque
             FROM pedido_insumos pi
             JOIN insumos i ON i.id = pi.insumo_id AND i.tenant_id = ?
             WHERE pi.pedido_id = ?
             GROUP BY pi.insumo_id, i.nome, i.estoque_atual`,
          )
          .all(TENANT_ID, pedidoId) as {
            insumo_id: number
            quantidade: number
            nome: string
            estoque: number
          }[]

        for (const item of [...filamentosDoPedido, ...insumosDoPedido]) {
          if (item.estoque < item.quantidade) {
            throw new Error(`INSUFFICIENT_STOCK:${item.nome}`)
          }
        }

        const baixarFilamento = db.prepare(
          `UPDATE filamentos
           SET estoque_gramas = COALESCE(estoque_gramas, peso_rolo_gramas) - ?
           WHERE id = ? AND tenant_id = ?
             AND COALESCE(estoque_gramas, peso_rolo_gramas) >= ?`,
        )

        for (const item of filamentosDoPedido) {
          const baixa = baixarFilamento.run(
            item.quantidade,
            item.filamento_id,
            TENANT_ID,
            item.quantidade,
          )
          if (baixa.changes !== 1) throw new Error('STOCK_CHANGED')
        }

        const baixarInsumo = db.prepare(
          `UPDATE insumos
           SET estoque_atual = estoque_atual - ?
           WHERE id = ? AND tenant_id = ? AND estoque_atual >= ?`,
        )

        for (const item of insumosDoPedido) {
          const baixa = baixarInsumo.run(
            item.quantidade,
            item.insumo_id,
            TENANT_ID,
            item.quantidade,
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
