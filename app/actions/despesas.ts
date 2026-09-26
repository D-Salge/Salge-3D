'use server'

/**
 * app/actions/despesas.ts  -  v1
 * Server Actions para despesas e fluxo de capital.
 */

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { gerarParcelas } from '@/lib/financeiro.mjs'
import { randomUUID } from 'node:crypto'
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
  forma_pagamento: string | null
  grupo_parcelamento: string | null
  numero_parcela: number
  total_parcelas: number
}

export interface DespesaInput {
  categoria: string
  descricao: string
  valor: number
  data_despesa: string
  competencia_em: string
  vencimento_em: string
  pago_em: string | null
  forma_pagamento: string
  parcelas: number
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
           COALESCE(vencimento_em, data_despesa) AS vencimento_em, pago_em,
           forma_pagamento, grupo_parcelamento, numero_parcela, total_parcelas
         FROM despesas
         WHERE tenant_id = ?
           AND estornada_em IS NULL
           AND strftime('%Y-%m', data_despesa) = ?
         ORDER BY date(COALESCE(vencimento_em, data_despesa)), numero_parcela`
      )
      .all(TENANT_ID, mes) as Despesa[]
  }

  return db
    .prepare(
      `SELECT id, categoria, descricao, valor, data_despesa,
         COALESCE(competencia_em, data_despesa) AS competencia_em,
         COALESCE(vencimento_em, data_despesa) AS vencimento_em, pago_em,
         forma_pagamento, grupo_parcelamento, numero_parcela, total_parcelas
       FROM despesas
       WHERE tenant_id = ? AND estornada_em IS NULL
       ORDER BY pago_em IS NOT NULL, date(COALESCE(vencimento_em, data_despesa)), numero_parcela`
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
         AND date(pago_em) <= date('now')
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
      AND date(pago_em) <= date('now')
  `).get(TENANT_ID) as { total: number }

  const pendentesRow = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL AND pago_em IS NULL
  `).get(TENANT_ID) as { total: number }

  const aportesRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM fluxo_capital
       WHERE tenant_id = ? AND tipo = 'Aporte' AND date(data_movimentacao) <= date('now')`
    )
    .get(TENANT_ID) as { total: number }

  const retiradasRow = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total
       FROM fluxo_capital
       WHERE tenant_id = ? AND tipo = 'Retirada' AND date(data_movimentacao) <= date('now')`
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
  data: DespesaInput,
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
    if (!Number.isSafeInteger(data.parcelas) || data.parcelas < 1 || data.parcelas > 120) {
      return { success: false, message: 'Quantidade de parcelas inválida.' }
    }
    if (!data.forma_pagamento?.trim() || data.forma_pagamento.length > 80) {
      return { success: false, message: 'Informe uma forma de pagamento válida.' }
    }

    if (id === null) {
      const criarParcelas = db.transaction(() => {
        const grupo = data.parcelas > 1 ? randomUUID() : null
        const inserir = db.prepare(
          `INSERT INTO despesas (
            tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
            competencia_em, vencimento_em, pago_em, forma_pagamento,
            grupo_parcelamento, numero_parcela, total_parcelas
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        const ids: number[] = []
        for (const parcela of gerarParcelas(data.valor, data.parcelas, data.vencimento_em)) {
          const res = inserir.run(
            TENANT_ID,
            USUARIO_ID,
            data.categoria,
            data.descricao.trim(),
            parcela.valor,
            data.data_despesa,
            data.competencia_em,
            parcela.vencimentoEm,
            data.pago_em,
            data.forma_pagamento.trim(),
            grupo,
            parcela.numero,
            data.parcelas,
          )
          ids.push(Number(res.lastInsertRowid))
        }
        registrarAuditoria(db, {
          entidade: 'Despesa', entidadeId: ids[0], acao: 'CRIAR',
          descricao: `${data.descricao.trim()} · ${data.parcelas}x`,
          detalhes: { valorTotal: data.valor, parcelas: data.parcelas, grupo, ids },
        })
      })
      criarParcelas()
    } else {
      const res = db.prepare(
        `UPDATE despesas
         SET categoria = ?, descricao = ?, valor = ?, data_despesa = ?,
           competencia_em = ?, vencimento_em = ?, pago_em = ?, forma_pagamento = ?
         WHERE id = ? AND tenant_id = ? AND estornada_em IS NULL`
      ).run(
        data.categoria,
        data.descricao.trim(),
        data.valor,
        data.data_despesa,
        data.competencia_em,
        data.vencimento_em,
        data.pago_em,
        data.forma_pagamento.trim(),
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

export async function alterarPagamentoDespesa(
  id: number,
  pagoEm: string | null,
): Promise<ActionResult> {
  try {
    if (!Number.isSafeInteger(id) || id <= 0 || (pagoEm !== null && !/^\d{4}-\d{2}-\d{2}$/.test(pagoEm))) {
      return { success: false, message: 'Despesa ou data de pagamento inválida.' }
    }
    const result = db.prepare(`UPDATE despesas SET pago_em = ?
      WHERE id = ? AND tenant_id = ? AND estornada_em IS NULL`).run(pagoEm, id, TENANT_ID)
    if (result.changes !== 1) return { success: false, message: 'Despesa não encontrada.' }
    registrarAuditoria(db, {
      entidade: 'Despesa', entidadeId: id, acao: pagoEm ? 'PAGAR' : 'REABRIR',
      descricao: pagoEm ? `Parcela paga em ${pagoEm}` : 'Pagamento da parcela removido',
    })
    revalidatePath('/financeiro')
    return { success: true, message: pagoEm ? 'Parcela marcada como paga.' : 'Parcela reaberta.' }
  } catch (error) {
    console.error('[alterarPagamentoDespesa]', error)
    return { success: false, message: 'Erro interno ao atualizar pagamento.' }
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
