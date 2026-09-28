'use server'

import db from '@/lib/db'
import { criarUrlWhatsApp } from '@/lib/whatsapp.mjs'
import { calcularConversaoFunil, montarDreMensal, percentualMeta, ultimasCompetencias, variacaoPercentual } from '@/lib/relatorios.mjs'

const TENANT_ID = 1

export interface DreMensal {
  competencia: string
  pedidos: number
  receita: number
  custosPedidos: number
  lucroPedidos: number
  despesasAdministrativas: number
  comprasInvestimentos: number
  resultadoGerencial: number
  margem: number
}

export interface ClienteReativacao {
  id: number
  nome: string
  telefone: string | null
  ultima_compra: string
  dias_sem_comprar: number
  pedidos: number
  total_vendido: number
  whatsapp_url: string | null
}

export interface RelatorioGerencial {
  dre: DreMensal[]
  metas: {
    faturamento: { realizado: number; meta: number; percentual: number }
    lucro: { realizado: number; meta: number; percentual: number }
    pedidos: { realizado: number; meta: number; percentual: number }
  }
  comparacao: { receita: number; resultado: number; pedidos: number }
  funil: {
    rascunhos: number
    enviados: number
    aprovados: number
    recusados: number
    expirados: number
    conversao: number
    valorAberto: number
    valorPerdido: number
  }
  clientesInativos: ClienteReativacao[]
  diasClienteInativo: number
}

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export async function getRelatorioGerencial(): Promise<RelatorioGerencial> {
  const hoje = hojeSaoPaulo()
  const competencias = ultimasCompetencias(hoje, 12)
  const inicio = `${competencias[0]}-01`
  const vendas = db.prepare(`
    SELECT strftime('%Y-%m', COALESCE(data_conclusao, data_pedido)) AS competencia,
      COUNT(*) AS pedidos, COALESCE(SUM(valor_total_cobrado), 0) AS receita,
      COALESCE(SUM(
        custo_filamento + custo_insumos + custo_energia + valor_reserva_maquina +
        taxa_operacional + custo_embalagem + frete_pago + taxas_comissoes + custo_extra_real
      ), 0) AS custosPedidos
    FROM pedidos
    WHERE tenant_id = ? AND orcamento_status = 'Aprovado' AND status = 'Finalizado'
      AND date(COALESCE(data_conclusao, data_pedido)) >= date(?)
    GROUP BY competencia
  `).all(TENANT_ID, inicio) as Array<{ competencia: string; pedidos: number; receita: number; custosPedidos: number }>
  const despesas = db.prepare(`
    SELECT strftime('%Y-%m', COALESCE(competencia_em, data_despesa)) AS competencia,
      COALESCE(SUM(CASE WHEN categoria IN ('Marketing', 'Software', 'Outros') THEN valor ELSE 0 END), 0) AS despesasAdministrativas,
      COALESCE(SUM(CASE WHEN categoria NOT IN ('Marketing', 'Software', 'Outros') THEN valor ELSE 0 END), 0) AS comprasInvestimentos
    FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL
      AND date(COALESCE(competencia_em, data_despesa)) >= date(?)
    GROUP BY competencia
  `).all(TENANT_ID, inicio) as Array<{ competencia: string; despesasAdministrativas: number; comprasInvestimentos: number }>
  const dre = montarDreMensal(competencias, vendas, despesas) as DreMensal[]

  const config = db.prepare(`
    SELECT meta_mensal, meta_lucro_mensal, meta_pedidos_mensal, dias_cliente_inativo
    FROM tenants WHERE id = ?
  `).get(TENANT_ID) as { meta_mensal: number; meta_lucro_mensal: number; meta_pedidos_mensal: number; dias_cliente_inativo: number }
  const atual = dre.at(-1)!
  const anterior = dre.at(-2)!

  const funilRow = db.prepare(`
    SELECT
      SUM(CASE WHEN orcamento_status = 'Rascunho' THEN 1 ELSE 0 END) AS rascunhos,
      SUM(CASE WHEN orcamento_status = 'Enviado' THEN 1 ELSE 0 END) AS enviados,
      SUM(CASE WHEN orcamento_status = 'Aprovado' THEN 1 ELSE 0 END) AS aprovados,
      SUM(CASE WHEN orcamento_status = 'Recusado' THEN 1 ELSE 0 END) AS recusados,
      SUM(CASE WHEN orcamento_status = 'Expirado' THEN 1 ELSE 0 END) AS expirados,
      COALESCE(SUM(CASE WHEN orcamento_status IN ('Rascunho', 'Enviado') THEN valor_total_cobrado ELSE 0 END), 0) AS valor_aberto,
      COALESCE(SUM(CASE WHEN orcamento_status IN ('Recusado', 'Expirado') THEN valor_total_cobrado ELSE 0 END), 0) AS valor_perdido
    FROM pedidos WHERE tenant_id = ? AND date(data_pedido) >= date(?)
  `).get(TENANT_ID, inicio) as {
    rascunhos: number; enviados: number; aprovados: number; recusados: number; expirados: number
    valor_aberto: number; valor_perdido: number
  }

  const clientes = db.prepare(`
    SELECT c.id, c.nome, c.telefone,
      MAX(date(p.data_pedido)) AS ultima_compra,
      CAST(julianday(?) - julianday(MAX(date(p.data_pedido))) AS INTEGER) AS dias_sem_comprar,
      COUNT(p.id) AS pedidos,
      COALESCE(SUM(p.valor_total_cobrado), 0) AS total_vendido
    FROM clientes c
    JOIN pedidos p ON p.cliente_id = c.id AND p.tenant_id = c.tenant_id
      AND p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado'
    WHERE c.tenant_id = ? AND c.ativo = 1
    GROUP BY c.id
    HAVING date(MAX(p.data_pedido)) <= date(?, '-' || ? || ' days')
    ORDER BY dias_sem_comprar DESC, total_vendido DESC
    LIMIT 20
  `).all(hoje, TENANT_ID, hoje, config.dias_cliente_inativo) as Array<Omit<ClienteReativacao, 'whatsapp_url'>>

  return {
    dre,
    metas: {
      faturamento: { realizado: atual.receita, meta: config.meta_mensal, percentual: percentualMeta(atual.receita, config.meta_mensal) },
      lucro: { realizado: atual.resultadoGerencial, meta: config.meta_lucro_mensal, percentual: percentualMeta(atual.resultadoGerencial, config.meta_lucro_mensal) },
      pedidos: { realizado: atual.pedidos, meta: config.meta_pedidos_mensal, percentual: percentualMeta(atual.pedidos, config.meta_pedidos_mensal) },
    },
    comparacao: {
      receita: variacaoPercentual(atual.receita, anterior.receita),
      resultado: variacaoPercentual(atual.resultadoGerencial, anterior.resultadoGerencial),
      pedidos: variacaoPercentual(atual.pedidos, anterior.pedidos),
    },
    funil: {
      rascunhos: Number(funilRow.rascunhos || 0), enviados: Number(funilRow.enviados || 0),
      aprovados: Number(funilRow.aprovados || 0), recusados: Number(funilRow.recusados || 0),
      expirados: Number(funilRow.expirados || 0),
      conversao: calcularConversaoFunil(funilRow),
      valorAberto: Number(funilRow.valor_aberto || 0), valorPerdido: Number(funilRow.valor_perdido || 0),
    },
    clientesInativos: clientes.map((cliente) => ({
      ...cliente,
      whatsapp_url: criarUrlWhatsApp(
        cliente.telefone ?? '',
        `Olá, ${cliente.nome.trim().split(/\s+/)[0]}! Tudo bem? Faz um tempinho desde o seu último pedido com a Salge 3D. Estou com novos modelos e ideias personalizadas; posso te mostrar algumas opções?`,
      ),
    })),
    diasClienteInativo: config.dias_cliente_inativo,
  }
}
