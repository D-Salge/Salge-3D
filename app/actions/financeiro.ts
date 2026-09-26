'use server'

import db from '@/lib/db'
import { projetarFluxoCaixa } from '@/lib/fluxo-caixa.mjs'

const TENANT_ID = 1

export interface PeriodoFluxoCaixa {
  chave: string
  entradas: number
  saidas: number
  resultado: number
  saldo: number
}

export interface ProjecaoFluxoCaixa {
  saldoInicial: number
  periodos: PeriodoFluxoCaixa[]
  menorSaldo: number
}

export async function getProjecaoFluxoCaixa(): Promise<ProjecaoFluxoCaixa> {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const caixa = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(valor) FROM recebimentos
        WHERE tenant_id = ? AND estornado_em IS NULL AND date(data_recebimento) <= date(?)), 0) -
      COALESCE((SELECT SUM(valor) FROM despesas
        WHERE tenant_id = ? AND estornada_em IS NULL AND pago_em IS NOT NULL AND date(pago_em) <= date(?)), 0) +
      COALESCE((SELECT SUM(CASE WHEN tipo = 'Aporte' THEN valor ELSE -valor END) FROM fluxo_capital
        WHERE tenant_id = ? AND date(data_movimentacao) <= date(?)), 0) AS saldo
  `).get(TENANT_ID, hoje, TENANT_ID, hoje, TENANT_ID, hoje) as { saldo: number }

  const contasReceber = db.prepare(`
    SELECT pr.vencimento_em AS data, 'Entrada' AS tipo,
      pr.valor - COALESCE((
        SELECT SUM(ra.valor)
        FROM recebimento_alocacoes ra
        JOIN recebimentos r ON r.id = ra.recebimento_id
        WHERE ra.parcela_id = pr.id AND r.estornado_em IS NULL
      ), 0) AS valor
    FROM parcelas_receber pr
    JOIN pedidos p ON p.id = pr.pedido_id
    WHERE pr.tenant_id = ? AND pr.cancelada_em IS NULL
      AND p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado'
      AND pr.valor > COALESCE((
        SELECT SUM(ra.valor)
        FROM recebimento_alocacoes ra
        JOIN recebimentos r ON r.id = ra.recebimento_id
        WHERE ra.parcela_id = pr.id AND r.estornado_em IS NULL
      ), 0)
  `).all(TENANT_ID) as Array<{ data: string; tipo: 'Entrada'; valor: number }>

  const contasPagar = db.prepare(`
    SELECT COALESCE(vencimento_em, data_despesa) AS data, 'Saida' AS tipo, valor
    FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL AND pago_em IS NULL
  `).all(TENANT_ID) as Array<{ data: string; tipo: 'Saida'; valor: number }>

  const capitalFuturo = db.prepare(`
    SELECT data_movimentacao AS data,
      CASE WHEN tipo = 'Aporte' THEN 'Entrada' ELSE 'Saida' END AS tipo,
      valor
    FROM fluxo_capital
    WHERE tenant_id = ? AND date(data_movimentacao) > date(?)
  `).all(TENANT_ID, hoje) as Array<{ data: string; tipo: 'Entrada' | 'Saida'; valor: number }>

  return projetarFluxoCaixa({
    saldoInicial: caixa.saldo,
    movimentos: [...contasReceber, ...contasPagar, ...capitalFuturo],
    inicio: hoje,
    meses: 6,
  }) as ProjecaoFluxoCaixa
}
