'use server'

import db from '@/lib/db'
import { agruparVendasPorProduto } from '@/lib/relatorios.mjs'

const TENANT_ID = 1

export interface ResumoProduto {
  chave: string
  nome: string
  pedidos: number
  unidades: number
  clientes: number
  faturamento: number
  custo: number
  lucro: number
  margem_percentual: number
  receita_media_unidade: number
  ultima_venda: string
  ultimo_pedido_id: number
}

interface VendaProdutoRow {
  id: number
  nome_da_peca: string
  cliente_id: number
  quantidade: number
  valor_total_cobrado: number
  custo_total: number
  data_pedido: string
}

export async function getResumoProdutos(): Promise<ResumoProduto[]> {
  const vendas = db.prepare(`
    SELECT p.id, p.nome_da_peca, p.cliente_id, p.quantidade,
      p.valor_total_cobrado, p.data_pedido,
      p.custo_filamento + p.custo_insumos + p.custo_energia +
      p.valor_reserva_maquina + p.taxa_operacional + p.custo_embalagem +
      p.frete_pago + p.taxas_comissoes + p.custo_extra_real AS custo_total
    FROM pedidos p
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Aprovado'
      AND p.status != 'Cancelado'
    ORDER BY p.data_pedido DESC, p.id DESC
  `).all(TENANT_ID) as VendaProdutoRow[]

  return agruparVendasPorProduto(vendas) as ResumoProduto[]
}
