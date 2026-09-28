'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularTotalCompra, precoUnitarioEstoque, ratearCompraPorCategoria } from '@/lib/compras.mjs'
import { gerarParcelas } from '@/lib/financeiro.mjs'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export type TipoItemCompra = 'Filamento' | 'Insumo'
export type StatusCompra = 'Pedido' | 'Recebido' | 'Cancelado'

export interface FornecedorCompra {
  id: number
  nome: string
  documento: string | null
  telefone: string | null
  email: string | null
  site: string | null
  observacoes: string | null
}

export interface ItemCatalogoCompra {
  tipo_item: TipoItemCompra
  item_id: number
  nome: string
  unidade: string
  volume_padrao: number
  preco_referencia: number
}

export interface CompraResumo {
  id: number
  numero: string
  fornecedor_nome: string
  status: StatusCompra
  pedido_em: string
  previsao_entrega: string | null
  recebido_em: string | null
  forma_pagamento: string
  parcelas: number
  vencimento_em: string
  pago_em: string | null
  frete: number
  desconto: number
  subtotal: number
  total: number
  itens: number
  descricao_itens: string
}

export interface HistoricoPrecoCompra {
  tipo_item: TipoItemCompra
  item_id: number
  item_nome: string
  fornecedor_nome: string
  ultima_compra: string
  preco_ultimo_volume: number
  preco_medio_volume: number
  menor_preco_volume: number
  unidade: string
  compras: number
}

export interface ComprasDados {
  fornecedores: FornecedorCompra[]
  catalogo: ItemCatalogoCompra[]
  compras: CompraResumo[]
  historicoPrecos: HistoricoPrecoCompra[]
  resumo: { emAberto: number; valorEmAberto: number; recebidoMes: number; fornecedores: number }
}

export interface ItemCompraInput {
  tipoItem: TipoItemCompra
  itemId: number
  quantidadeVolumes: number
  quantidadeEstoque: number
  valorTotal: number
}

export interface CompraInput {
  fornecedorId: number
  pedidoEm: string
  previsaoEntrega: string | null
  frete: number
  desconto: number
  formaPagamento: string
  parcelas: number
  vencimentoEm: string
  pagoEm: string | null
  observacoes: string
  itens: ItemCompraInput[]
}

type ActionResult = { success: boolean; message: string }

function revalidarCompras() {
  revalidatePath('/compras')
  revalidatePath('/estoque')
  revalidatePath('/filamentos')
  revalidatePath('/insumos')
  revalidatePath('/financeiro')
  revalidatePath('/')
}

function validarItem(item: ItemCompraInput) {
  return ['Filamento', 'Insumo'].includes(item.tipoItem) && Number.isSafeInteger(item.itemId) && item.itemId > 0 &&
    [item.quantidadeVolumes, item.quantidadeEstoque, item.valorTotal].every(Number.isFinite) &&
    item.quantidadeVolumes > 0 && item.quantidadeVolumes <= 1_000_000 &&
    item.quantidadeEstoque > 0 && item.quantidadeEstoque <= 1_000_000_000 &&
    item.valorTotal > 0 && item.valorTotal <= 10_000_000
}

export async function getComprasDados(): Promise<ComprasDados> {
  const fornecedores = db.prepare(`
    SELECT id, nome, documento, telefone, email, site, observacoes
    FROM fornecedores WHERE tenant_id = ? AND ativo = 1 ORDER BY nome
  `).all(TENANT_ID) as FornecedorCompra[]

  const catalogo = db.prepare(`
    SELECT 'Filamento' AS tipo_item, id AS item_id, material || ' ' || cor AS nome,
      'g' AS unidade, peso_rolo_gramas AS volume_padrao, preco_rolo AS preco_referencia
    FROM filamentos WHERE tenant_id = ? AND ativo = 1
    UNION ALL
    SELECT 'Insumo', id, nome, unidade, 1, custo_unitario
    FROM insumos WHERE tenant_id = ? AND ativo = 1
    ORDER BY tipo_item, nome
  `).all(TENANT_ID, TENANT_ID) as ItemCatalogoCompra[]

  const compras = db.prepare(`
    SELECT c.id, c.numero, f.nome AS fornecedor_nome, c.status, c.pedido_em,
      c.previsao_entrega, c.recebido_em, c.forma_pagamento, c.vencimento_em,
      c.pago_em, c.parcelas, c.frete, c.desconto,
      ROUND(SUM(ci.valor_total), 2) AS subtotal,
      ROUND(SUM(ci.valor_total) + c.frete - c.desconto, 2) AS total,
      COUNT(ci.id) AS itens,
      GROUP_CONCAT(
        CASE ci.tipo_item WHEN 'Filamento' THEN
          (SELECT material || ' ' || cor FROM filamentos WHERE id = ci.item_id)
        ELSE (SELECT nome FROM insumos WHERE id = ci.item_id) END,
        ', '
      ) AS descricao_itens
    FROM compras c
    JOIN fornecedores f ON f.id = c.fornecedor_id
    JOIN compra_itens ci ON ci.compra_id = c.id
    WHERE c.tenant_id = ?
    GROUP BY c.id
    ORDER BY CASE c.status WHEN 'Pedido' THEN 0 WHEN 'Recebido' THEN 1 ELSE 2 END,
      c.pedido_em DESC, c.id DESC
    LIMIT 100
  `).all(TENANT_ID) as CompraResumo[]

  const historicoPrecos = db.prepare(`
    WITH historico AS (
      SELECT ci.tipo_item, ci.item_id, f.nome AS fornecedor_nome,
        c.recebido_em, ci.valor_total / ci.quantidade_volumes AS preco_volume,
        CASE ci.tipo_item WHEN 'Filamento' THEN
          (SELECT material || ' ' || cor FROM filamentos WHERE id = ci.item_id)
        ELSE (SELECT nome FROM insumos WHERE id = ci.item_id) END AS item_nome,
        CASE ci.tipo_item WHEN 'Filamento' THEN 'rolo'
        ELSE COALESCE((SELECT unidade FROM insumos WHERE id = ci.item_id), 'unid') END AS unidade
      FROM compra_itens ci
      JOIN compras c ON c.id = ci.compra_id
      JOIN fornecedores f ON f.id = c.fornecedor_id
      WHERE c.tenant_id = ? AND c.status = 'Recebido'
    )
    SELECT tipo_item, item_id, item_nome, fornecedor_nome, MAX(recebido_em) AS ultima_compra,
      (SELECT h2.preco_volume FROM historico h2
       WHERE h2.tipo_item = h.tipo_item AND h2.item_id = h.item_id
         AND h2.fornecedor_nome = h.fornecedor_nome
       ORDER BY h2.recebido_em DESC LIMIT 1) AS preco_ultimo_volume,
      ROUND(AVG(preco_volume), 2) AS preco_medio_volume,
      ROUND(MIN(preco_volume), 2) AS menor_preco_volume,
      unidade, COUNT(*) AS compras
    FROM historico h
    GROUP BY tipo_item, item_id, fornecedor_nome
    ORDER BY item_nome, preco_ultimo_volume
  `).all(TENANT_ID) as HistoricoPrecoCompra[]

  const resumo = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'Pedido' THEN 1 END) AS emAberto,
      COALESCE(SUM(CASE WHEN status = 'Pedido' THEN
        (SELECT SUM(valor_total) FROM compra_itens WHERE compra_id = compras.id) + frete - desconto ELSE 0 END), 0) AS valorEmAberto,
      COALESCE(SUM(CASE WHEN status = 'Recebido' AND strftime('%Y-%m', recebido_em) = strftime('%Y-%m', 'now') THEN
        (SELECT SUM(valor_total) FROM compra_itens WHERE compra_id = compras.id) + frete - desconto ELSE 0 END), 0) AS recebidoMes,
      (SELECT COUNT(*) FROM fornecedores WHERE tenant_id = ? AND ativo = 1) AS fornecedores
    FROM compras WHERE tenant_id = ?
  `).get(TENANT_ID, TENANT_ID) as ComprasDados['resumo']

  return { fornecedores, catalogo, compras, historicoPrecos, resumo }
}

export async function salvarFornecedor(
  id: number | null,
  data: Omit<FornecedorCompra, 'id'>,
): Promise<ActionResult> {
  try {
    const nome = data.nome.trim()
    if (!nome || nome.length > 120) return { success: false, message: 'Informe um nome válido para o fornecedor.' }
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) return { success: false, message: 'E-mail do fornecedor inválido.' }
    if (data.site && data.site.length > 300) return { success: false, message: 'Endereço do site muito longo.' }
    let fornecedorId = id
    if (id === null) {
      const result = db.prepare(`INSERT INTO fornecedores
        (tenant_id, usuario_id, nome, documento, telefone, email, site, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(TENANT_ID, USUARIO_ID, nome, data.documento?.trim() || null, data.telefone?.trim() || null,
          data.email?.trim() || null, data.site?.trim() || null, data.observacoes?.trim() || null)
      fornecedorId = Number(result.lastInsertRowid)
    } else {
      const result = db.prepare(`UPDATE fornecedores SET nome = ?, documento = ?, telefone = ?,
        email = ?, site = ?, observacoes = ? WHERE id = ? AND tenant_id = ? AND ativo = 1`)
        .run(nome, data.documento?.trim() || null, data.telefone?.trim() || null, data.email?.trim() || null,
          data.site?.trim() || null, data.observacoes?.trim() || null, id, TENANT_ID)
      if (result.changes !== 1) return { success: false, message: 'Fornecedor não encontrado.' }
    }
    registrarAuditoria(db, { entidade: 'Fornecedor', entidadeId: fornecedorId, acao: id ? 'ATUALIZAR' : 'CRIAR', descricao: nome })
    revalidatePath('/compras')
    return { success: true, message: id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.' }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, message: 'Já existe um fornecedor com esse nome.' }
    }
    console.error('[salvarFornecedor]', error)
    return { success: false, message: 'Erro interno ao salvar fornecedor.' }
  }
}

export async function arquivarFornecedor(id: number): Promise<ActionResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, message: 'Fornecedor inválido.' }
  const aberto = db.prepare(`SELECT 1 FROM compras WHERE tenant_id = ? AND fornecedor_id = ? AND status = 'Pedido' LIMIT 1`)
    .get(TENANT_ID, id)
  if (aberto) return { success: false, message: 'Cancele ou receba as compras abertas antes de arquivar.' }
  const result = db.prepare('UPDATE fornecedores SET ativo = 0 WHERE id = ? AND tenant_id = ? AND ativo = 1').run(id, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Fornecedor não encontrado.' }
  revalidatePath('/compras')
  return { success: true, message: 'Fornecedor arquivado; o histórico foi preservado.' }
}

export async function criarCompra(data: CompraInput): Promise<ActionResult> {
  try {
    if (!Number.isSafeInteger(data.fornecedorId) || data.fornecedorId <= 0) return { success: false, message: 'Selecione um fornecedor.' }
    if (!DATA_RE.test(data.pedidoEm) || !DATA_RE.test(data.vencimentoEm) ||
        (data.previsaoEntrega !== null && !DATA_RE.test(data.previsaoEntrega)) ||
        (data.pagoEm !== null && !DATA_RE.test(data.pagoEm))) return { success: false, message: 'Revise as datas da compra.' }
    if (!data.formaPagamento.trim() || data.formaPagamento.length > 80) return { success: false, message: 'Informe a forma de pagamento.' }
    if (!Number.isSafeInteger(data.parcelas) || data.parcelas < 1 || data.parcelas > 120) return { success: false, message: 'Quantidade de parcelas inválida.' }
    if (!data.itens.length || data.itens.length > 100 || !data.itens.every(validarItem)) return { success: false, message: 'Inclua ao menos um item com quantidades e valor válidos.' }
    calcularTotalCompra(data.itens, data.frete, data.desconto)

    let compraId = 0
    const criar = db.transaction(() => {
      const fornecedor = db.prepare('SELECT id FROM fornecedores WHERE id = ? AND tenant_id = ? AND ativo = 1')
        .get(data.fornecedorId, TENANT_ID)
      if (!fornecedor) throw new Error('FORNECEDOR_INVALIDO')
      for (const item of data.itens) {
        const tabela = item.tipoItem === 'Filamento' ? 'filamentos' : 'insumos'
        const existe = db.prepare(`SELECT id FROM ${tabela} WHERE id = ? AND tenant_id = ? AND ativo = 1`).get(item.itemId, TENANT_ID)
        if (!existe) throw new Error('ITEM_INVALIDO')
      }
      const sequencia = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM compras WHERE tenant_id = ?')
        .get(TENANT_ID) as { proximo: number }).proximo
      const numero = `CMP-${data.pedidoEm.slice(0, 4)}-${String(sequencia).padStart(6, '0')}`
      const result = db.prepare(`INSERT INTO compras (
        tenant_id, usuario_id, fornecedor_id, numero, pedido_em, previsao_entrega,
        frete, desconto, forma_pagamento, parcelas, vencimento_em, pago_em, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(TENANT_ID, USUARIO_ID, data.fornecedorId, numero, data.pedidoEm, data.previsaoEntrega,
          data.frete, data.desconto, data.formaPagamento.trim(), data.parcelas, data.vencimentoEm, data.pagoEm, data.observacoes.trim() || null)
      compraId = Number(result.lastInsertRowid)
      const inserirItem = db.prepare(`INSERT INTO compra_itens
        (compra_id, tipo_item, item_id, quantidade_volumes, quantidade_estoque, valor_total)
        VALUES (?, ?, ?, ?, ?, ?)`)
      for (const item of data.itens) inserirItem.run(compraId, item.tipoItem, item.itemId, item.quantidadeVolumes, item.quantidadeEstoque, item.valorTotal)
      registrarAuditoria(db, { entidade: 'Compra', entidadeId: compraId, acao: 'CRIAR', descricao: numero,
        detalhes: { fornecedorId: data.fornecedorId, itens: data.itens.length } })
    })
    criar.immediate()
    revalidarCompras()
    return { success: true, message: `Pedido de compra criado com ${data.itens.length} item(ns).` }
  } catch (error) {
    if (error instanceof Error && error.message === 'FORNECEDOR_INVALIDO') return { success: false, message: 'Fornecedor não encontrado.' }
    if (error instanceof Error && error.message === 'ITEM_INVALIDO') return { success: false, message: 'Um dos itens não está mais disponível.' }
    if (error instanceof Error && error.message === 'TOTAL_INVALIDO') return { success: false, message: 'Subtotal, frete ou desconto inválido.' }
    console.error('[criarCompra]', error)
    return { success: false, message: 'Erro interno ao criar a compra.' }
  }
}

export async function receberCompra(id: number, recebidoEm: string): Promise<ActionResult> {
  try {
    if (!Number.isSafeInteger(id) || id <= 0 || !DATA_RE.test(recebidoEm)) return { success: false, message: 'Compra ou data de recebimento inválida.' }
    const receber = db.transaction(() => {
      const compra = db.prepare(`SELECT c.*, f.nome AS fornecedor_nome FROM compras c
        JOIN fornecedores f ON f.id = c.fornecedor_id WHERE c.id = ? AND c.tenant_id = ?`).get(id, TENANT_ID) as
        ({ numero: string; status: StatusCompra; fornecedor_nome: string; frete: number; desconto: number;
          pedido_em: string; vencimento_em: string; pago_em: string | null; forma_pagamento: string; parcelas: number } | undefined)
      if (!compra) throw new Error('NOT_FOUND')
      if (compra.status !== 'Pedido') throw new Error('STATUS_INVALIDO')
      const itens = db.prepare('SELECT * FROM compra_itens WHERE compra_id = ? ORDER BY id').all(id) as Array<{
        id: number; tipo_item: TipoItemCompra; item_id: number; quantidade_volumes: number;
        quantidade_estoque: number; valor_total: number
      }>
      if (!itens.length) throw new Error('SEM_ITENS')

      for (const item of itens) {
        if (item.tipo_item === 'Filamento') {
          const filamento = db.prepare(`SELECT COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo
            FROM filamentos WHERE id = ? AND tenant_id = ? AND ativo = 1`).get(item.item_id, TENANT_ID) as { saldo: number } | undefined
          if (!filamento) throw new Error('ITEM_INVALIDO')
          const saldoPosterior = filamento.saldo + item.quantidade_estoque
          const precoRolo = item.valor_total / item.quantidade_volumes
          const lote = db.prepare(`INSERT INTO lotes_filamento (
            tenant_id, filamento_id, codigo, peso_inicial_gramas, saldo_gramas, preco_compra, aberto_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(TENANT_ID, item.item_id, `${compra.numero}-FIL-${item.item_id}`, item.quantidade_estoque,
              item.quantidade_estoque, precoRolo, recebidoEm)
          db.prepare('UPDATE filamentos SET estoque_gramas = ?, preco_rolo = ?, fornecedor = ? WHERE id = ? AND tenant_id = ?')
            .run(saldoPosterior, precoRolo, compra.fornecedor_nome, item.item_id, TENANT_ID)
          db.prepare(`INSERT INTO movimentos_estoque (
            tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id, tipo,
            quantidade, saldo_anterior, saldo_posterior, motivo
          ) VALUES (?, ?, 'Filamento', ?, ?, 'Entrada', ?, ?, ?, ?)`)
            .run(TENANT_ID, USUARIO_ID, item.item_id, Number(lote.lastInsertRowid), item.quantidade_estoque,
              filamento.saldo, saldoPosterior, `Recebimento da compra ${compra.numero}`)
        } else {
          const insumo = db.prepare('SELECT estoque_atual FROM insumos WHERE id = ? AND tenant_id = ? AND ativo = 1')
            .get(item.item_id, TENANT_ID) as { estoque_atual: number } | undefined
          if (!insumo) throw new Error('ITEM_INVALIDO')
          const saldoPosterior = insumo.estoque_atual + item.quantidade_estoque
          db.prepare('UPDATE insumos SET estoque_atual = ?, custo_unitario = ? WHERE id = ? AND tenant_id = ?')
            .run(saldoPosterior, precoUnitarioEstoque(item.valor_total, item.quantidade_estoque), item.item_id, TENANT_ID)
          db.prepare(`INSERT INTO movimentos_estoque (
            tenant_id, usuario_id, tipo_item, item_id, tipo, quantidade,
            saldo_anterior, saldo_posterior, motivo
          ) VALUES (?, ?, 'Insumo', ?, 'Entrada', ?, ?, ?, ?)`)
            .run(TENANT_ID, USUARIO_ID, item.item_id, item.quantidade_estoque, insumo.estoque_atual,
              saldoPosterior, `Recebimento da compra ${compra.numero}`)
        }
      }

      const rateio = ratearCompraPorCategoria(itens.map(item => ({
        tipoItem: item.tipo_item, valorTotal: item.valor_total,
      })), compra.frete, compra.desconto)
      const inserirDespesa = db.prepare(`INSERT INTO despesas (
        tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
        competencia_em, vencimento_em, pago_em, forma_pagamento, fornecedor,
        tipo_origem, status_origem, compra_id, grupo_parcelamento, numero_parcela, total_parcelas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Compra', ?, ?, ?, ?, ?)`)
      for (const grupo of rateio) {
        const grupoParcelamento = compra.parcelas > 1 ? randomUUID() : null
        for (const parcela of gerarParcelas(grupo.valor, compra.parcelas, compra.vencimento_em)) {
          inserirDespesa.run(TENANT_ID, USUARIO_ID, grupo.categoria,
            `${compra.numero} · ${compra.fornecedor_nome}${compra.parcelas > 1 ? ` · ${parcela.numero}/${compra.parcelas}` : ''}`,
            parcela.valor, compra.pedido_em, compra.pedido_em, parcela.vencimentoEm, compra.pago_em,
            compra.forma_pagamento, compra.fornecedor_nome, compra.pago_em ? 'Pago' : 'Pendente', id,
            grupoParcelamento, parcela.numero, compra.parcelas)
        }
      }
      db.prepare(`UPDATE compras SET status = 'Recebido', recebido_em = ? WHERE id = ? AND tenant_id = ?`)
        .run(recebidoEm, id, TENANT_ID)
      registrarAuditoria(db, { entidade: 'Compra', entidadeId: id, acao: 'RECEBER', descricao: compra.numero,
        detalhes: { recebidoEm, itens: itens.length, despesas: rateio } })
    })
    receber.immediate()
    revalidarCompras()
    return { success: true, message: 'Compra recebida: estoque e despesas atualizados automaticamente.' }
  } catch (error) {
    const mensagens: Record<string, string> = {
      NOT_FOUND: 'Compra não encontrada.', STATUS_INVALIDO: 'A compra já foi recebida ou cancelada.',
      SEM_ITENS: 'A compra não possui itens.', ITEM_INVALIDO: 'Um item da compra não está mais disponível.',
    }
    if (error instanceof Error && mensagens[error.message]) return { success: false, message: mensagens[error.message] }
    console.error('[receberCompra]', error)
    return { success: false, message: 'Erro interno ao receber a compra; nenhuma alteração foi gravada.' }
  }
}

export async function cancelarCompra(id: number): Promise<ActionResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, message: 'Compra inválida.' }
  const result = db.prepare(`UPDATE compras SET status = 'Cancelado' WHERE id = ? AND tenant_id = ? AND status = 'Pedido'`)
    .run(id, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Somente compras abertas podem ser canceladas.' }
  registrarAuditoria(db, { entidade: 'Compra', entidadeId: id, acao: 'CANCELAR', descricao: 'Pedido de compra cancelado' })
  revalidarCompras()
  return { success: true, message: 'Compra cancelada sem alterar o estoque.' }
}
