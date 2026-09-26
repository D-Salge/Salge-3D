'use server'

import db from '@/lib/db'
import { projetarFluxoCaixa } from '@/lib/fluxo-caixa.mjs'
import { listarCompetencias, vencimentoDaRecorrencia } from '@/lib/recorrencias.mjs'

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

  const recorrencias = db.prepare(`
    SELECT valor, dia_vencimento, inicia_em, termina_em, ativo
    FROM despesas_recorrentes WHERE tenant_id = ? AND ativo = 1
  `).all(TENANT_ID) as Array<{
    valor: number
    dia_vencimento: number
    inicia_em: string
    termina_em: string | null
    ativo: number
  }>
  const dataInicio = new Date(`${hoje}T12:00:00Z`)
  const proximoMes = new Date(Date.UTC(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth() + 1, 1))
  const ultimoMes = new Date(Date.UTC(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth() + 5, 1))
  const chave = (data: Date) => `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`
  const competenciasFuturas = listarCompetencias(chave(proximoMes), chave(ultimoMes))
  const despesasRecorrentes = recorrencias.flatMap((recorrencia) => competenciasFuturas
    .map((competencia) => {
      const vencimento = vencimentoDaRecorrencia(recorrencia, competencia)
      return vencimento ? { data: vencimento, tipo: 'Saida' as const, valor: recorrencia.valor } : null
    })
    .filter((movimento): movimento is { data: string; tipo: 'Saida'; valor: number } => movimento !== null))

  return projetarFluxoCaixa({
    saldoInicial: caixa.saldo,
    movimentos: [...contasReceber, ...contasPagar, ...capitalFuturo, ...despesasRecorrentes],
    inicio: hoje,
    meses: 6,
  }) as ProjecaoFluxoCaixa
}
