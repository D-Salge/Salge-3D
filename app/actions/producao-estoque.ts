'use server'

import db from '@/lib/db'
import { exigirPerfil, exigirSessao } from '@/lib/session'
import {
  atualizarStatusOrdemProducaoEstoqueNoBanco,
  ajustarEstoqueProdutoAcabadoNoBanco,
  concluirOrdemProducaoEstoqueNoBanco,
  criarOrdemProducaoEstoqueNoBanco,
} from '@/lib/producao-estoque.mjs'
import { revalidatePath } from 'next/cache'

export type ActionResult = { success: boolean; message: string; ordemId?: number }

export interface ProducaoEstoqueDados {
  produtos: Array<{
    produto_id: number
    produto_nome: string
    codigo: string
    versao_id: number
    versao: number
    unidades_por_placa: number | null
    tempo_impressao_horas_unidade: number
    impressora_preferida_id: number | null
    itens: Array<{ tipo_item: 'Filamento' | 'Insumo'; item_id: number; nome: string; quantidade_por_unidade: number }>
  }>
  impressoras: Array<{ id: number; nome: string }>
  ordens: Array<{
    id: number; codigo: string; identificacao_lote: string; produto_nome: string; versao: number
    status: string; quantidade_planejada: number; quantidade_por_plate: number
    execucoes_planejadas: number; tempo_estimado_execucao_horas: number
    data_prevista: string | null; impressora_nome: string | null; custo_total_real: number | null
    custo_unitario_real: number | null; quantidade_aprovada: number | null; quantidade_reprovada: number | null
    filamentos: Array<{ filamento_id: number; nome: string; gramas_previstas: number; gramas_reais: number | null }>
    insumos: Array<{ insumo_id: number; nome: string; unidade: string; quantidade_prevista: number; quantidade_real: number | null }>
  }>
}

function revalidar() {
  for (const caminho of ['/producao', '/producao/estoque', '/estoque/produtos-acabados', '/produtos', '/orcamentos']) {
    revalidatePath(caminho)
  }
}

export async function getProducaoEstoqueDados(): Promise<ProducaoEstoqueDados> {
  const sessao = await exigirSessao()
  const produtosBase = db.prepare(`SELECT pc.id AS produto_id, pc.nome AS produto_nome, pc.codigo,
      pv.id AS versao_id, pv.versao, pv.unidades_por_placa, pv.tempo_impressao_horas_unidade,
      pv.impressora_preferida_id
    FROM produtos_catalogo pc JOIN produto_versoes pv ON pv.produto_id = pc.id AND pv.ativa = 1
    WHERE pc.tenant_id = ? AND pc.ativo = 1 ORDER BY pc.nome`).all(sessao.tenantId) as Omit<ProducaoEstoqueDados['produtos'][number], 'itens'>[]
  const buscarItens = db.prepare(`SELECT pvi.tipo_item, pvi.item_id, pvi.quantidade_por_unidade,
      CASE pvi.tipo_item WHEN 'Filamento' THEN (SELECT f.material || ' ' || f.cor FROM filamentos f WHERE f.id = pvi.item_id AND f.tenant_id = ?)
        ELSE (SELECT i.nome FROM insumos i WHERE i.id = pvi.item_id AND i.tenant_id = ?) END AS nome
    FROM produto_versao_itens pvi WHERE pvi.versao_id = ? ORDER BY pvi.tipo_item, pvi.id`)
  const ordensBase = db.prepare(`SELECT o.id, o.codigo, o.identificacao_lote, pc.nome AS produto_nome,
      pv.versao, o.status, o.quantidade_planejada, o.quantidade_por_plate, o.execucoes_planejadas,
      o.tempo_estimado_execucao_horas, o.data_prevista, imp.nome AS impressora_nome,
      o.custo_total_real, o.custo_unitario_real, o.quantidade_aprovada, o.quantidade_reprovada
    FROM ordens_producao_estoque o
    JOIN produtos_catalogo pc ON pc.id = o.produto_id AND pc.tenant_id = o.tenant_id
    JOIN produto_versoes pv ON pv.id = o.produto_versao_id
    LEFT JOIN impressoras imp ON imp.id = o.impressora_id AND imp.tenant_id = o.tenant_id
    WHERE o.tenant_id = ?
    ORDER BY CASE o.status WHEN 'Em produção' THEN 0 WHEN 'Conferência' THEN 1 WHEN 'Planejada' THEN 2 ELSE 3 END,
      o.criado_em DESC, o.id DESC`).all(sessao.tenantId) as Omit<ProducaoEstoqueDados['ordens'][number], 'filamentos' | 'insumos'>[]
  const buscarFilamentos = db.prepare(`SELECT ofi.filamento_id, f.material || ' ' || f.cor AS nome,
      ofi.gramas_previstas, ofi.gramas_reais FROM ordem_producao_estoque_filamentos ofi
    JOIN filamentos f ON f.id = ofi.filamento_id AND f.tenant_id = ofi.tenant_id
    WHERE ofi.ordem_id = ? AND ofi.tenant_id = ? ORDER BY ofi.id`)
  const buscarInsumos = db.prepare(`SELECT oi.insumo_id, i.nome, i.unidade,
      oi.quantidade_prevista, oi.quantidade_real FROM ordem_producao_estoque_insumos oi
    JOIN insumos i ON i.id = oi.insumo_id AND i.tenant_id = oi.tenant_id
    WHERE oi.ordem_id = ? AND oi.tenant_id = ? ORDER BY oi.id`)
  return {
    produtos: produtosBase.map(produto => ({ ...produto, itens: buscarItens.all(sessao.tenantId, sessao.tenantId, produto.versao_id) as ProducaoEstoqueDados['produtos'][number]['itens'] })),
    impressoras: db.prepare('SELECT id, nome FROM impressoras WHERE tenant_id = ? AND ativo = 1 ORDER BY nome').all(sessao.tenantId) as ProducaoEstoqueDados['impressoras'],
    ordens: ordensBase.map(ordem => ({
      ...ordem,
      filamentos: buscarFilamentos.all(ordem.id, sessao.tenantId) as ProducaoEstoqueDados['ordens'][number]['filamentos'],
      insumos: buscarInsumos.all(ordem.id, sessao.tenantId) as ProducaoEstoqueDados['ordens'][number]['insumos'],
    })),
  }
}

export async function criarOrdemProducaoEstoque(data: {
  produtoId: number; produtoVersaoId: number; quantidadePlanejada: number
  impressoraId: number | null; dataPrevista: string; identificacaoLote: string
  quantidadePorPlate: number; execucoesPlanejadas: number; tempoEstimadoExecucaoHoras: number
  filamentos: Array<{ filamentoId: number; gramasPrevistas: number }>
  insumos: Array<{ insumoId: number; quantidadePrevista: number }>
  observacoes: string; arquivosReferencia: string
}): Promise<ActionResult> {
  try {
    const sessao = await exigirPerfil(['admin', 'operador'])
    const resultado = criarOrdemProducaoEstoqueNoBanco(db, sessao, data)
    revalidar()
    return { success: true, message: `Ordem ${resultado.codigo} criada sem movimentação financeira.`, ordemId: resultado.ordemId }
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    if (codigo === 'UNAUTHORIZED') return { success: false, message: 'Sua sessão expirou. Entre novamente.' }
    if (codigo === 'FORBIDDEN') return { success: false, message: 'Seu perfil não permite criar ordens internas.' }
    if (codigo === 'INVALID_INPUT') return { success: false, message: 'Revise os dados técnicos da ordem.' }
    if (codigo === 'PRODUCT_NOT_FOUND') return { success: false, message: 'Produto ou versão não pertence à sua empresa.' }
    if (codigo === 'PRINTER_NOT_FOUND') return { success: false, message: 'Impressora não encontrada.' }
    if (codigo === 'MATERIAL_NOT_FOUND') return { success: false, message: 'Um material não pertence à sua empresa ou está inativo.' }
    if (codigo.includes('UNIQUE constraint failed')) return { success: false, message: 'A identificação desse lote já está em uso.' }
    console.error('[criarOrdemProducaoEstoque]', error)
    return { success: false, message: 'Não foi possível criar a ordem interna.' }
  }
}

export async function atualizarStatusOrdemProducaoEstoque(ordemId: number, status: string): Promise<ActionResult> {
  try {
    const sessao = await exigirPerfil(['admin', 'operador'])
    const resultado = atualizarStatusOrdemProducaoEstoqueNoBanco(db, sessao, ordemId, status)
    revalidar()
    return { success: true, message: resultado === 'UNCHANGED' ? 'A ordem já está nesse estado.' : `Ordem movida para ${status}.` }
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    if (codigo === 'UNAUTHORIZED') return { success: false, message: 'Sua sessão expirou. Entre novamente.' }
    if (codigo === 'FORBIDDEN') return { success: false, message: 'Seu perfil não permite alterar a produção.' }
    if (codigo === 'NOT_FOUND') return { success: false, message: 'Ordem não encontrada.' }
    if (codigo === 'INVALID_TRANSITION') return { success: false, message: 'Essa transição não é permitida.' }
    return { success: false, message: 'Não foi possível alterar a ordem.' }
  }
}

export async function concluirOrdemProducaoEstoque(data: {
  ordemId: number; operacaoId: string; quantidadeFabricada: number; quantidadeAprovada: number
  quantidadeReprovada: number; tempoRealHoras: number; horasTrabalhoReal: number
  filamentos: Array<{ filamentoId: number; gramasReais: number }>
  insumos: Array<{ insumoId: number; quantidadeReal: number }>
  desperdiciosObservacoes: string; falhas: number; custosAdicionais: number
}): Promise<ActionResult> {
  try {
    const sessao = await exigirPerfil(['admin', 'operador'])
    const resultado = concluirOrdemProducaoEstoqueNoBanco(db, sessao, data)
    revalidar()
    return { success: true, message: resultado.resultado === 'UNCHANGED'
      ? 'Essa conclusão já havia sido processada.'
      : resultado.loteId === null
        ? `Perda total registrada. Custo real consumido: ${resultado.custoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
        : `Produção concluída. Custo unitário real: ${resultado.custoUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` }
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    if (codigo === 'UNAUTHORIZED') return { success: false, message: 'Sua sessão expirou. Entre novamente.' }
    if (codigo === 'FORBIDDEN') return { success: false, message: 'Seu perfil não permite concluir produções.' }
    if (codigo === 'NOT_FOUND') return { success: false, message: 'Ordem não encontrada.' }
    if (codigo === 'INVALID_INPUT') return { success: false, message: 'As quantidades fabricada, aprovada e reprovada estão inconsistentes.' }
    if (codigo === 'INVALID_TRANSITION') return { success: false, message: 'Leve a ordem à conferência; perdas totais podem ser registradas após o início.' }
    if (codigo === 'ALREADY_COMPLETED') return { success: false, message: 'A ordem já foi concluída por outra operação.' }
    if (codigo === 'MATERIAL_NOT_FOUND') return { success: false, message: 'Os consumos devem usar os materiais previstos da ordem.' }
    if (codigo.startsWith('INSUFFICIENT_STOCK:')) return { success: false, message: `Estoque insuficiente de ${codigo.slice('INSUFFICIENT_STOCK:'.length)}. Nenhum efeito foi gravado.` }
    if (codigo === 'STOCK_CHANGED' || codigo === 'STATUS_CHANGED') return { success: false, message: 'Os dados mudaram durante a conclusão. Nenhum efeito parcial foi mantido.' }
    console.error('[concluirOrdemProducaoEstoque]', error)
    return { success: false, message: 'Não foi possível concluir a produção.' }
  }
}

export interface EstoqueProdutoAcabado {
  produto_id: number; produto_versao_id: number; codigo: string; produto_nome: string; versao: number
  saldo_fisico: number; reservado: number; disponivel: number; custo_medio: number; valor_estoque: number
  lotes: Array<{ id: number; codigo: string; fabricado_em: string; custo_unitario: number; saldo_fisico: number; reservado: number; disponivel: number }>
}

export async function getEstoqueProdutosAcabados(): Promise<{ produtos: EstoqueProdutoAcabado[]; movimentos: Array<Record<string, unknown>> }> {
  const sessao = await exigirSessao()
  const lotes = db.prepare(`SELECT l.id, l.produto_id, l.produto_versao_id, l.codigo, l.fabricado_em,
      l.custo_unitario, pc.codigo AS produto_codigo, pc.nome AS produto_nome, pv.versao,
      COALESCE(SUM(CASE m.tipo WHEN 'Entrada' THEN m.quantidade WHEN 'Devolução' THEN m.quantidade WHEN 'Ajuste entrada' THEN m.quantidade
        WHEN 'Saída' THEN -m.quantidade WHEN 'Perda' THEN -m.quantidade WHEN 'Ajuste saída' THEN -m.quantidade ELSE 0 END), 0) AS saldo_fisico,
      COALESCE(SUM(CASE m.tipo WHEN 'Entrada' THEN m.custo_total_centavos WHEN 'Devolução' THEN m.custo_total_centavos
        WHEN 'Ajuste entrada' THEN m.custo_total_centavos WHEN 'Saída' THEN -m.custo_total_centavos
        WHEN 'Perda' THEN -m.custo_total_centavos WHEN 'Ajuste saída' THEN -m.custo_total_centavos ELSE 0 END), 0) AS saldo_custo_centavos,
      COALESCE((SELECT SUM(r.quantidade_reservada - r.quantidade_saida) FROM reservas_produtos_acabados r
        WHERE r.lote_id = l.id AND r.tenant_id = l.tenant_id AND r.liberada_em IS NULL), 0) AS reservado
    FROM lotes_produtos_acabados l
    JOIN produtos_catalogo pc ON pc.id = l.produto_id AND pc.tenant_id = l.tenant_id
    JOIN produto_versoes pv ON pv.id = l.produto_versao_id AND pv.produto_id = pc.id
    LEFT JOIN movimentos_produtos_acabados m ON m.lote_id = l.id AND m.tenant_id = l.tenant_id
    WHERE l.tenant_id = ? GROUP BY l.id ORDER BY pc.nome, l.fabricado_em, l.id`).all(sessao.tenantId) as Array<{
      id: number; produto_id: number; produto_versao_id: number; codigo: string; fabricado_em: string
      custo_unitario: number; produto_codigo: string; produto_nome: string; versao: number
      saldo_fisico: number; saldo_custo_centavos: number; reservado: number
    }>
  const agrupados = new Map<string, EstoqueProdutoAcabado>()
  for (const lote of lotes) {
    const chave = `${lote.produto_id}:${lote.produto_versao_id}`
    const produto = agrupados.get(chave) ?? {
      produto_id: lote.produto_id, produto_versao_id: lote.produto_versao_id,
      codigo: lote.produto_codigo, produto_nome: lote.produto_nome, versao: lote.versao,
      saldo_fisico: 0, reservado: 0, disponivel: 0, custo_medio: 0, valor_estoque: 0, lotes: [],
    }
    const disponivel = lote.saldo_fisico - lote.reservado
    produto.saldo_fisico += lote.saldo_fisico
    produto.reservado += lote.reservado
    produto.disponivel += disponivel
    const custoUnitarioAtual = lote.saldo_fisico > 0 ? lote.saldo_custo_centavos / 100 / lote.saldo_fisico : 0
    produto.valor_estoque += lote.saldo_custo_centavos / 100
    produto.lotes.push({ id: lote.id, codigo: lote.codigo, fabricado_em: lote.fabricado_em,
      custo_unitario: custoUnitarioAtual, saldo_fisico: lote.saldo_fisico, reservado: lote.reservado, disponivel })
    produto.custo_medio = produto.saldo_fisico > 0 ? produto.valor_estoque / produto.saldo_fisico : 0
    agrupados.set(chave, produto)
  }
  const movimentos = db.prepare(`SELECT m.id, m.tipo, m.quantidade, m.custo_unitario, m.custo_total,
      m.motivo, m.criado_em, m.pedido_id, l.codigo AS lote_codigo, pc.nome AS produto_nome
    FROM movimentos_produtos_acabados m JOIN lotes_produtos_acabados l ON l.id = m.lote_id AND l.tenant_id = m.tenant_id
    JOIN produtos_catalogo pc ON pc.id = l.produto_id AND pc.tenant_id = m.tenant_id
    WHERE m.tenant_id = ? ORDER BY m.criado_em DESC, m.id DESC LIMIT 200`).all(sessao.tenantId) as Array<Record<string, unknown>>
  return { produtos: [...agrupados.values()], movimentos }
}

export async function getProdutosAcabadosParaVenda(pedidoIgnoradoId?: number): Promise<Array<{
  produto_id: number; produto_versao_id: number; nome: string; versao: number
  disponivel: number; custo_unitario_referencia: number; preco_base_unitario: number
}>> {
  const sessao = await exigirSessao()
  const ignorarPedido = Number.isSafeInteger(pedidoIgnoradoId) && Number(pedidoIgnoradoId) > 0
    ? Number(pedidoIgnoradoId) : -1
  return db.prepare(`WITH saldos AS (
      SELECT l.produto_id, l.produto_versao_id,
        COALESCE(SUM(CASE m.tipo WHEN 'Entrada' THEN m.quantidade WHEN 'Devolução' THEN m.quantidade WHEN 'Ajuste entrada' THEN m.quantidade
          WHEN 'Saída' THEN -m.quantidade WHEN 'Perda' THEN -m.quantidade WHEN 'Ajuste saída' THEN -m.quantidade ELSE 0 END), 0) -
        COALESCE((SELECT SUM(r.quantidade_reservada - r.quantidade_saida) FROM reservas_produtos_acabados r
          WHERE r.lote_id = l.id AND r.tenant_id = l.tenant_id AND r.liberada_em IS NULL
            AND r.pedido_id <> ?), 0) AS disponivel,
        COALESCE(SUM(CASE m.tipo WHEN 'Entrada' THEN m.custo_total_centavos WHEN 'Devolução' THEN m.custo_total_centavos
          WHEN 'Ajuste entrada' THEN m.custo_total_centavos WHEN 'Saída' THEN -m.custo_total_centavos
          WHEN 'Perda' THEN -m.custo_total_centavos WHEN 'Ajuste saída' THEN -m.custo_total_centavos ELSE 0 END), 0) AS saldo_custo_centavos,
        COALESCE(SUM(CASE m.tipo WHEN 'Entrada' THEN m.quantidade WHEN 'Devolução' THEN m.quantidade WHEN 'Ajuste entrada' THEN m.quantidade
          WHEN 'Saída' THEN -m.quantidade WHEN 'Perda' THEN -m.quantidade WHEN 'Ajuste saída' THEN -m.quantidade ELSE 0 END), 0) AS saldo_fisico
      FROM lotes_produtos_acabados l LEFT JOIN movimentos_produtos_acabados m
        ON m.lote_id = l.id AND m.tenant_id = l.tenant_id
      WHERE l.tenant_id = ? GROUP BY l.id
    ) SELECT pc.id AS produto_id, pv.id AS produto_versao_id, pc.nome, pv.versao,
      SUM(s.disponivel) AS disponivel,
      CASE WHEN SUM(s.disponivel) > 0 THEN SUM(CASE WHEN s.saldo_fisico > 0
        THEN s.disponivel * s.saldo_custo_centavos / 100.0 / s.saldo_fisico ELSE 0 END) / SUM(s.disponivel) ELSE 0 END AS custo_unitario_referencia,
      pv.preco_base_unitario
    FROM saldos s JOIN produtos_catalogo pc ON pc.id = s.produto_id AND pc.tenant_id = ?
    JOIN produto_versoes pv ON pv.id = s.produto_versao_id
    GROUP BY pc.id, pv.id HAVING SUM(s.disponivel) > 0 ORDER BY pc.nome, pv.versao DESC`).all(ignorarPedido, sessao.tenantId, sessao.tenantId) as Array<{
      produto_id: number; produto_versao_id: number; nome: string; versao: number
      disponivel: number; custo_unitario_referencia: number; preco_base_unitario: number
    }>
}

export async function ajustarEstoqueProdutoAcabado(data: {
  loteId: number; tipo: 'Perda' | 'Ajuste entrada' | 'Ajuste saída'; quantidade: number; motivo: string; operacaoId: string
}): Promise<ActionResult> {
  try {
    const sessao = await exigirPerfil(['admin', 'operador'])
    const resultado = ajustarEstoqueProdutoAcabadoNoBanco(db, sessao, data)
    revalidar()
    return { success: true, message: resultado === 'UNCHANGED' ? 'Esse ajuste já havia sido processado.' : 'Movimento registrado com rastreabilidade.' }
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    if (codigo === 'UNAUTHORIZED') return { success: false, message: 'Sua sessão expirou. Entre novamente.' }
    if (codigo === 'FORBIDDEN') return { success: false, message: 'Seu perfil não permite ajustar o estoque.' }
    if (codigo === 'NOT_FOUND') return { success: false, message: 'Lote não encontrado.' }
    if (codigo === 'INSUFFICIENT_FINISHED_STOCK') return { success: false, message: 'O ajuste excede o saldo disponível não reservado.' }
    if (codigo === 'INVALID_INPUT') return { success: false, message: 'Informe tipo, quantidade e motivo válidos.' }
    console.error('[ajustarEstoqueProdutoAcabado]', error)
    return { success: false, message: 'Não foi possível ajustar o estoque acabado.' }
  }
}

