import { arredondarMoeda, normalizarChaveTexto } from './orcamento.mjs'

/**
 * Agrupa pedidos aprovados pelo nome normalizado do produto.
 * Assim, diferenças de maiúsculas, acentos e espaços não criam produtos duplicados.
 *
 * @param {Array<{
 *   id: number,
 *   nome_da_peca: string,
 *   cliente_id: number,
 *   quantidade: number,
 *   valor_total_cobrado: number,
 *   custo_total: number,
 *   data_pedido: string
 * }>} vendas
 */
export function agruparVendasPorProduto(vendas) {
  const grupos = new Map()

  for (const venda of vendas) {
    const chave = normalizarChaveTexto(venda.nome_da_peca)
    if (!chave) continue
    const quantidade = Number.isFinite(venda.quantidade) && venda.quantidade > 0
      ? venda.quantidade
      : 1
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
      receita_media_unidade: grupo.unidades > 0
        ? arredondarMoeda(faturamento / grupo.unidades)
        : 0,
      ultima_venda: grupo.ultima_venda,
      ultimo_pedido_id: grupo.ultimo_pedido_id,
    }
  }).sort((a, b) => b.faturamento - a.faturamento || b.unidades - a.unidades)
}
