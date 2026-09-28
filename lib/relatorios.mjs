import { arredondarMoeda, normalizarChaveTexto } from './orcamento.mjs'

/** Agrupa pedidos aprovados pelo nome normalizado, preservando a análise de produtos existente. */
export function agruparVendasPorProduto(vendas) {
  const grupos = new Map()
  for (const venda of vendas) {
    const chave = normalizarChaveTexto(venda.nome_da_peca)
    if (!chave) continue
    const quantidade = Number.isFinite(venda.quantidade) && venda.quantidade > 0 ? venda.quantidade : 1
    const existente = grupos.get(chave) ?? {
      chave,
      nome: venda.nome_da_peca.trim(),
      pedidos: 0,
      unidades: 0,
      faturamento: 0,
      custo: 0,
      clientes: new Set(),
      ultima_venda: venda.data_pedido,
      ultimo_pedido_id: venda.id,
    }
    existente.pedidos += 1
    existente.unidades += quantidade
    existente.faturamento += venda.valor_total_cobrado
    existente.custo += venda.custo_total
    existente.clientes.add(venda.cliente_id)
    if (venda.data_pedido > existente.ultima_venda) {
      existente.ultima_venda = venda.data_pedido
      existente.ultimo_pedido_id = venda.id
      existente.nome = venda.nome_da_peca.trim()
    }
    grupos.set(chave, existente)
  }
  return Array.from(grupos.values()).map((grupo) => {
    const faturamento = arredondarMoeda(grupo.faturamento)
    const custo = arredondarMoeda(grupo.custo)
    const lucro = arredondarMoeda(faturamento - custo)
    return {
      chave: grupo.chave,
      nome: grupo.nome,
      pedidos: grupo.pedidos,
      unidades: grupo.unidades,
      clientes: grupo.clientes.size,
      faturamento,
      custo,
      lucro,
      margem_percentual: faturamento > 0 ? (lucro / faturamento) * 100 : 0,
      receita_media_unidade: grupo.unidades > 0 ? arredondarMoeda(faturamento / grupo.unidades) : 0,
      ultima_venda: grupo.ultima_venda,
      ultimo_pedido_id: grupo.ultimo_pedido_id,
    }
  }).sort((a, b) => b.faturamento - a.faturamento || b.unidades - a.unidades)
}

function arredondar(valor, casas = 2) {
  const fator = 10 ** casas
  return Math.round((Number(valor || 0) + Number.EPSILON) * fator) / fator
}

export function ultimasCompetencias(dataIso, quantidade = 12) {
  const data = new Date(`${String(dataIso).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(data.getTime()) || quantidade < 1) return []
  const meses = []
  for (let indice = quantidade - 1; indice >= 0; indice -= 1) {
    const mes = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() - indice, 1))
    meses.push(`${mes.getUTCFullYear()}-${String(mes.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return meses
}

export function montarDreMensal(competencias, vendas, despesas) {
  const vendasPorMes = new Map(vendas.map((item) => [item.competencia, item]))
  const despesasPorMes = new Map(despesas.map((item) => [item.competencia, item]))
  return competencias.map((competencia) => {
    const venda = vendasPorMes.get(competencia) ?? {}
    const despesa = despesasPorMes.get(competencia) ?? {}
    const receita = Number(venda.receita || 0)
    const custosPedidos = Number(venda.custosPedidos || 0)
    const lucroPedidos = receita - custosPedidos
    const despesasAdministrativas = Number(despesa.despesasAdministrativas || 0)
    const comprasInvestimentos = Number(despesa.comprasInvestimentos || 0)
    const resultadoGerencial = lucroPedidos - despesasAdministrativas
    return {
      competencia,
      pedidos: Number(venda.pedidos || 0),
      receita: arredondar(receita),
      custosPedidos: arredondar(custosPedidos),
      lucroPedidos: arredondar(lucroPedidos),
      despesasAdministrativas: arredondar(despesasAdministrativas),
      comprasInvestimentos: arredondar(comprasInvestimentos),
      resultadoGerencial: arredondar(resultadoGerencial),
      margem: receita > 0 ? arredondar((resultadoGerencial / receita) * 100, 1) : 0,
    }
  })
}

export function percentualMeta(realizado, meta) {
  const alvo = Number(meta || 0)
  if (alvo <= 0) return 0
  return arredondar(Math.max(0, Number(realizado || 0)) / alvo * 100, 1)
}

export function variacaoPercentual(atual, anterior) {
  const base = Number(anterior || 0)
  if (base === 0) return Number(atual || 0) === 0 ? 0 : 100
  return arredondar(((Number(atual || 0) - base) / Math.abs(base)) * 100, 1)
}

export function calcularConversaoFunil({ aprovados = 0, recusados = 0, expirados = 0 }) {
  const decididos = Number(aprovados) + Number(recusados) + Number(expirados)
  return decididos > 0 ? arredondar((Number(aprovados) / decididos) * 100, 1) : 0
}
