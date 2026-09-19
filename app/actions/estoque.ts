'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
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
  lote_codigo: string | null
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
  lotes: LoteFilamento[]
  filamentos: { id: number; nome: string; peso_rolo_gramas: number; preco_rolo: number }[]
}

export interface LoteFilamento {
  id: number
  filamento_id: number
  filamento_nome: string
  codigo: string
  peso_inicial_gramas: number
  saldo_gramas: number
  preco_compra: number
  aberto_em: string | null
  criado_em: string
}

export async function getResumoEstoque(): Promise<ResumoEstoque> {
  const alertas = db.prepare(`
    SELECT 'Filamento' AS tipo_item, id AS item_id,
      material || ' ' || cor AS nome,
      COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo,
      estoque_minimo_gramas AS minimo, 'g' AS unidade
    FROM filamentos
    WHERE tenant_id = ? AND ativo = 1
      AND COALESCE(estoque_gramas, peso_rolo_gramas) <= estoque_minimo_gramas
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
      , (SELECT l.codigo FROM lotes_filamento l WHERE l.id = m.lote_filamento_id) AS lote_codigo
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

  const lotes = db.prepare(`
    SELECT l.id, l.filamento_id, f.material || ' ' || f.cor AS filamento_nome,
      l.codigo, l.peso_inicial_gramas, l.saldo_gramas, l.preco_compra,
      l.aberto_em, l.criado_em
    FROM lotes_filamento l
    JOIN filamentos f ON f.id = l.filamento_id
    WHERE l.tenant_id = ? AND l.ativo = 1
    ORDER BY l.saldo_gramas > 0 DESC, COALESCE(l.aberto_em, substr(l.criado_em, 1, 10)), l.id
  `).all(TENANT_ID) as LoteFilamento[]

  const filamentos = db.prepare(`
    SELECT id, material || ' ' || cor AS nome, peso_rolo_gramas, preco_rolo
    FROM filamentos WHERE tenant_id = ? AND ativo = 1 ORDER BY material, cor
  `).all(TENANT_ID) as ResumoEstoque['filamentos']

  return {
    alertas,
    movimentos,
    valorEstoqueFilamentos: valores.filamentos,
    valorEstoqueInsumos: valores.insumos,
    lotes,
    filamentos,
  }
}

export async function registrarLoteFilamento(data: {
  filamentoId: number
  codigo: string
  pesoInicialGramas: number
  precoCompra: number
  abertoEm?: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(data.filamentoId) || data.filamentoId <= 0) {
      return { success: false, message: 'Filamento inválido.' }
    }
    if (!data.codigo.trim() || data.codigo.trim().length > 80) {
      return { success: false, message: 'Informe um código de lote válido.' }
    }
    if (!Number.isFinite(data.pesoInicialGramas) || data.pesoInicialGramas <= 0 ||
        !Number.isFinite(data.precoCompra) || data.precoCompra < 0) {
      return { success: false, message: 'Peso ou preço inválido.' }
    }
    if (data.abertoEm && !/^\d{4}-\d{2}-\d{2}$/.test(data.abertoEm)) {
      return { success: false, message: 'Data de abertura inválida.' }
    }

    const criar = db.transaction(() => {
      const filamento = db.prepare(`
        SELECT COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo
        FROM filamentos WHERE id = ? AND tenant_id = ? AND ativo = 1
      `).get(data.filamentoId, TENANT_ID) as { saldo: number } | undefined
      if (!filamento) throw new Error('NOT_FOUND')

      const result = db.prepare(`
        INSERT INTO lotes_filamento (
          tenant_id, filamento_id, codigo, peso_inicial_gramas,
          saldo_gramas, preco_compra, aberto_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        TENANT_ID, data.filamentoId, data.codigo.trim(), data.pesoInicialGramas,
        data.pesoInicialGramas, data.precoCompra, data.abertoEm || null,
      )
      const loteId = Number(result.lastInsertRowid)
      const saldoPosterior = filamento.saldo + data.pesoInicialGramas
      db.prepare('UPDATE filamentos SET estoque_gramas = ? WHERE id = ? AND tenant_id = ?')
        .run(saldoPosterior, data.filamentoId, TENANT_ID)
      db.prepare(`
        INSERT INTO movimentos_estoque (
          tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id,
          tipo, quantidade, saldo_anterior, saldo_posterior, motivo
        ) VALUES (?, ?, 'Filamento', ?, ?, 'Entrada', ?, ?, ?, 'Entrada de novo rolo/lote')
      `).run(
        TENANT_ID, USUARIO_ID, data.filamentoId, loteId, data.pesoInicialGramas,
        filamento.saldo, saldoPosterior,
      )
      registrarAuditoria(db, {
        entidade: 'LoteFilamento', entidadeId: loteId, acao: 'CRIAR',
        descricao: `Lote ${data.codigo.trim()} com ${data.pesoInicialGramas}g`,
      })
    })
    criar()
    revalidatePath('/estoque')
    revalidatePath('/filamentos')
    return { success: true, message: 'Novo rolo registrado e somado ao estoque.' }
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return { success: false, message: 'Filamento não encontrado.' }
    }
    if (typeof error === 'object' && error !== null && 'code' in error &&
        error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, message: 'Já existe um lote com esse código.' }
    }
    console.error('[registrarLoteFilamento]', error)
    return { success: false, message: 'Erro interno ao registrar o lote.' }
  }
}

export async function registrarPerdaFilamento(data: {
  loteId: number
  quantidade: number
  motivo: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(data.loteId) || data.loteId <= 0 ||
        !Number.isFinite(data.quantidade) || data.quantidade <= 0) {
      return { success: false, message: 'Lote ou quantidade inválida.' }
    }
    if (!data.motivo.trim()) return { success: false, message: 'Informe o motivo da perda.' }

    const registrar = db.transaction(() => {
      const lote = db.prepare(`
        SELECT l.filamento_id, l.saldo_gramas,
          COALESCE(f.estoque_gramas, f.peso_rolo_gramas) AS saldo_total
        FROM lotes_filamento l
        JOIN filamentos f ON f.id = l.filamento_id AND f.tenant_id = l.tenant_id
        WHERE l.id = ? AND l.tenant_id = ? AND l.ativo = 1
      `).get(data.loteId, TENANT_ID) as {
        filamento_id: number; saldo_gramas: number; saldo_total: number
      } | undefined
      if (!lote) throw new Error('NOT_FOUND')
      if (data.quantidade > lote.saldo_gramas + 0.001) throw new Error('INSUFFICIENT')
      const saldoPosterior = lote.saldo_total - data.quantidade
      db.prepare(`
        UPDATE lotes_filamento SET saldo_gramas = saldo_gramas - ?
        WHERE id = ? AND tenant_id = ? AND saldo_gramas >= ?
      `).run(data.quantidade, data.loteId, TENANT_ID, data.quantidade)
      db.prepare('UPDATE filamentos SET estoque_gramas = ? WHERE id = ? AND tenant_id = ?')
        .run(saldoPosterior, lote.filamento_id, TENANT_ID)
      db.prepare(`
        INSERT INTO movimentos_estoque (
          tenant_id, usuario_id, tipo_item, item_id, lote_filamento_id,
          tipo, quantidade, saldo_anterior, saldo_posterior, motivo
        ) VALUES (?, ?, 'Filamento', ?, ?, 'Saida', ?, ?, ?, ?)
      `).run(
        TENANT_ID, USUARIO_ID, lote.filamento_id, data.loteId, data.quantidade,
        lote.saldo_total, saldoPosterior, `Perda: ${data.motivo.trim()}`,
      )
      registrarAuditoria(db, {
        entidade: 'LoteFilamento', entidadeId: data.loteId, acao: 'REGISTRAR_PERDA',
        descricao: `${data.quantidade}g — ${data.motivo.trim()}`,
      })
    })
    registrar()
    revalidatePath('/estoque')
    revalidatePath('/filamentos')
    return { success: true, message: 'Perda registrada com rastreabilidade.' }
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'NOT_FOUND') return { success: false, message: 'Lote não encontrado.' }
    if (code === 'INSUFFICIENT') return { success: false, message: 'A perda excede o saldo deste lote.' }
    console.error('[registrarPerdaFilamento]', error)
    return { success: false, message: 'Erro interno ao registrar a perda.' }
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
