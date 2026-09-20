'use server'

/**
 * app/actions/pedidos.ts  -  v3
 * Server Actions para o modulo de pedidos (ERP completo).
 * Suporta: multiplos filamentos, insumos, custos detalhados,
 * desconto, frete, data de entrega, recebimentos e dashboard stats.
 */

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { arredondarMoeda, calcularPrecoPlanilha, calcularValorVenda, TIPOS_PEDIDO } from '@/lib/orcamento.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

function expirarOrcamentosVencidos() {
  const vencidos = db.prepare(`
    SELECT id FROM pedidos
    WHERE tenant_id = ? AND orcamento_status IN ('Rascunho', 'Enviado')
      AND validade_orcamento IS NOT NULL AND date(validade_orcamento) < date('now')
  `).all(TENANT_ID) as { id: number }[]
  if (vencidos.length === 0) return
  db.transaction(() => {
    const atualizar = db.prepare(`
      UPDATE pedidos SET orcamento_status = 'Expirado'
      WHERE id = ? AND tenant_id = ? AND orcamento_status IN ('Rascunho', 'Enviado')
    `)
    const historico = db.prepare(`
      INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
      VALUES (?, ?, 1, 'Status do orçamento', 'Validade encerrada automaticamente')
    `)
    for (const item of vencidos) {
      if (atualizar.run(item.id, TENANT_ID).changes === 1) historico.run(TENANT_ID, item.id)
    }
  })()
}

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
  numero_orcamento: string | null
  orcamento_status: string
  validade_orcamento: string | null
  vencimento_em: string | null
  parcelas: number
  impressora_nome: string | null
  inicio_previsto: string | null
  fim_previsto: string | null
  lucro_liquido: number
  margem_percentual: number
}

export interface PedidoParaDuplicar {
  origem_id: number
  origem_numero: string | null
  nome_da_peca: string
  quantidade: number
  tempo_impressao_horas: number
  custo_embalagem: number
  desconto: number
  frete_cobrado: number
  frete_pago: number
  parcelas: number
  condicao_pagamento: string | null
  valor_total_original: number
  preco_unitario_original: number
  tipo_venda: string | null
  impressora_id: number | null
  materiais: MaterialInput[]
  insumos: InsumoInput[]
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
  lucroLiquido: number
  margemMedia: number
  ticketMedio: number
  estoqueBaixo: number
  orcamentosPendentes: number
  pedidosAtrasados: number
}

// --- Dashboard stats ---

export async function getDashboardStats(): Promise<DashboardStats> {
  expirarOrcamentosVencidos()
  const pedidosMesRow = db
    .prepare(
      `SELECT COUNT(*) AS pedidos_mes
       FROM pedidos
       WHERE tenant_id = ?
         AND status != 'Cancelado'
         AND orcamento_status = 'Aprovado'
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
           valor_reserva_maquina + taxa_operacional + custo_embalagem + frete_pago + taxas_comissoes
         ), 0) AS custos_totais
       FROM pedidos
       WHERE tenant_id = ?
         AND status = 'Finalizado'
         AND orcamento_status = 'Aprovado'
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
       WHERE tenant_id = ? AND orcamento_status = 'Aprovado'
         AND status IN ('Fila', 'Imprimindo', 'Acabamento')`
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
         AND r.estornado_em IS NULL
         AND strftime('%Y-%m', r.data_recebimento) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as { total: number }

  const inadimplenciaRow = db
    .prepare(
      `SELECT COALESCE(SUM(
         p.valor_total_cobrado -
         COALESCE((SELECT SUM(r.valor) FROM recebimentos r
           WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)
       ), 0) AS total
       FROM pedidos p
       WHERE p.tenant_id = ?
         AND p.status != 'Cancelado'
         AND p.orcamento_status = 'Aprovado'
         AND p.valor_total_cobrado >
               COALESCE((SELECT SUM(r.valor) FROM recebimentos r
                 WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)`
    )
    .get(TENANT_ID) as { total: number }

  const operacaoRow = db.prepare(`
    SELECT
      COALESCE(SUM(valor_total_cobrado - (
        custo_filamento + custo_insumos + custo_energia + valor_reserva_maquina +
        taxa_operacional + custo_embalagem + frete_pago + taxas_comissoes + custo_extra_real
      )), 0) AS lucro_liquido,
      COALESCE(AVG(CASE WHEN valor_total_cobrado > 0 THEN
        ((valor_total_cobrado - (
          custo_filamento + custo_insumos + custo_energia + valor_reserva_maquina +
          taxa_operacional + custo_embalagem + frete_pago + taxas_comissoes + custo_extra_real
        )) / valor_total_cobrado) * 100 END), 0) AS margem_media
    FROM pedidos
    WHERE tenant_id = ? AND status = 'Finalizado'
      AND strftime('%Y-%m', COALESCE(data_conclusao, data_pedido)) = strftime('%Y-%m', 'now')
  `).get(TENANT_ID) as { lucro_liquido: number; margem_media: number }

  const alertasRow = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM filamentos WHERE tenant_id = ? AND ativo = 1
        AND COALESCE(estoque_gramas, peso_rolo_gramas) <= 150) +
      (SELECT COUNT(*) FROM insumos WHERE tenant_id = ? AND ativo = 1
        AND estoque_minimo > 0 AND estoque_atual <= estoque_minimo) AS estoque_baixo,
      (SELECT COUNT(*) FROM pedidos WHERE tenant_id = ?
        AND orcamento_status IN ('Rascunho', 'Enviado')) AS orcamentos_pendentes,
      (SELECT COUNT(*) FROM pedidos WHERE tenant_id = ? AND status != 'Finalizado'
        AND status != 'Cancelado' AND data_entrega IS NOT NULL
        AND date(data_entrega) < date('now')) AS pedidos_atrasados
  `).get(TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID) as {
    estoque_baixo: number
    orcamentos_pendentes: number
    pedidos_atrasados: number
  }

  return {
    pedidosMes:        pedidosMesRow.pedidos_mes,
    faturamentoBruto:  financeiroMes.faturamento_bruto,
    custosTotais:      financeiroMes.custos_totais,
    pedidosFinalizadosMes: financeiroMes.pedidos_finalizados,
    pedidosEmProducao: emProducaoRow.cnt,
    pedidosTotal:      totalRow.cnt,
    totalRecebidoMes:  recebidoMesRow.total,
    inadimplenciaTotal: inadimplenciaRow.total,
    lucroLiquido: operacaoRow.lucro_liquido,
    margemMedia: operacaoRow.margem_media,
    ticketMedio: financeiroMes.pedidos_finalizados > 0
      ? financeiroMes.faturamento_bruto / financeiroMes.pedidos_finalizados
      : 0,
    estoqueBaixo: alertasRow.estoque_baixo,
    orcamentosPendentes: alertasRow.orcamentos_pendentes,
    pedidosAtrasados: alertasRow.pedidos_atrasados,
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
  expirarOrcamentosVencidos()
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
         p.numero_orcamento,
         p.orcamento_status,
         p.validade_orcamento,
         p.vencimento_em,
         p.parcelas,
         imp.nome AS impressora_nome,
         p.inicio_previsto,
         p.fim_previsto,
         p.valor_total_cobrado - (
           p.custo_filamento + p.custo_insumos + p.custo_energia +
           p.valor_reserva_maquina + p.taxa_operacional + p.custo_embalagem + p.frete_pago + p.taxas_comissoes + p.custo_extra_real
         ) AS lucro_liquido,
         CASE WHEN p.valor_total_cobrado > 0 THEN
           ((p.valor_total_cobrado - (
             p.custo_filamento + p.custo_insumos + p.custo_energia +
             p.valor_reserva_maquina + p.taxa_operacional + p.custo_embalagem + p.frete_pago + p.taxas_comissoes + p.custo_extra_real
           )) / p.valor_total_cobrado) * 100 ELSE 0 END AS margem_percentual,
         COALESCE(
           (SELECT SUM(r.valor) FROM recebimentos r
            WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0
         ) AS total_recebido
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       LEFT JOIN impressoras imp ON imp.id = p.impressora_id
       WHERE p.tenant_id = ?
       ORDER BY p.data_pedido DESC
       LIMIT ?`
    )
    .all(TENANT_ID, limite) as PedidoResumo[]
}

export async function getPedidoParaDuplicar(pedidoId: number): Promise<PedidoParaDuplicar | null> {
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) return null
  const pedido = db.prepare(`
    SELECT id AS origem_id, numero_orcamento AS origem_numero, nome_da_peca,
      quantidade, tempo_impressao_horas, custo_embalagem, desconto,
      frete_cobrado, frete_pago, parcelas, condicao_pagamento,
      tipo_venda, impressora_id,
      valor_total_cobrado AS valor_total_original,
      COALESCE(NULLIF(preco_unitario, 0),
        (valor_total_cobrado + desconto - frete_cobrado) / MAX(quantidade, 1)
      ) AS preco_unitario_original
    FROM pedidos WHERE id = ? AND tenant_id = ?
  `).get(pedidoId, TENANT_ID) as Omit<PedidoParaDuplicar, 'materiais' | 'insumos'> | undefined
  if (!pedido) return null

  const materiais = db.prepare(`
    SELECT pf.filamento_id, pf.peso_gasto_gramas
    FROM pedido_filamentos pf
    JOIN filamentos f ON f.id = pf.filamento_id
    WHERE pf.pedido_id = ? AND f.tenant_id = ? AND f.ativo = 1
    ORDER BY pf.id
  `).all(pedidoId, TENANT_ID) as MaterialInput[]
  const insumos = db.prepare(`
    SELECT pi.insumo_id, pi.quantidade
    FROM pedido_insumos pi
    JOIN insumos i ON i.id = pi.insumo_id
    WHERE pi.pedido_id = ? AND i.tenant_id = ? AND i.ativo = 1
    ORDER BY pi.id
  `).all(pedidoId, TENANT_ID) as InsumoInput[]

  return { ...pedido, materiais, insumos }
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
  quantidade?: number
  tipo_pedido: string
  materials: MaterialInput[]
  insumos: InsumoInput[]
  custo_embalagem: number
  desconto: number
  frete_cobrado: number
  frete_pago: number
  data_entrega?: string
  validade_orcamento?: string
  vencimento_em?: string
  parcelas?: number
  condicao_pagamento?: string
  pedido_origem_id?: number
  preco_unitario?: number
  materiais_avulsos_por_unidade: number
  horas_trabalho_ativo: number
  setup_projeto: number
  margem_perdas: number
  impressora_id?: number | null
}

// --- Mutation: criar pedido ---

export async function criarPedido(data: CriarPedidoInput): Promise<ActionResult> {
  try {
    const {
      nome_da_peca,
      cliente_id,
      tempo_impressao_horas,
      quantidade = 1,
      tipo_pedido,
      materials,
      insumos,
      custo_embalagem,
      desconto,
      frete_cobrado,
      frete_pago,
      data_entrega,
      validade_orcamento,
      vencimento_em,
      parcelas = 1,
      condicao_pagamento,
      pedido_origem_id,
      preco_unitario,
      materiais_avulsos_por_unidade,
      horas_trabalho_ativo,
      setup_projeto,
      margem_perdas,
      impressora_id = null,
    } = data

    if (typeof nome_da_peca !== 'string' || !nome_da_peca.trim())
      return { success: false, message: 'Informe o nome da peça.' }
    if (nome_da_peca.trim().length > 160)
      return { success: false, message: 'O nome da peça deve ter até 160 caracteres.' }
    if (!Number.isSafeInteger(cliente_id) || cliente_id <= 0)
      return { success: false, message: 'Selecione um cliente válido.' }
    if (!Number.isFinite(tempo_impressao_horas) || tempo_impressao_horas <= 0 || tempo_impressao_horas > 10_000)
      return { success: false, message: 'Tempo de impressão inválido.' }
    if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 100_000)
      return { success: false, message: 'Quantidade de peças inválida.' }
    if (!TIPOS_PEDIDO.includes(tipo_pedido))
      return { success: false, message: 'Tipo de pedido inválido.' }
    if (impressora_id !== null && (!Number.isSafeInteger(impressora_id) || impressora_id <= 0))
      return { success: false, message: 'Impressora inválida.' }
    if (preco_unitario !== undefined && (!Number.isFinite(preco_unitario) || preco_unitario <= 0 || preco_unitario > 1_000_000))
      return { success: false, message: 'Preço de venda unitário inválido.' }
    if (!Array.isArray(materials) || materials.length === 0 || materials.length > 8)
      return { success: false, message: 'Adicione de um a oito materiais.' }
    if (!Array.isArray(insumos) || insumos.length > 20)
      return { success: false, message: 'Lista de insumos inválida.' }

    for (const valor of [
      custo_embalagem, desconto, frete_cobrado, frete_pago,
      materiais_avulsos_por_unidade, horas_trabalho_ativo, setup_projeto,
    ]) {
      if (!Number.isFinite(valor) || valor < 0 || valor > 1_000_000) {
        return { success: false, message: 'Custos, desconto ou frete inválidos.' }
      }
    }
    if (!Number.isFinite(margem_perdas) || margem_perdas < 0 || margem_perdas > 1) {
      return { success: false, message: 'A margem para perdas deve ficar entre 0% e 100%.' }
    }
    if (data_entrega && !/^\d{4}-\d{2}-\d{2}$/.test(data_entrega)) {
      return { success: false, message: 'Data de entrega inválida.' }
    }
    for (const dataOpcional of [validade_orcamento, vencimento_em]) {
      if (dataOpcional && !/^\d{4}-\d{2}-\d{2}$/.test(dataOpcional)) {
        return { success: false, message: 'Data financeira ou validade inválida.' }
      }
    }
    if (!Number.isSafeInteger(parcelas) || parcelas < 1 || parcelas > 120) {
      return { success: false, message: 'Quantidade de parcelas inválida.' }
    }
    let origemNumero: string | null = null
    if (pedido_origem_id !== undefined) {
      if (!Number.isSafeInteger(pedido_origem_id) || pedido_origem_id <= 0) {
        return { success: false, message: 'Pedido de origem inválido.' }
      }
      const origem = db.prepare(`SELECT COALESCE(numero_orcamento, '#' || id) AS numero
        FROM pedidos WHERE id = ? AND tenant_id = ?`).get(pedido_origem_id, TENANT_ID) as { numero: string } | undefined
      if (!origem) return { success: false, message: 'Pedido de origem não encontrado.' }
      origemNumero = origem.numero
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
        `SELECT custo_hora_maquina, tarifa_energia_kwh, potencia_impressora_w,
                taxa_venda_padrao, valor_hora_trabalho, fator_b2c_personalizado,
                fator_b2b_piloto, fator_b2b_recorrente, pedido_minimo_b2b
         FROM tenants WHERE id = ? AND ativo = 1`,
      )
      .get(TENANT_ID) as {
        custo_hora_maquina: number
        tarifa_energia_kwh: number
        potencia_impressora_w: number
        taxa_venda_padrao: number
        valor_hora_trabalho: number
        fator_b2c_personalizado: number
        fator_b2b_piloto: number
        fator_b2b_recorrente: number
        pedido_minimo_b2b: number
      } | undefined
    if (!configuracao) return { success: false, message: 'Configuração da empresa não encontrada.' }

    const impressora = impressora_id === null ? null : db.prepare(`
      SELECT id, potencia_w, custo_hora FROM impressoras
      WHERE id = ? AND tenant_id = ? AND ativo = 1
    `).get(impressora_id, TENANT_ID) as { id: number; potencia_w: number; custo_hora: number } | undefined
    if (impressora_id !== null && !impressora) {
      return { success: false, message: 'Impressora não encontrada.' }
    }

    const custoInsumosBruto = insumosValidos.reduce((total, item) => {
      return total + item.quantidade * insumosMap.get(item.insumo_id)!.custo_unitario
    }, 0)
    const calculo = calcularPrecoPlanilha({
      tipoPedido: tipo_pedido,
      quantidade,
      tempoImpressaoHoras: tempo_impressao_horas,
      potenciaW: impressora?.potencia_w ?? configuracao.potencia_impressora_w,
      tarifaEnergiaKwh: configuracao.tarifa_energia_kwh,
      custoHoraMaquina: impressora && impressora.custo_hora > 0
        ? impressora.custo_hora
        : configuracao.custo_hora_maquina,
      materiais: materialsValidos.map((m) => {
        const filamento = filamentosMap.get(m.filamento_id)!
        return {
          pesoGramas: m.peso_gasto_gramas,
          custoPorGrama: filamento.preco_rolo / filamento.peso_rolo_gramas,
        }
      }),
      custoInsumos: custoInsumosBruto,
      materiaisAvulsosPorUnidade: materiais_avulsos_por_unidade,
      horasTrabalhoAtivo: horas_trabalho_ativo,
      valorHoraTrabalho: configuracao.valor_hora_trabalho,
      custoEmbalagem: custo_embalagem,
      fretePago: frete_pago,
      setupProjeto: setup_projeto,
      margemPerdas: margem_perdas,
      taxaVenda: configuracao.taxa_venda_padrao,
      fatorB2CPersonalizado: configuracao.fator_b2c_personalizado,
      fatorB2BPiloto: configuracao.fator_b2b_piloto,
      fatorB2BRecorrente: configuracao.fator_b2b_recorrente,
      pedidoMinimoB2B: configuracao.pedido_minimo_b2b,
    })
    const custoInsumos = arredondarMoeda(custoInsumosBruto)
    const embalagem = arredondarMoeda(custo_embalagem)
    const descontoValidado = arredondarMoeda(desconto)
    const freteCobrado = arredondarMoeda(frete_cobrado)
    const fretePago = arredondarMoeda(frete_pago)
    const precoUnitarioAplicado = preco_unitario ?? calculo.precoUnitarioArredondado
    let valorTotal: number
    try {
      valorTotal = calcularValorVenda({
        custoCalculado: calculo.totalArredondado,
        quantidade,
        precoUnitario: precoUnitarioAplicado,
        desconto: descontoValidado,
        freteCobrado,
      })
    } catch {
      return { success: false, message: 'O desconto não pode ser maior que o valor do orçamento.' }
    }
    const custosAdicionais = arredondarMoeda(
      calculo.reservaPerdas + calculo.materiaisAvulsos + calculo.maoObraAtiva + calculo.setupProjeto,
    )
    const taxasComissoes = arredondarMoeda(valorTotal * configuracao.taxa_venda_padrao)

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
            valor_total_cobrado, data_entrega, validade_orcamento, vencimento_em,
            parcelas, condicao_pagamento, quantidade, preco_unitario, tipo_venda, taxas_comissoes, impressora_id,
            orcamento_status, status
          ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Rascunho', 'Fila')`
        )
        .run(
          TENANT_ID,
          cliente_id,
          nome_da_peca.trim(),
          tempo_impressao_horas,
          calculo.filamentoSemPerdas,
          custoInsumos,
          calculo.energia,
          calculo.reservaMaquina,
          custosAdicionais,
          embalagem,
          descontoValidado,
          freteCobrado,
          fretePago,
          valorTotal,
          data_entrega ?? null,
          validade_orcamento ?? null,
          vencimento_em ?? null,
          parcelas,
          condicao_pagamento?.trim() || null,
          quantidade,
          precoUnitarioAplicado,
          tipo_pedido,
          taxasComissoes,
          impressora_id,
        )

      const pedidoId = pedidoResult.lastInsertRowid as number

      db.prepare(`
        UPDATE pedidos
        SET numero_orcamento = 'ORC-' || strftime('%Y', data_pedido) || '-' || printf('%06d', id)
        WHERE id = ? AND tenant_id = ?
      `).run(pedidoId, TENANT_ID)

      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, 1, 'Orcamento criado', ?)
      `).run(TENANT_ID, pedidoId, origemNumero ? `Orçamento duplicado de ${origemNumero} como rascunho` : 'Orçamento salvo como rascunho')

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

      registrarAuditoria(db, {
        entidade: 'Pedido', entidadeId: Number(pedidoId), acao: origemNumero ? 'DUPLICAR' : 'CRIAR',
        descricao: origemNumero ? `Duplicado de ${origemNumero}` : `Orçamento ${nome_da_peca.trim()} criado`,
        detalhes: pedido_origem_id ? { pedidoOrigemId: pedido_origem_id } : undefined,
      })

      return pedidoId
    })

    const pedidoId = inserir()

    revalidatePath('/')
    revalidatePath('/orcamentos')
    revalidatePath('/producao')

    return {
      success: true,
      message: `Orçamento "${nome_da_peca.trim()}" salvo como rascunho!`,
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
         p.numero_orcamento,
         p.orcamento_status,
         p.validade_orcamento,
         p.vencimento_em,
         p.parcelas,
         imp.nome AS impressora_nome,
         p.inicio_previsto,
         p.fim_previsto,
         p.valor_total_cobrado - (
           p.custo_filamento + p.custo_insumos + p.custo_energia +
           p.valor_reserva_maquina + p.taxa_operacional + p.custo_embalagem + p.frete_pago + p.taxas_comissoes + p.custo_extra_real
         ) AS lucro_liquido,
         CASE WHEN p.valor_total_cobrado > 0 THEN
           ((p.valor_total_cobrado - (
             p.custo_filamento + p.custo_insumos + p.custo_energia +
             p.valor_reserva_maquina + p.taxa_operacional + p.custo_embalagem + p.frete_pago + p.taxas_comissoes + p.custo_extra_real
           )) / p.valor_total_cobrado) * 100 ELSE 0 END AS margem_percentual,
         COALESCE(
           (SELECT SUM(r.valor) FROM recebimentos r
            WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0
         ) AS total_recebido
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       LEFT JOIN impressoras imp ON imp.id = p.impressora_id
       WHERE p.tenant_id = ?
         AND p.orcamento_status = 'Aprovado'
         AND p.status IN ('Fila', 'Imprimindo', 'Acabamento', 'Finalizado')
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
      Finalizado: ['Cancelado'],
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
        .prepare('SELECT status, orcamento_status FROM pedidos WHERE id = ? AND tenant_id = ?')
        .get(pedidoId, TENANT_ID) as { status: string; orcamento_status: string } | undefined

      if (!pedido) throw new Error('NOT_FOUND')
      if (pedido.orcamento_status !== 'Aprovado') throw new Error('NOT_APPROVED')
      if (pedido.status === novoStatus) return 'UNCHANGED'
      if (!transicoesPermitidas[pedido.status]?.includes(novoStatus)) {
        throw new Error('INVALID_TRANSITION')
      }

      if (novoStatus === 'Finalizado') {
        const filamentosDoPedido = db
          .prepare(
            `SELECT
               pf.filamento_id,
               SUM(COALESCE(pf.consumo_real_gramas, pf.peso_gasto_gramas)) AS quantidade,
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
               SUM(COALESCE(pi.consumo_real, pi.quantidade)) AS quantidade,
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
          if (item.quantidade <= 0) continue
          const saldoAnterior = item.estoque
          const lotes = db.prepare(`
            SELECT id, saldo_gramas FROM lotes_filamento
            WHERE tenant_id = ? AND filamento_id = ? AND ativo = 1 AND saldo_gramas > 0
            ORDER BY COALESCE(aberto_em, substr(criado_em, 1, 10)), id
          `).all(TENANT_ID, item.filamento_id) as { id: number; saldo_gramas: number }[]
          const saldoLotes = lotes.reduce((total, lote) => total + lote.saldo_gramas, 0)
          if (saldoLotes + 0.001 < item.quantidade) {
            throw new Error(`INSUFFICIENT_STOCK:${item.nome} (lotes)`)
          }
          const baixa = baixarFilamento.run(
            item.quantidade,
            item.filamento_id,
            TENANT_ID,
            item.quantidade,
          )
          if (baixa.changes !== 1) throw new Error('STOCK_CHANGED')
          let restante = item.quantidade
          let saldoCorrente = saldoAnterior
          const baixarLote = db.prepare(`
            UPDATE lotes_filamento SET saldo_gramas = saldo_gramas - ?
            WHERE id = ? AND tenant_id = ? AND saldo_gramas >= ?
          `)
          const movimentoLote = db.prepare(`
            INSERT INTO movimentos_estoque (
              tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id,
              pedido_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo
            ) VALUES (?, 1, 'Filamento', ?, ?, ?, 'Saida', ?, ?, ?, 'Consumo do pedido finalizado')
          `)
          for (const lote of lotes) {
            if (restante <= 0) break
            const quantidade = Math.min(restante, lote.saldo_gramas)
            if (baixarLote.run(quantidade, lote.id, TENANT_ID, quantidade).changes !== 1) {
              throw new Error('STOCK_CHANGED')
            }
            movimentoLote.run(
              TENANT_ID, item.filamento_id, lote.id, pedidoId, quantidade,
              saldoCorrente, saldoCorrente - quantidade,
            )
            saldoCorrente -= quantidade
            restante = Math.round((restante - quantidade) * 1000) / 1000
          }
        }

        const baixarInsumo = db.prepare(
          `UPDATE insumos
           SET estoque_atual = estoque_atual - ?
           WHERE id = ? AND tenant_id = ? AND estoque_atual >= ?`,
        )

        for (const item of insumosDoPedido) {
          if (item.quantidade <= 0) continue
          const saldoAnterior = item.estoque
          const baixa = baixarInsumo.run(
            item.quantidade,
            item.insumo_id,
            TENANT_ID,
            item.quantidade,
          )
          if (baixa.changes !== 1) throw new Error('STOCK_CHANGED')
          db.prepare(`
            INSERT INTO movimentos_estoque (
              tenant_id, usuario_id, tipo_item, item_id, pedido_id, tipo, quantidade,
              saldo_anterior, saldo_posterior, motivo
            ) VALUES (?, 1, 'Insumo', ?, ?, 'Saida', ?, ?, ?, 'Consumo do pedido finalizado')
          `).run(
            TENANT_ID, item.insumo_id, pedidoId, item.quantidade,
            saldoAnterior, saldoAnterior - item.quantidade,
          )
        }
      }

      if (pedido.status === 'Finalizado' && novoStatus === 'Cancelado') {
        const movimentos = db.prepare(`
          SELECT tipo_item, item_id, lote_filamento_id, SUM(quantidade) AS quantidade
          FROM movimentos_estoque
          WHERE pedido_id = ? AND tipo = 'Saida'
          GROUP BY tipo_item, item_id, lote_filamento_id
        `).all(pedidoId) as {
          tipo_item: 'Filamento' | 'Insumo'
          item_id: number
          lote_filamento_id: number | null
          quantidade: number
        }[]

        for (const movimento of movimentos) {
          const tabela = movimento.tipo_item === 'Filamento' ? 'filamentos' : 'insumos'
          const campo = movimento.tipo_item === 'Filamento' ? 'estoque_gramas' : 'estoque_atual'
          const fallback = movimento.tipo_item === 'Filamento'
            ? 'COALESCE(estoque_gramas, peso_rolo_gramas)'
            : 'estoque_atual'
          const row = db.prepare(`SELECT ${fallback} AS saldo FROM ${tabela} WHERE id = ? AND tenant_id = ?`)
            .get(movimento.item_id, TENANT_ID) as { saldo: number } | undefined
          if (!row) throw new Error('STOCK_CHANGED')
          const saldoPosterior = row.saldo + movimento.quantidade
          if (movimento.tipo_item === 'Filamento' && movimento.lote_filamento_id) {
            const loteAtualizado = db.prepare(`
              UPDATE lotes_filamento SET saldo_gramas = saldo_gramas + ?
              WHERE id = ? AND tenant_id = ? AND filamento_id = ?
            `).run(
              movimento.quantidade, movimento.lote_filamento_id,
              TENANT_ID, movimento.item_id,
            )
            if (loteAtualizado.changes !== 1) throw new Error('STOCK_CHANGED')
          }
          db.prepare(`UPDATE ${tabela} SET ${campo} = ? WHERE id = ? AND tenant_id = ?`)
            .run(saldoPosterior, movimento.item_id, TENANT_ID)
          db.prepare(`
            INSERT INTO movimentos_estoque (
              tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id,
              pedido_id, tipo, quantidade,
              saldo_anterior, saldo_posterior, motivo
            ) VALUES (?, 1, ?, ?, ?, ?, 'Reversao', ?, ?, ?, 'Estorno por cancelamento do pedido')
          `).run(
            TENANT_ID, movimento.tipo_item, movimento.item_id,
            movimento.lote_filamento_id, pedidoId,
            movimento.quantidade, row.saldo, saldoPosterior,
          )
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
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, 1, 'Status de produção', ?)
      `).run(TENANT_ID, pedidoId, `${pedido.status} → ${novoStatus}`)
      registrarAuditoria(db, {
        entidade: 'Pedido', entidadeId: pedidoId, acao: 'STATUS_PRODUCAO',
        descricao: `${pedido.status} → ${novoStatus}`,
      })
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
      if (message === 'NOT_APPROVED') {
        return { success: false, message: 'Aprove o orçamento antes de iniciar a produção.' }
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
    revalidatePath('/estoque')
    revalidatePath(`/pedidos/${pedidoId}`)
    return { success: true, message: `Status alterado para ${novoStatus}` }
  } catch (err) {
    console.error('[atualizarStatusPedido]', err)
    return { success: false, message: 'Erro interno ao atualizar status.' }
  }
}
