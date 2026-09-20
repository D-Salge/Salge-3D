'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface ModeloOrcamento {
  id: number
  pedido_id: number
  nome: string
  nome_da_peca: string
  quantidade: number
  preco_unitario: number
  impressora_nome: string | null
  atualizado_em: string
}

export async function getModelosOrcamento(): Promise<ModeloOrcamento[]> {
  return db.prepare(`
    SELECT m.id, m.pedido_id, m.nome, p.nome_da_peca, p.quantidade,
      COALESCE(NULLIF(p.preco_unitario, 0),
        (p.valor_total_cobrado + p.desconto - p.frete_cobrado) / MAX(p.quantidade, 1)
      ) AS preco_unitario,
      imp.nome AS impressora_nome, m.atualizado_em
    FROM modelos_orcamento m
    JOIN pedidos p ON p.id = m.pedido_id AND p.tenant_id = m.tenant_id
    LEFT JOIN impressoras imp ON imp.id = p.impressora_id
    WHERE m.tenant_id = ? AND m.ativo = 1
    ORDER BY m.atualizado_em DESC, m.nome
  `).all(TENANT_ID) as ModeloOrcamento[]
}

export async function salvarModeloOrcamento(
  pedidoId: number,
  nome: string,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      return { success: false, message: 'Pedido inválido.' }
    }
    const nomeLimpo = nome.trim()
    if (!nomeLimpo || nomeLimpo.length > 100) {
      return { success: false, message: 'Informe um nome de até 100 caracteres.' }
    }
    const pedido = db.prepare(
      'SELECT id FROM pedidos WHERE id = ? AND tenant_id = ?',
    ).get(pedidoId, TENANT_ID)
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }

    const salvar = db.transaction(() => {
      const existente = db.prepare(`
        SELECT id FROM modelos_orcamento
        WHERE tenant_id = ? AND nome = ? COLLATE NOCASE
      `).get(TENANT_ID, nomeLimpo) as { id: number } | undefined

      if (existente) {
        db.prepare(`
          UPDATE modelos_orcamento
          SET pedido_id = ?, ativo = 1, usuario_id = ?
          WHERE id = ? AND tenant_id = ?
        `).run(pedidoId, USUARIO_ID, existente.id, TENANT_ID)
        registrarAuditoria(db, {
          entidade: 'ModeloOrcamento', entidadeId: existente.id, acao: 'ATUALIZAR',
          descricao: `Modelo ${nomeLimpo} atualizado pelo pedido #${pedidoId}`,
        })
      } else {
        const result = db.prepare(`
          INSERT INTO modelos_orcamento (tenant_id, usuario_id, pedido_id, nome)
          VALUES (?, ?, ?, ?)
        `).run(TENANT_ID, USUARIO_ID, pedidoId, nomeLimpo)
        registrarAuditoria(db, {
          entidade: 'ModeloOrcamento', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR',
          descricao: `Modelo ${nomeLimpo} criado pelo pedido #${pedidoId}`,
        })
      }
    })
    salvar()
    revalidatePath('/orcamentos')
    return { success: true, message: 'Modelo de orçamento salvo.' }
  } catch (error) {
    console.error('[salvarModeloOrcamento]', error)
    return { success: false, message: 'Erro interno ao salvar o modelo.' }
  }
}

export async function arquivarModeloOrcamento(
  modeloId: number,
): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(modeloId) || modeloId <= 0) {
      return { success: false, message: 'Modelo inválido.' }
    }
    const result = db.prepare(`
      UPDATE modelos_orcamento SET ativo = 0
      WHERE id = ? AND tenant_id = ? AND ativo = 1
    `).run(modeloId, TENANT_ID)
    if (result.changes !== 1) return { success: false, message: 'Modelo não encontrado.' }
    registrarAuditoria(db, {
      entidade: 'ModeloOrcamento', entidadeId: modeloId, acao: 'ARQUIVAR',
      descricao: 'Modelo de orçamento arquivado',
    })
    revalidatePath('/orcamentos')
    return { success: true, message: 'Modelo removido.' }
  } catch (error) {
    console.error('[arquivarModeloOrcamento]', error)
    return { success: false, message: 'Erro interno ao remover o modelo.' }
  }
}
