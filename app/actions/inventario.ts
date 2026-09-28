'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { codigoEstoque } from '@/lib/barcode.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface ItemInventario {
  id: number
  tipo_item: 'Filamento' | 'Insumo'
  item_id: number
  codigo_item: string
  nome: string
  unidade: string
  saldo_sistema: number
  saldo_contado: number | null
}

export interface InventarioAtual {
  id: number
  codigo: string
  descricao: string | null
  status: string
  iniciado_em: string
  itens: ItemInventario[]
}

export interface EtiquetaEstoque {
  tipo_item: 'Filamento' | 'Insumo'
  item_id: number
  codigo: string
  nome: string
  unidade: string
  saldo: number
}

export async function getInventario(): Promise<{ atual: InventarioAtual | null; etiquetas: EtiquetaEstoque[] }> {
  const cabecalho = db.prepare(`
    SELECT id, codigo, descricao, status, iniciado_em FROM inventarios
    WHERE tenant_id = ? AND status = 'Em contagem' ORDER BY id DESC LIMIT 1
  `).get(TENANT_ID) as Omit<InventarioAtual, 'itens'> | undefined
  let atual: InventarioAtual | null = null
  if (cabecalho) {
    const itens = db.prepare(`
      SELECT ii.id, ii.tipo_item, ii.item_id, ii.codigo_item,
        CASE WHEN ii.tipo_item = 'Filamento' THEN f.material || ' ' || f.cor ELSE i.nome END AS nome,
        CASE WHEN ii.tipo_item = 'Filamento' THEN 'g' ELSE i.unidade END AS unidade,
        ii.saldo_sistema, ii.saldo_contado
      FROM inventario_itens ii
      LEFT JOIN filamentos f ON ii.tipo_item = 'Filamento' AND f.id = ii.item_id
      LEFT JOIN insumos i ON ii.tipo_item = 'Insumo' AND i.id = ii.item_id
      WHERE ii.inventario_id = ? ORDER BY ii.tipo_item, nome
    `).all(cabecalho.id) as ItemInventario[]
    atual = { ...cabecalho, itens }
  }
  const itensEtiqueta = db.prepare(`
    SELECT 'Filamento' AS tipo_item, id AS item_id, material || ' ' || cor AS nome,
      'g' AS unidade, COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo
    FROM filamentos WHERE tenant_id = ? AND ativo = 1
    UNION ALL
    SELECT 'Insumo' AS tipo_item, id AS item_id, nome, unidade, estoque_atual AS saldo
    FROM insumos WHERE tenant_id = ? AND ativo = 1
    ORDER BY tipo_item, nome
  `).all(TENANT_ID, TENANT_ID) as Array<Omit<EtiquetaEstoque, 'codigo'>>
  const etiquetas = itensEtiqueta.map((item) => ({
    ...item, codigo: codigoEstoque(item.tipo_item, item.item_id),
  }))
  return { atual, etiquetas }
}

export async function iniciarInventario(descricao: string): Promise<{ success: boolean; message: string }> {
  try {
    if (descricao.trim().length > 200) return { success: false, message: 'Descrição muito longa.' }
    const criar = db.transaction(() => {
      const aberto = db.prepare(`SELECT 1 FROM inventarios WHERE tenant_id = ? AND status = 'Em contagem'`).get(TENANT_ID)
      if (aberto) throw new Error('OPEN')
      const proximo = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM inventarios').get() as { id: number }).id
      const codigo = `INV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(proximo).padStart(3, '0')}`
      const result = db.prepare(`
        INSERT INTO inventarios (tenant_id, usuario_id, codigo, descricao) VALUES (?, ?, ?, ?)
      `).run(TENANT_ID, USUARIO_ID, codigo, descricao.trim() || null)
      const inventarioId = Number(result.lastInsertRowid)
      const inserir = db.prepare(`
        INSERT INTO inventario_itens (inventario_id, tipo_item, item_id, codigo_item, saldo_sistema)
        VALUES (?, ?, ?, ?, ?)
      `)
      const filamentos = db.prepare(`SELECT id, COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo FROM filamentos WHERE tenant_id = ? AND ativo = 1`).all(TENANT_ID) as Array<{ id: number; saldo: number }>
      const insumos = db.prepare(`SELECT id, estoque_atual AS saldo FROM insumos WHERE tenant_id = ? AND ativo = 1`).all(TENANT_ID) as Array<{ id: number; saldo: number }>
      for (const item of filamentos) inserir.run(inventarioId, 'Filamento', item.id, codigoEstoque('Filamento', item.id), item.saldo)
      for (const item of insumos) inserir.run(inventarioId, 'Insumo', item.id, codigoEstoque('Insumo', item.id), item.saldo)
      registrarAuditoria(db, { entidade: 'Inventario', entidadeId: inventarioId, acao: 'INICIAR', descricao: `${codigo} · ${filamentos.length + insumos.length} item(ns)` })
    })
    try { criar.immediate() } catch (error) {
      if (error instanceof Error && error.message === 'OPEN') return { success: false, message: 'Conclua ou cancele o inventário em andamento.' }
      throw error
    }
    revalidatePath('/estoque/inventario')
    return { success: true, message: 'Inventário iniciado com o saldo atual congelado.' }
  } catch (error) {
    console.error('[iniciarInventario]', error)
    return { success: false, message: 'Não foi possível iniciar o inventário.' }
  }
}

export async function registrarContagem(inventarioId: number, codigoItem: string, saldoContado: number): Promise<{ success: boolean; message: string }> {
  if (!Number.isSafeInteger(inventarioId) || inventarioId <= 0 || !Number.isFinite(saldoContado) || saldoContado < 0) {
    return { success: false, message: 'Código ou contagem inválida.' }
  }
  const result = db.prepare(`
    UPDATE inventario_itens SET saldo_contado = ?, contado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE inventario_id = ? AND codigo_item = UPPER(TRIM(?))
      AND EXISTS (SELECT 1 FROM inventarios inv WHERE inv.id = inventario_id AND inv.tenant_id = ? AND inv.status = 'Em contagem')
  `).run(Math.round(saldoContado * 1000) / 1000, inventarioId, codigoItem, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Item não encontrado neste inventário.' }
  revalidatePath('/estoque/inventario')
  return { success: true, message: `${codigoItem.toUpperCase()} contado.` }
}

function ajustarLotesFilamento(inventarioId: number, itemId: number, saldoAtual: number, saldoNovo: number) {
  const diferenca = Math.round((saldoNovo - saldoAtual) * 1000) / 1000
  if (diferenca > 0) {
    db.prepare(`
      INSERT INTO lotes_filamento (
        tenant_id, filamento_id, codigo, peso_inicial_gramas, saldo_gramas, preco_compra, aberto_em
      ) SELECT ?, id, ?, ?, ?, preco_rolo, date('now') FROM filamentos WHERE id = ? AND tenant_id = ?
    `).run(TENANT_ID, `INV-${inventarioId}-${itemId}`, diferenca, diferenca, itemId, TENANT_ID)
  } else if (diferenca < 0) {
    let restante = -diferenca
    const lotes = db.prepare(`
      SELECT id, saldo_gramas FROM lotes_filamento
      WHERE tenant_id = ? AND filamento_id = ? AND ativo = 1 AND saldo_gramas > 0
      ORDER BY criado_em, id
    `).all(TENANT_ID, itemId) as Array<{ id: number; saldo_gramas: number }>
    for (const lote of lotes) {
      if (restante <= 0.0001) break
      const retirar = Math.min(restante, lote.saldo_gramas)
      db.prepare(`UPDATE lotes_filamento SET saldo_gramas = saldo_gramas - ? WHERE id = ?`).run(retirar, lote.id)
      restante -= retirar
    }
    if (restante > 0.001) throw new Error('LOT_BALANCE')
  }
}

export async function concluirInventario(inventarioId: number): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(inventarioId) || inventarioId <= 0) return { success: false, message: 'Inventário inválido.' }
    let ajustes = 0
    const concluir = db.transaction(() => {
      const inventario = db.prepare(`SELECT id, codigo FROM inventarios WHERE id = ? AND tenant_id = ? AND status = 'Em contagem'`)
        .get(inventarioId, TENANT_ID) as { id: number; codigo: string } | undefined
      if (!inventario) throw new Error('NOT_FOUND')
      const pendentes = (db.prepare('SELECT COUNT(*) AS total FROM inventario_itens WHERE inventario_id = ? AND saldo_contado IS NULL').get(inventarioId) as { total: number }).total
      if (pendentes > 0) throw new Error(`PENDING:${pendentes}`)
      const itens = db.prepare(`SELECT * FROM inventario_itens WHERE inventario_id = ?`).all(inventarioId) as Array<ItemInventario & { saldo_contado: number }>
      for (const item of itens) {
        if (Math.abs(item.saldo_contado - item.saldo_sistema) < 0.001) continue
        const tabela = item.tipo_item === 'Filamento' ? 'filamentos' : 'insumos'
        const campo = item.tipo_item === 'Filamento' ? 'estoque_gramas' : 'estoque_atual'
        const atual = db.prepare(`SELECT ${item.tipo_item === 'Filamento' ? 'COALESCE(estoque_gramas, peso_rolo_gramas)' : 'estoque_atual'} AS saldo FROM ${tabela} WHERE id = ? AND tenant_id = ?`)
          .get(item.item_id, TENANT_ID) as { saldo: number } | undefined
        if (!atual) throw new Error('ITEM_NOT_FOUND')
        if (item.tipo_item === 'Filamento') ajustarLotesFilamento(inventarioId, item.item_id, atual.saldo, item.saldo_contado)
        db.prepare(`UPDATE ${tabela} SET ${campo} = ? WHERE id = ? AND tenant_id = ?`).run(item.saldo_contado, item.item_id, TENANT_ID)
        db.prepare(`
          INSERT INTO movimentos_estoque (
            tenant_id, usuario_id, tipo_item, item_id, tipo, quantidade,
            saldo_anterior, saldo_posterior, motivo
          ) VALUES (?, ?, ?, ?, 'Ajuste', ?, ?, ?, ?)
        `).run(TENANT_ID, USUARIO_ID, item.tipo_item, item.item_id,
          Math.abs(item.saldo_contado - atual.saldo), atual.saldo, item.saldo_contado,
          `Inventário ${inventario.codigo}`)
        ajustes += 1
      }
      db.prepare(`UPDATE inventarios SET status = 'Concluído', concluido_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).run(inventarioId)
      registrarAuditoria(db, { entidade: 'Inventario', entidadeId: inventarioId, acao: 'CONCLUIR', descricao: `${ajustes} ajuste(s) de estoque` })
    })
    try { concluir.immediate() } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_FOUND') return { success: false, message: 'Inventário em andamento não encontrado.' }
      if (code.startsWith('PENDING:')) return { success: false, message: `Ainda faltam ${code.split(':')[1]} item(ns) para contar.` }
      if (code === 'LOT_BALANCE') return { success: false, message: 'Os lotes de filamento estão inconsistentes. Reconcilie-os antes de concluir.' }
      throw error
    }
    revalidatePath('/estoque/inventario')
    revalidatePath('/estoque')
    revalidatePath('/filamentos')
    revalidatePath('/insumos')
    return { success: true, message: `Inventário concluído com ${ajustes} ajuste(s).` }
  } catch (error) {
    console.error('[concluirInventario]', error)
    return { success: false, message: 'Não foi possível concluir o inventário.' }
  }
}

export async function cancelarInventario(inventarioId: number): Promise<{ success: boolean; message: string }> {
  if (!Number.isSafeInteger(inventarioId) || inventarioId <= 0) return { success: false, message: 'Inventário inválido.' }
  const result = db.prepare(`
    UPDATE inventarios SET status = 'Cancelado'
    WHERE id = ? AND tenant_id = ? AND status = 'Em contagem'
  `).run(inventarioId, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Inventário em andamento não encontrado.' }
  registrarAuditoria(db, { entidade: 'Inventario', entidadeId: inventarioId, acao: 'CANCELAR', descricao: 'Contagem cancelada sem alterar o estoque' })
  revalidatePath('/estoque/inventario')
  return { success: true, message: 'Inventário cancelado sem alterar o estoque.' }
}
