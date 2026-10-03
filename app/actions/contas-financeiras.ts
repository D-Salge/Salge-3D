'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { exigirSessao } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export interface ContaFinanceira {
  id: number
  nome: string
  instituicao: string
  tipo: 'Conta digital' | 'Conta bancaria' | 'Dinheiro' | 'Reserva'
  saldo_inicial: number
  saldo_atual: number
  padrao_recebimento: number
  padrao_pagamento: number
  ativa: number
}

export interface TransferenciaFinanceira {
  id: number
  conta_origem_id: number
  conta_destino_id: number
  conta_origem: string
  conta_destino: string
  valor: number
  data_transferencia: string
  descricao: string | null
}

const SALDO_SQL = `
  cf.saldo_inicial
  + COALESCE((SELECT SUM(r.valor) FROM recebimentos r
      WHERE r.conta_financeira_id = cf.id AND r.estornado_em IS NULL
        AND date(r.data_recebimento) <= date('now')), 0)
  - COALESCE((SELECT SUM(d.valor) FROM despesas d
      WHERE d.conta_financeira_id = cf.id AND d.estornada_em IS NULL
        AND d.pago_em IS NOT NULL AND date(d.pago_em) <= date('now')), 0)
  + COALESCE((SELECT SUM(CASE WHEN f.tipo = 'Aporte' THEN f.valor ELSE -f.valor END)
      FROM fluxo_capital f WHERE f.conta_financeira_id = cf.id
        AND date(f.data_movimentacao) <= date('now')), 0)
  + COALESCE((SELECT SUM(t.valor) FROM transferencias_financeiras t
      WHERE t.conta_destino_id = cf.id AND t.estornada_em IS NULL
        AND date(t.data_transferencia) <= date('now')), 0)
  - COALESCE((SELECT SUM(t.valor) FROM transferencias_financeiras t
      WHERE t.conta_origem_id = cf.id AND t.estornada_em IS NULL
        AND date(t.data_transferencia) <= date('now')), 0)
`

export async function getContasFinanceiras(): Promise<ContaFinanceira[]> {
  const sessao = await exigirSessao()
  return db.prepare(`SELECT cf.id, cf.nome, cf.instituicao, cf.tipo, cf.saldo_inicial,
      cf.padrao_recebimento, cf.padrao_pagamento, cf.ativa,
      ROUND(${SALDO_SQL}, 2) AS saldo_atual
    FROM contas_financeiras cf
    WHERE cf.tenant_id = ? AND cf.ativa = 1
    ORDER BY cf.padrao_recebimento DESC, cf.nome`
  ).all(sessao.tenantId) as ContaFinanceira[]
}

export async function getTransferenciasFinanceiras(): Promise<TransferenciaFinanceira[]> {
  const sessao = await exigirSessao()
  return db.prepare(`SELECT t.id, t.conta_origem_id, t.conta_destino_id,
      origem.nome AS conta_origem, destino.nome AS conta_destino,
      t.valor, t.data_transferencia, t.descricao
    FROM transferencias_financeiras t
    JOIN contas_financeiras origem ON origem.id = t.conta_origem_id
    JOIN contas_financeiras destino ON destino.id = t.conta_destino_id
    WHERE t.tenant_id = ? AND t.estornada_em IS NULL
    ORDER BY date(t.data_transferencia) DESC, t.id DESC LIMIT 50`
  ).all(sessao.tenantId) as TransferenciaFinanceira[]
}

export async function atualizarSaldoInicial(contaId: number, saldoInicial: number) {
  try {
    const sessao = await exigirSessao()
    if (!Number.isSafeInteger(contaId) || contaId <= 0 || !Number.isFinite(saldoInicial) ||
        Math.abs(saldoInicial) > 100_000_000) {
      return { success: false, message: 'Saldo inicial inválido.' }
    }
    const result = db.prepare(`UPDATE contas_financeiras SET saldo_inicial = ?
      WHERE id = ? AND tenant_id = ? AND ativa = 1`).run(saldoInicial, contaId, sessao.tenantId)
    if (result.changes !== 1) return { success: false, message: 'Conta não encontrada.' }
    registrarAuditoria(db, {
      tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
      entidade: 'ContaFinanceira', entidadeId: contaId, acao: 'AJUSTAR_SALDO_INICIAL',
      descricao: `Saldo inicial ajustado para R$ ${saldoInicial.toFixed(2)}`,
    })
    revalidatePath('/financeiro')
    return { success: true, message: 'Saldo inicial atualizado.' }
  } catch (error) {
    console.error('[atualizarSaldoInicial]', error)
    return { success: false, message: 'Não foi possível atualizar o saldo inicial.' }
  }
}

export async function registrarTransferencia(data: {
  contaOrigemId: number
  contaDestinoId: number
  valor: number
  dataTransferencia: string
  descricao?: string
}) {
  try {
    const sessao = await exigirSessao()
    if (![data.contaOrigemId, data.contaDestinoId].every((id) => Number.isSafeInteger(id) && id > 0) ||
        data.contaOrigemId === data.contaDestinoId) {
      return { success: false, message: 'Escolha duas contas diferentes.' }
    }
    if (!Number.isFinite(data.valor) || data.valor <= 0 || data.valor > 100_000_000) {
      return { success: false, message: 'Valor da transferência inválido.' }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dataTransferencia)) {
      return { success: false, message: 'Data da transferência inválida.' }
    }
    const transferir = db.transaction(() => {
      const contas = db.prepare(`SELECT id, nome, ROUND(${SALDO_SQL}, 2) AS saldo_atual
        FROM contas_financeiras cf WHERE cf.tenant_id = ? AND cf.ativa = 1
          AND cf.id IN (?, ?)`
      ).all(sessao.tenantId, data.contaOrigemId, data.contaDestinoId) as Array<{
        id: number; nome: string; saldo_atual: number
      }>
      if (contas.length !== 2) throw new Error('ACCOUNTS')
      const origem = contas.find((conta) => conta.id === data.contaOrigemId)!
      const destino = contas.find((conta) => conta.id === data.contaDestinoId)!
      if (data.dataTransferencia <= new Date().toISOString().slice(0, 10) && origem.saldo_atual + 0.001 < data.valor) {
        throw new Error(`BALANCE:${origem.saldo_atual}`)
      }
      const result = db.prepare(`INSERT INTO transferencias_financeiras (
        tenant_id, usuario_id, conta_origem_id, conta_destino_id,
        valor, data_transferencia, descricao
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(sessao.tenantId, sessao.usuarioId, origem.id, destino.id, data.valor,
        data.dataTransferencia, data.descricao?.trim().slice(0, 300) || null)
      const id = Number(result.lastInsertRowid)
      registrarAuditoria(db, {
        tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'TransferenciaFinanceira', entidadeId: id, acao: 'CRIAR',
        descricao: `${origem.nome} → ${destino.nome} · R$ ${data.valor.toFixed(2)}`,
      })
    })
    try { transferir.immediate() } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === 'ACCOUNTS') return { success: false, message: 'Conta de origem ou destino não encontrada.' }
      if (message.startsWith('BALANCE:')) {
        const saldo = Number(message.split(':')[1])
        return { success: false, message: `Saldo insuficiente na conta de origem: R$ ${saldo.toFixed(2).replace('.', ',')}.` }
      }
      throw error
    }
    revalidatePath('/financeiro')
    return { success: true, message: 'Transferência registrada sem alterar receitas ou despesas.' }
  } catch (error) {
    console.error('[registrarTransferencia]', error)
    return { success: false, message: 'Não foi possível registrar a transferência.' }
  }
}

export async function estornarTransferencia(id: number) {
  try {
    const sessao = await exigirSessao()
    const result = db.prepare(`UPDATE transferencias_financeiras
      SET estornada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND tenant_id = ? AND estornada_em IS NULL`).run(id, sessao.tenantId)
    if (result.changes !== 1) return { success: false, message: 'Transferência não encontrada.' }
    registrarAuditoria(db, {
      tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
      entidade: 'TransferenciaFinanceira', entidadeId: id, acao: 'ESTORNAR',
      descricao: 'Transferência estornada',
    })
    revalidatePath('/financeiro')
    return { success: true, message: 'Transferência estornada.' }
  } catch (error) {
    console.error('[estornarTransferencia]', error)
    return { success: false, message: 'Não foi possível estornar a transferência.' }
  }
}
