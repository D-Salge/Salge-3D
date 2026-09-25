function arredondar(valor, casas = 3) {
  const fator = 10 ** casas
  return Math.round((valor + Number.EPSILON) * fator) / fator
}

export const CONSULTA_ITENS_REPOSICAO = `
  SELECT 'Filamento' AS tipo_item, f.id AS item_id,
    f.material || ' ' || f.cor AS nome,
    COALESCE(f.estoque_gramas, f.peso_rolo_gramas) AS saldo,
    f.estoque_minimo_gramas AS minimo, 'g' AS unidade,
    COALESCE((
      SELECT SUM(COALESCE(pf.consumo_real_gramas, pf.peso_gasto_gramas))
      FROM pedido_filamentos pf
      JOIN pedidos p ON p.id = pf.pedido_id
      WHERE pf.filamento_id = f.id AND p.tenant_id = f.tenant_id
        AND p.orcamento_status = 'Aprovado'
        AND p.status IN ('Fila', 'Imprimindo', 'Acabamento')
    ), 0) AS comprometido,
    f.peso_rolo_gramas AS volume_reposicao,
    f.preco_rolo AS preco_volume,
    f.fornecedor
  FROM filamentos f
  WHERE f.tenant_id = ? AND f.ativo = 1
  UNION ALL
  SELECT 'Insumo', i.id, i.nome, i.estoque_atual, i.estoque_minimo, i.unidade,
    COALESCE((
      SELECT SUM(COALESCE(pi.consumo_real, pi.quantidade))
      FROM pedido_insumos pi
      JOIN pedidos p ON p.id = pi.pedido_id
      WHERE pi.insumo_id = i.id AND p.tenant_id = i.tenant_id
        AND p.orcamento_status = 'Aprovado'
        AND p.status IN ('Fila', 'Imprimindo', 'Acabamento')
    ), 0),
    1, i.custo_unitario, NULL
  FROM insumos i
  WHERE i.tenant_id = ? AND i.ativo = 1 AND i.estoque_minimo > 0
  ORDER BY saldo ASC
`

/**
 * Calcula a reposição necessária depois de reservar o consumo dos pedidos
 * aprovados que ainda não foram finalizados.
 */
export function calcularSugestaoReposicao(item) {
  const saldo = Number(item.saldo) || 0
  const minimo = Number(item.minimo) || 0
  const comprometido = Number(item.comprometido) || 0
  const saldoProjetado = arredondar(saldo - comprometido)

  if (saldoProjetado > minimo) {
    return { saldoProjetado, quantidadeRepor: 0, volumes: 0, custoEstimado: 0 }
  }

  if (item.tipo_item === 'Filamento') {
    const pesoRolo = Math.max(Number(item.volume_reposicao) || 0, 1)
    const deficit = Math.max(0, minimo - saldoProjetado)
    const volumes = Math.max(1, Math.ceil(deficit / pesoRolo))
    return {
      saldoProjetado,
      quantidadeRepor: arredondar(volumes * pesoRolo),
      volumes,
      custoEstimado: arredondar(volumes * (Number(item.preco_volume) || 0), 2),
    }
  }

  const quantidadeRepor = arredondar(Math.max(0, minimo * 2 - saldoProjetado))
  return {
    saldoProjetado,
    quantidadeRepor,
    volumes: quantidadeRepor > 0 ? 1 : 0,
    custoEstimado: arredondar(quantidadeRepor * (Number(item.preco_volume) || 0), 2),
  }
}

export function resumirListaCompras(itens) {
  return itens.reduce((resumo, item) => {
    resumo.itens += 1
    resumo.investimento = arredondar(resumo.investimento + Number(item.custo_estimado || 0), 2)
    return resumo
  }, { itens: 0, investimento: 0 })
}
