'use server'

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

export interface Cliente {
  id: number
  nome: string
  telefone: string | null
  instagram: string | null
  cidade: string | null
  origem: string | null
  criado_em?: string
  total_pedidos?: number
}

export interface ActionResult {
  success: boolean
  message: string
}

export async function getClientesLista(): Promise<Cliente[]> {
  return db
    .prepare(
      `SELECT c.id, c.nome, c.telefone, c.instagram, c.cidade, c.origem, c.criado_em,
         (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id) as total_pedidos
       FROM clientes c
       WHERE c.tenant_id = ? AND c.ativo = 1
       ORDER BY c.nome ASC`
    )
    .all(TENANT_ID) as Cliente[]
}

export async function salvarCliente(
  id: number | null,
  nome: string,
  telefone: string,
  instagram: string,
  cidade: string,
  origem: string,
): Promise<ActionResult> {
  try {
    if (!nome.trim()) return { success: false, message: 'O nome é obrigatório.' }

    if (id) {
      db.prepare(
        'UPDATE clientes SET nome = ?, telefone = ?, instagram = ?, cidade = ?, origem = ? WHERE id = ? AND tenant_id = ?'
      ).run(nome.trim(), telefone.trim(), instagram.trim() || null, cidade.trim() || null, origem || null, id, TENANT_ID)
    } else {
      db.prepare(
        'INSERT INTO clientes (tenant_id, usuario_id, nome, telefone, instagram, cidade, origem) VALUES (?, 1, ?, ?, ?, ?, ?)'
      ).run(TENANT_ID, nome.trim(), telefone.trim(), instagram.trim() || null, cidade.trim() || null, origem || null)
    }

    revalidatePath('/clientes')
    revalidatePath('/orcamentos')
    return { success: true, message: id ? 'Cliente atualizado!' : 'Cliente criado!' }
  } catch (error) {
    console.error('[salvarCliente]', error)
    return { success: false, message: 'Erro interno ao salvar.' }
  }
}

export async function deletarCliente(id: number): Promise<ActionResult> {
  try {
    const res = db.prepare('DELETE FROM clientes WHERE id = ? AND tenant_id = ?').run(id, TENANT_ID)
    if (res.changes === 0) return { success: false, message: 'Cliente não encontrado.' }

    revalidatePath('/clientes')
    revalidatePath('/orcamentos')
    return { success: true, message: 'Cliente excluído!' }
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return { success: false, message: 'Este cliente possui orçamentos/pedidos e não pode ser excluído.' }
    }
    console.error('[deletarCliente]', error)
    return { success: false, message: 'Erro interno ao excluir.' }
  }
}
