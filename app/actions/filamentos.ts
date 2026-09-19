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
  estoque_minimo_gramas: number
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
      `SELECT id, material, cor, peso_rolo_gramas, preco_rolo, estoque_gramas,
         estoque_minimo_gramas, marca, fornecedor
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
    const estoque = data.estoque_gramas ?? data.peso_rolo_gramas
    if (![data.peso_rolo_gramas, data.preco_rolo, estoque, data.estoque_minimo_gramas].every(Number.isFinite) ||
        data.peso_rolo_gramas <= 0 || data.preco_rolo < 0 || estoque < 0 || data.estoque_minimo_gramas < 0) {
      return { success: false, message: 'Peso, preço ou estoque inválido.' }
    }

    const salvar = db.transaction(() => {
      const novoSaldo = estoque
      let filamentoId = id
      let saldoAnterior = 0

      if (id) {
        const atual = db.prepare(
          `SELECT COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo
           FROM filamentos WHERE id = ? AND tenant_id = ? AND ativo = 1`,
        ).get(id, TENANT_ID) as { saldo: number } | undefined
        if (!atual) throw new Error('NOT_FOUND')
        saldoAnterior = atual.saldo

        db.prepare(`
          UPDATE filamentos
          SET material = ?, cor = ?, peso_rolo_gramas = ?, preco_rolo = ?, estoque_gramas = ?,
            estoque_minimo_gramas = ?, marca = ?, fornecedor = ?
          WHERE id = ? AND tenant_id = ?
        `).run(
          data.material.trim(), data.cor.trim(), data.peso_rolo_gramas, data.preco_rolo,
          novoSaldo, data.estoque_minimo_gramas, data.marca?.trim() || null,
          data.fornecedor?.trim() || null, id, TENANT_ID,
        )
      } else {
        const result = db.prepare(`
          INSERT INTO filamentos (
            tenant_id, usuario_id, material, cor, peso_rolo_gramas, preco_rolo,
            estoque_gramas, estoque_minimo_gramas, marca, fornecedor
          ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          TENANT_ID, data.material.trim(), data.cor.trim(), data.peso_rolo_gramas,
          data.preco_rolo, novoSaldo, data.estoque_minimo_gramas,
          data.marca?.trim() || null, data.fornecedor?.trim() || null,
        )
        filamentoId = Number(result.lastInsertRowid)
      }

      if (filamentoId && novoSaldo > saldoAnterior) {
        const incremento = novoSaldo - saldoAnterior
        db.prepare(`
          INSERT INTO lotes_filamento (
            tenant_id, filamento_id, codigo, peso_inicial_gramas,
            saldo_gramas, preco_compra, aberto_em
          ) VALUES (?, ?, ?, ?, ?, ?, date('now'))
        `).run(
          TENANT_ID, filamentoId, `${id ? 'AJ' : 'INI'}-${filamentoId}-${Date.now()}`,
          incremento, incremento, data.preco_rolo,
        )
      } else if (filamentoId && novoSaldo < saldoAnterior) {
        let restante = saldoAnterior - novoSaldo
        const lotes = db.prepare(`
          SELECT id, saldo_gramas FROM lotes_filamento
          WHERE tenant_id = ? AND filamento_id = ? AND ativo = 1 AND saldo_gramas > 0
          ORDER BY COALESCE(aberto_em, substr(criado_em, 1, 10)), id
        `).all(TENANT_ID, filamentoId) as { id: number; saldo_gramas: number }[]
        const baixar = db.prepare('UPDATE lotes_filamento SET saldo_gramas = saldo_gramas - ? WHERE id = ?')
        for (const lote of lotes) {
          if (restante <= 0) break
          const quantidade = Math.min(restante, lote.saldo_gramas)
          baixar.run(quantidade, lote.id)
          restante = Math.round((restante - quantidade) * 1000) / 1000
        }
        if (restante > 0.001) throw new Error('LOT_MISMATCH')
      }

      if (filamentoId && novoSaldo !== saldoAnterior) {
        db.prepare(`
          INSERT INTO movimentos_estoque (
            tenant_id, usuario_id, tipo_item, item_id, tipo, quantidade,
            saldo_anterior, saldo_posterior, motivo
          ) VALUES (?, 1, 'Filamento', ?, ?, ?, ?, ?, ?)
        `).run(
          TENANT_ID, filamentoId, id ? 'Ajuste' : 'Entrada',
          Math.abs(novoSaldo - saldoAnterior), saldoAnterior, novoSaldo,
          id ? 'Saldo atualizado no cadastro' : 'Estoque inicial',
        )
      }
    })
    salvar()

    revalidatePath('/filamentos')
    revalidatePath('/orcamentos')
    return { success: true, message: id ? 'Filamento atualizado!' : 'Filamento criado!' }
  } catch (error) {
    console.error('[salvarFilamento]', error)
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { success: false, message: 'Filamento não encontrado.' }
    }
    if (error instanceof Error && error.message === 'LOT_MISMATCH') {
      return { success: false, message: 'Os lotes não cobrem esse ajuste. Registre a perda na tela de estoque.' }
    }
    return { success: false, message: 'Erro interno ao salvar.' }
  }
}

export async function deletarFilamento(id: number): Promise<ActionResult> {
  try {
    const res = db.prepare('UPDATE filamentos SET ativo = 0 WHERE id = ? AND tenant_id = ? AND ativo = 1').run(id, TENANT_ID)
    if (res.changes === 0) return { success: false, message: 'Filamento não encontrado.' }

    revalidatePath('/filamentos')
    revalidatePath('/orcamentos')
    return { success: true, message: 'Filamento arquivado com segurança!' }
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
    ) {
      return { success: false, message: 'Este filamento já foi usado em pedidos e não pode ser excluído.' }
    }
    console.error('[deletarFilamento]', error)
    return { success: false, message: 'Erro interno ao excluir.' }
  }
}
