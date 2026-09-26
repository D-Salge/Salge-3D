'use server'

import db from '@/lib/db'
import { priorizarPendencias } from '@/lib/central-pendencias.mjs'
import { getResumoEstoque } from '@/app/actions/estoque'
import { getImpressoras } from '@/app/actions/operacao'
import { getPedidosComSaldoPendente } from '@/app/actions/recebimentos'

const TENANT_ID = 1

export interface PendenciaCentral {
  id: string
  tipo: 'Cobranca' | 'Despesa' | 'Producao' | 'Estoque' | 'Manutencao' | 'Orcamento'
  prioridade: 'Critica' | 'Alta' | 'Media'
  titulo: string
  descricao: string
  href: string
  dataReferencia: string | null
  valor: number | null
}

export async function getCentralPendencias(): Promise<PendenciaCentral[]> {
  const [parcelas, estoque, impressoras] = await Promise.all([
    getPedidosComSaldoPendente(),
    getResumoEstoque(),
    getImpressoras(),
  ])
  const pedidosAtrasados = db.prepare(`
    SELECT id, numero_orcamento, nome_da_peca, data_entrega
    FROM pedidos
    WHERE tenant_id = ? AND orcamento_status = 'Aprovado'
      AND status IN ('Fila', 'Imprimindo', 'Acabamento')
      AND data_entrega IS NOT NULL AND date(data_entrega) < date('now', 'localtime')
    ORDER BY date(data_entrega), id
  `).all(TENANT_ID) as Array<{ id: number; numero_orcamento: string | null; nome_da_peca: string; data_entrega: string }>
  const semImpressora = db.prepare(`
    SELECT id, numero_orcamento, nome_da_peca, data_entrega
    FROM pedidos
    WHERE tenant_id = ? AND orcamento_status = 'Aprovado'
      AND status IN ('Fila', 'Imprimindo') AND impressora_id IS NULL
    ORDER BY date(COALESCE(data_entrega, data_pedido)), id
  `).all(TENANT_ID) as Array<{ id: number; numero_orcamento: string | null; nome_da_peca: string; data_entrega: string | null }>
  const orcamentos = db.prepare(`
    SELECT id, numero_orcamento, nome_da_peca, validade_orcamento
    FROM pedidos
    WHERE tenant_id = ? AND orcamento_status = 'Enviado' AND validade_orcamento IS NOT NULL
      AND date(validade_orcamento) BETWEEN date('now', 'localtime') AND date('now', 'localtime', '+3 days')
    ORDER BY date(validade_orcamento), id
  `).all(TENANT_ID) as Array<{ id: number; numero_orcamento: string | null; nome_da_peca: string; validade_orcamento: string }>
  const despesasVencidas = db.prepare(`
    SELECT id, descricao, valor, vencimento_em
    FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL AND pago_em IS NULL
      AND vencimento_em IS NOT NULL AND date(vencimento_em) < date('now', 'localtime')
    ORDER BY date(vencimento_em), id
  `).all(TENANT_ID) as Array<{ id: number; descricao: string; valor: number; vencimento_em: string }>

  const pendencias: PendenciaCentral[] = []
  for (const parcela of parcelas.filter((item) => item.situacao === 'Atrasado')) {
    pendencias.push({
      id: `cobranca-${parcela.parcela_id}`, tipo: 'Cobranca', prioridade: 'Critica',
      titulo: `Cobrança vencida · ${parcela.cliente_nome}`,
      descricao: `${parcela.nome_da_peca} · parcela ${parcela.numero_parcela}/${parcela.total_parcelas}`,
      href: '/financeiro', dataReferencia: parcela.vencimento_em, valor: parcela.saldo_pendente,
    })
  }
  for (const pedido of pedidosAtrasados) {
    pendencias.push({
      id: `atraso-${pedido.id}`, tipo: 'Producao', prioridade: 'Critica',
      titulo: `Pedido atrasado · ${pedido.numero_orcamento ?? `#${pedido.id}`}`,
      descricao: pedido.nome_da_peca, href: `/pedidos/${pedido.id}`,
      dataReferencia: pedido.data_entrega, valor: null,
    })
  }
  for (const despesa of despesasVencidas) {
    pendencias.push({
      id: `despesa-${despesa.id}`, tipo: 'Despesa', prioridade: 'Critica',
      titulo: 'Conta a pagar vencida', descricao: despesa.descricao,
      href: '/financeiro', dataReferencia: despesa.vencimento_em, valor: despesa.valor,
    })
  }
  for (const impressora of impressoras.filter((item) => item.manutencao_status !== 'Em dia')) {
    pendencias.push({
      id: `manutencao-${impressora.id}`, tipo: 'Manutencao',
      prioridade: impressora.manutencao_status === 'Vencida' ? 'Critica' : 'Alta',
      titulo: `${impressora.nome} · manutenção ${impressora.manutencao_status.toLowerCase()}`,
      descricao: `${impressora.horas_desde_manutencao.toLocaleString('pt-BR')}h desde a última revisão`,
      href: '/impressoras', dataReferencia: null, valor: null,
    })
  }
  for (const item of estoque.alertas) {
    pendencias.push({
      id: `estoque-${item.tipo_item}-${item.item_id}`, tipo: 'Estoque', prioridade: 'Alta',
      titulo: `Repor ${item.nome}`,
      descricao: `Saldo projetado ${item.saldo_projetado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${item.unidade} · comprar ${item.volumes} volume(s)`,
      href: '/estoque', dataReferencia: null, valor: item.custo_estimado,
    })
  }
  for (const pedido of semImpressora) {
    pendencias.push({
      id: `sem-impressora-${pedido.id}`, tipo: 'Producao', prioridade: 'Alta',
      titulo: `Definir impressora · ${pedido.numero_orcamento ?? `#${pedido.id}`}`,
      descricao: pedido.nome_da_peca, href: `/pedidos/${pedido.id}`,
      dataReferencia: pedido.data_entrega, valor: null,
    })
  }
  for (const pedido of orcamentos) {
    pendencias.push({
      id: `orcamento-${pedido.id}`, tipo: 'Orcamento', prioridade: 'Media',
      titulo: `Orçamento vence em breve · ${pedido.numero_orcamento ?? `#${pedido.id}`}`,
      descricao: pedido.nome_da_peca, href: `/pedidos/${pedido.id}`,
      dataReferencia: pedido.validade_orcamento, valor: null,
    })
  }
  return priorizarPendencias(pendencias, 12) as PendenciaCentral[]
}
