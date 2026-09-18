'use server'

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export type TipoItemEstoque = 'Filamento' | 'Insumo'
export type TipoMovimentoEstoque = 'Entrada' | 'Saida' | 'Ajuste' | 'Reversao'

export interface MovimentoEstoque {
  id: number
  tipo_item: TipoItemEstoque
  item_id: number
  item_nome: string
  unidade: string
  pedido_id: number | null
  tipo: TipoMovimentoEstoque
  quantidade: number
  saldo_anterior: number
  saldo_posterior: number
  motivo: string
  criado_em: string
}

export interface AlertaEstoque {
  tipo_item: TipoItemEstoque
  item_id: number
  nome: string
  saldo: number
  minimo: number
  unidade: string
}

export interface ResumoEstoque {
  alertas: AlertaEstoque[]
  movimentos: MovimentoEstoque[]
  valorEstoqueFilamentos: number
  valorEstoqueInsumos: number
}

export async function getResumoEstoque(): Promise<ResumoEstoque> {
  const alertas = db.prepare(`
    SELECT 'Filamento' AS tipo_item, id AS item_id,
      material || ' ' || cor AS nome,
      COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo,
      150 AS minimo, 'g' AS unidade
    FROM filamentos
    WHERE tenant_id = ? AND ativo = 1
      AND COALESCE(estoque_gramas, peso_rolo_gramas) <= 150
    UNION ALL
    SELECT 'Insumo', id, nome, estoque_atual, estoque_minimo, unidade
    FROM insumos
    WHERE tenant_id = ? AND ativo = 1
      AND estoque_minimo > 0 AND estoque_atual <= estoque_minimo
    ORDER BY saldo ASC
  `).all(TENANT_ID, TENANT_ID) as AlertaEstoque[]

  const movimentos = db.prepare(`
    SELECT m.*,
      CASE
        WHEN m.tipo_item = 'Filamento' THEN COALESCE(
          (SELECT f.material || ' ' || f.cor FROM filamentos f WHERE f.id = m.item_id),
          'Filamento removido'
        )
        ELSE COALESCE(
          (SELECT i.nome FROM insumos i WHERE i.id = m.item_id),
          'Insumo removido'
        )
      END AS item_nome,
      CASE
        WHEN m.tipo_item = 'Filamento' THEN 'g'
        ELSE COALESCE((SELECT i.unidade FROM insumos i WHERE i.id = m.item_id), 'unid')
      END AS unidade
    FROM movimentos_estoque m
    WHERE m.tenant_id = ?
    ORDER BY m.criado_em DESC, m.id DESC
    LIMIT 100
  `).all(TENANT_ID) as MovimentoEstoque[]

  const valores = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(
        COALESCE(estoque_gramas, peso_rolo_gramas) * preco_rolo / peso_rolo_gramas
      ) FROM filamentos WHERE tenant_id = ? AND ativo = 1), 0) AS filamentos,
      COALESCE((SELECT SUM(estoque_atual * custo_unitario)
        FROM insumos WHERE tenant_id = ? AND ativo = 1), 0) AS insumos
  `).get(TENANT_ID, TENANT_ID) as { filamentos: number; insumos: number }

  return {
    alertas,
    movimentos,
    valorEstoqueFilamentos: valores.filamentos,
    valorEstoqueInsumos: valores.insumos,
  }
}

export async function ajustarEstoque(data: {
  tipoItem: TipoItemEstoque
  itemId: number
  novoSaldo: number
  motivo: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!['Filamento', 'Insumo'].includes(data.tipoItem)) {
      return { success: false, message: 'Tipo de item inválido.' }
    }
    if (!Number.isSafeInteger(data.itemId) || data.itemId <= 0) {
      return { success: false, message: 'Item inválido.' }
    }
    if (!Number.isFinite(data.novoSaldo) || data.novoSaldo < 0 || data.novoSaldo > 10_000_000) {
      return { success: false, message: 'Novo saldo inválido.' }
    }
    if (!data.motivo.trim()) return { success: false, message: 'Informe o motivo do ajuste.' }

    const ajustar = db.transaction(() => {
      const tabela = data.tipoItem === 'Filamento' ? 'filamentos' : 'insumos'
      const campo = data.tipoItem === 'Filamento' ? 'estoque_gramas' : 'estoque_atual'
      const fallback = data.tipoItem === 'Filamento' ? 'COALESCE(estoque_gramas, peso_rolo_gramas)' : 'estoque_atual'
      const atual = db.prepare(
        `SELECT ${fallback} AS saldo FROM ${tabela} WHERE id = ? AND tenant_id = ? AND ativo = 1`,
      ).get(data.itemId, TENANT_ID) as { saldo: number } | undefined
      if (!atual) throw new Error('NOT_FOUND')

      const novoSaldo = Math.round(data.novoSaldo * 1000) / 1000
      if (novoSaldo === atual.saldo) return

      db.prepare(`UPDATE ${tabela} SET ${campo} = ? WHERE id = ? AND tenant_id = ?`)
        .run(novoSaldo, data.itemId, TENANT_ID)

      db.prepare(`
        INSERT INTO movimentos_estoque (
          tenant_id, usuario_id, tipo_item, item_id, tipo, quantidade,
          saldo_anterior, saldo_posterior, motivo
        ) VALUES (?, ?, ?, ?, 'Ajuste', ?, ?, ?, ?)
      `).run(
        TENANT_ID,
        USUARIO_ID,
        data.tipoItem,
        data.itemId,
        Math.abs(novoSaldo - atual.saldo),
        atual.saldo,
        novoSaldo,
        data.motivo.trim(),
      )
    })

    ajustar()
    revalidatePath('/estoque')
    revalidatePath('/filamentos')
    revalidatePath('/insumos')
    revalidatePath('/producao')
    return { success: true, message: 'Estoque ajustado com histórico.' }
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { success: false, message: 'Item não encontrado.' }
    }
    console.error('[ajustarEstoque]', error)
    return { success: false, message: 'Erro interno ao ajustar estoque.' }
  }
}
