'use server'

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

export interface FilamentoCompleto {
  id: number
  material: string
  cor: string
  peso_rolo_gramas: number
  preco_rolo: number
  estoque_gramas: number | null
  marca: string | null
  fornecedor: string | null
}

export interface ActionResult {
  success: boolean
  message: string
}

export async function getFilamentosLista(): Promise<FilamentoCompleto[]> {
  return db
    .prepare(
      `SELECT id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas, marca, fornecedor
       FROM filamentos
       WHERE tenant_id = ? AND ativo = 1
       ORDER BY material ASC, cor ASC`
    )
    .all(TENANT_ID) as FilamentoCompleto[]
}

export async function salvarFilamento(
  id: number | null,
  data: Omit<FilamentoCompleto, 'id'>
): Promise<ActionResult> {
  try {
    if (!data.material || !data.cor) return { success: false, message: 'Material e cor são obrigatórios.' }
    if (data.peso_rolo_gramas <= 0 || data.preco_rolo < 0) return { success: false, message: 'Valores inválidos.' }

    if (id) {
      db.prepare(`
        UPDATE filamentos 
        SET material = ?, cor = ?, peso_rolo_gramas = ?, preco_rolo = ?, estoque_gramas = ?, marca = ?, fornecedor = ?
        WHERE id = ? AND tenant_id = ?
      `).run(
        data.material.trim(),
        data.cor.trim(),
        data.peso_rolo_gramas,
        data.preco_rolo,
        data.estoque_gramas,
        data.marca?.trim() || null,
        data.fornecedor?.trim() || null,
        id,
        TENANT_ID
      )
    } else {
      db.prepare(`
        INSERT INTO filamentos (tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas, marca, fornecedor)
        VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        TENANT_ID,
        data.material.trim(),
        data.cor.trim(),
        data.peso_rolo_gramas,
        data.preco_rolo,
        data.estoque_gramas,
        data.marca?.trim() || null,
        data.fornecedor?.trim() || null,
      )
    }

    revalidatePath('/filamentos')
    revalidatePath('/orcamentos')
    return { success: true, message: id ? 'Filamento atualizado!' : 'Filamento criado!' }
  } catch (error) {
    console.error('[salvarFilamento]', error)
    return { success: false, message: 'Erro interno ao salvar.' }
  }
}

export async function deletarFilamento(id: number): Promise<ActionResult> {
  try {
    const res = db.prepare('DELETE FROM filamentos WHERE id = ? AND tenant_id = ?').run(id, TENANT_ID)
    if (res.changes === 0) return { success: false, message: 'Filamento não encontrado.' }

    revalidatePath('/filamentos')
    revalidatePath('/orcamentos')
    return { success: true, message: 'Filamento excluído!' }
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return { success: false, message: 'Este filamento já foi usado em pedidos e não pode ser excluído.' }
    }
    console.error('[deletarFilamento]', error)
    return { success: false, message: 'Erro interno ao excluir.' }
  }
}
