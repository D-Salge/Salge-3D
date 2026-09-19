'use server'

/**
 * app/actions/despesas.ts  -  v1
 * Server Actions para despesas e fluxo de capital.
 */

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

// --- Tipos publicos ---

export interface Despesa {
  id: number
  categoria: string
  descricao: string
  valor: number
  data_despesa: string
  competencia_em: string
  vencimento_em: string
  pago_em: string | null
}

export interface FluxoCapital {
  id: number
  tipo: 'Aporte' | 'Retirada'
  valor: number
  descricao: string | null
  data_movimentacao: string
}

export interface ActionResult {
  success: boolean
  message: string
}

// --- Queries de leitura ---

export async function getDespesas(mes?: string): Promise<Despesa[]> {
  if (mes) {
    return db
      .prepare(
        `SELECT id, categoria, descricao, valor, data_despesa,
           COALESCE(competencia_em, data_despesa) AS competencia_em,
           COALESCE(vencimento_em, data_despesa) AS vencimento_em, pago_em
         FROM despesas
         WHERE tenant_id = ?
           AND estornada_em IS NULL
           AND strftime('%Y-%m', data_despesa) = ?
         ORDER BY data_despesa DESC`
      )
      .all(TENANT_ID, mes) as Despesa[]
  }

  return db
    .prepare(
      `SELECT id, categoria, descricao, valor, data_despesa,
         COALESCE(competencia_em, data_despesa) AS competencia_em,
         COALESCE(vencimento_em, data_despesa) AS vencimento_em, pago_em
       FROM despesas
       WHERE tenant_id = ? AND estornada_em IS NULL
       ORDER BY data_despesa DESC`
    )
    .all(TENANT_ID) as Despesa[]
}

export async function getFluxoCapital(): Promise<FluxoCapital[]> {
  return db
    .prepare(
      `SELECT id, tipo, valor, descricao, data_movimentacao
       FROM fluxo_capital
       WHERE tenant_id = ?
       ORDER BY data_movimentacao DESC`
    )
    .all(TENANT_ID) as FluxoCapital[]
}

export async function getResumoDespesas(): Promise<{
  totalDespesasMes: number
  totalDespesasPagas: number
  totalDespesasCompetenciaMes: number
  totalDespesasPendentes: number
  totalAportes: number
  totalRetiradas: number
}> {
  const despesasMesRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM despesas
       WHERE tenant_id = ?
         AND estornada_em IS NULL
         AND pago_em IS NOT NULL
         AND strftime('%Y-%m', pago_em) = strftime('%Y-%m', 'now')`
    )
    .get(TENANT_ID) as { total: number }

  const competenciaRow = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL
      AND strftime('%Y-%m', COALESCE(competencia_em, data_despesa)) = strftime('%Y-%m', 'now')
  `).get(TENANT_ID) as { total: number }

  const pagasRow = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL AND pago_em IS NOT NULL
  `).get(TENANT_ID) as { total: number }

  const pendentesRow = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL AND pago_em IS NULL
  `).get(TENANT_ID) as { total: number }

  const aportesRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM fluxo_capital
       WHERE tenant_id = ? AND tipo = 'Aporte'`
    )
    .get(TENANT_ID) as { total: number }

  const retiradasRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM fluxo_capital
       WHERE tenant_id = ? AND tipo = 'Retirada'`
    )
    .get(TENANT_ID) as { total: number }

  return {
    totalDespesasMes: despesasMesRow.total,
    totalDespesasPagas: pagasRow.total,
    totalDespesasCompetenciaMes: competenciaRow.total,
    totalDespesasPendentes: pendentesRow.total,
    totalAportes: aportesRow.total,
    totalRetiradas: retiradasRow.total,
  }
}

// --- Mutations: despesas ---

export async function salvarDespesa(
  id: number | null,
  data: Omit<Despesa, 'id'>,
): Promise<ActionResult> {
  try {
    if (!data.descricao?.trim()) return { success: false, message: 'Informe a descricao da despesa.' }
    if (!Number.isFinite(data.valor) || data.valor <= 0 || data.valor > 10_000_000) {
      return { success: false, message: 'O valor deve ser maior que zero.' }
    }
    const categorias = ['Filamentos', 'Insumos', 'Equipamento', 'Energia', 'Marketing', 'Software', 'Manutencao', 'Embalagens', 'Frete', 'Outros']
    if (!categorias.includes(data.categoria)) return { success: false, message: 'Categoria invalida.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.data_despesa)) return { success: false, message: 'Data invalida.' }
    if (![data.competencia_em, data.vencimento_em].every((valor) => /^\d{4}-\d{2}-\d{2}$/.test(valor))) {
      return { success: false, message: 'Competência ou vencimento inválido.' }
    }
    if (data.pago_em !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data.pago_em)) {
      return { success: false, message: 'Data de pagamento inválida.' }
    }

    if (id === null) {
      const res = db.prepare(
        `INSERT INTO despesas (
          tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
          competencia_em, vencimento_em, pago_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        TENANT_ID,
        USUARIO_ID,
        data.categoria,
        data.descricao.trim(),
        data.valor,
        data.data_despesa,
        data.competencia_em,
        data.vencimento_em,
        data.pago_em,
      )
      registrarAuditoria(db, {
        entidade: 'Despesa', entidadeId: Number(res.lastInsertRowid), acao: 'CRIAR',
        descricao: data.descricao.trim(), detalhes: { valor: data.valor, pagoEm: data.pago_em },
      })
    } else {
      const res = db.prepare(
        `UPDATE despesas
         SET categoria = ?, descricao = ?, valor = ?, data_despesa = ?,
           competencia_em = ?, vencimento_em = ?, pago_em = ?
         WHERE id = ? AND tenant_id = ? AND estornada_em IS NULL`
      ).run(
        data.categoria,
        data.descricao.trim(),
        data.valor,
        data.data_despesa,
        data.competencia_em,
        data.vencimento_em,
        data.pago_em,
        id,
        TENANT_ID,
      )
      if (res.changes === 0) return { success: false, message: 'Despesa nao encontrada.' }
      registrarAuditoria(db, {
        entidade: 'Despesa', entidadeId: id, acao: 'ATUALIZAR',
        descricao: data.descricao.trim(), detalhes: { valor: data.valor, pagoEm: data.pago_em },
      })
    }

    revalidatePath('/financeiro')
    revalidatePath('/despesas')

    return {
      success: true,
      message: id === null ? 'Despesa registrada com sucesso!' : 'Despesa atualizada com sucesso!',
    }
  } catch (error) {
    console.error('[salvarDespesa]', error)
    return { success: false, message: 'Erro interno ao salvar despesa.' }
  }
}

export async function deletarDespesa(id: number): Promise<ActionResult> {
  try {
    const estornar = db.transaction(() => {
      const res = db.prepare(`UPDATE despesas
        SET estornada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            estorno_motivo = 'Estornada pelo usuário'
        WHERE id = ? AND tenant_id = ? AND estornada_em IS NULL`)
        .run(id, TENANT_ID)
      if (res.changes === 0) throw new Error('NOT_FOUND')
      registrarAuditoria(db, {
        entidade: 'Despesa', entidadeId: id, acao: 'ESTORNAR',
        descricao: 'Despesa estornada pelo usuário',
      })
    })
    try { estornar() } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        return { success: false, message: 'Despesa nao encontrada.' }
      }
      throw error
    }

    revalidatePath('/financeiro')
    revalidatePath('/despesas')

    return { success: true, message: 'Despesa estornada com segurança.' }
  } catch (error) {
    console.error('[deletarDespesa]', error)
    return { success: false, message: 'Erro interno ao remover despesa.' }
  }
}

// --- Mutations: fluxo de capital ---

export async function salvarFluxoCapital(
  data: Omit<FluxoCapital, 'id'>,
): Promise<ActionResult> {
  try {
    if (!Number.isFinite(data.valor) || data.valor <= 0 || data.valor > 10_000_000) {
      return { success: false, message: 'O valor deve ser maior que zero.' }
    }
    if (!['Aporte', 'Retirada'].includes(data.tipo)) {
      return { success: false, message: 'Tipo de movimentacao invalido.' }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.data_movimentacao)) {
      return { success: false, message: 'Data invalida.' }
    }

    const result = db.prepare(
      `INSERT INTO fluxo_capital (tenant_id, usuario_id, tipo, valor, descricao, data_movimentacao)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      TENANT_ID,
      USUARIO_ID,
      data.tipo,
      data.valor,
      data.descricao?.trim() || null,
      data.data_movimentacao,
    )
    registrarAuditoria(db, {
      entidade: 'FluxoCapital', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR',
      descricao: `${data.tipo} de R$ ${data.valor.toFixed(2)}`,
    })

    revalidatePath('/financeiro')
    revalidatePath('/fluxo-capital')

    return { success: true, message: `${data.tipo} registrado com sucesso!` }
  } catch (error) {
    console.error('[salvarFluxoCapital]', error)
    return { success: false, message: 'Erro interno ao registrar movimentacao.' }
  }
}
