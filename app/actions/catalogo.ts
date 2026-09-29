'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { normalizarNomeProduto } from '@/lib/catalogo.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface ItemFichaTecnica {
  id?: number
  tipo_item: 'Filamento' | 'Insumo'
  item_id: number
  item_nome: string
  unidade: string
  quantidade_por_unidade: number
  custo_unitario: number
}

export interface ProdutoCatalogo {
  id: number
  codigo: string
  nome: string
  categoria: string | null
  descricao: string | null
  versao_id: number | null
  versao: number | null
  preco_base_unitario: number
  tempo_impressao_horas_unidade: number
  observacoes_versao: string | null
  impressora_preferida_id: number | null
  impressora_preferida_nome: string | null
  diametro_bico_mm: number | null
  altura_camada_mm: number | null
  unidades_por_placa: number | null
  perfil_fatiamento: string | null
  placa_referencia: string | null
  total_versoes: number
  total_pedidos: number
  unidades_vendidas: number
  preco_medio_vendido: number
  tempo_real_medio_unidade: number
  pedidos_com_falha: number
  itens: ItemFichaTecnica[]
  checklist: Array<{ id: number; etapa: 'Produção' | 'Qualidade'; texto: string; ordem: number }>
}

export interface CatalogoDados {
  produtos: ProdutoCatalogo[]
  impressoras: Array<{ id: number; nome: string; modelo: string | null; bico_atual: string | null }>
  materiais: Array<{
    tipo_item: 'Filamento' | 'Insumo'
    item_id: number
    nome: string
    unidade: string
    custo_unitario: number
  }>
}

export interface ProdutoCatalogoInput {
  nome: string
  categoria: string
  descricao: string
  precoBaseUnitario: number
  tempoImpressaoHorasUnidade: number
  observacoesVersao: string
  impressoraPreferidaId: number | null
  diametroBicoMm: number | null
  alturaCamadaMm: number | null
  unidadesPorPlaca: number | null
  perfilFatiamento: string
  placaReferencia: string
  itens: Array<{ tipoItem: 'Filamento' | 'Insumo'; itemId: number; quantidadePorUnidade: number }>
}

type ActionResult = { success: boolean; message: string }

export async function getCatalogoDados(): Promise<CatalogoDados> {
  const produtos = db.prepare(`
    SELECT pc.id, pc.codigo, pc.nome, pc.categoria, pc.descricao,
      pv.id AS versao_id, pv.versao,
      COALESCE(pv.preco_base_unitario, 0) AS preco_base_unitario,
      COALESCE(pv.tempo_impressao_horas_unidade, 0) AS tempo_impressao_horas_unidade,
      pv.observacoes AS observacoes_versao,
      pv.impressora_preferida_id, imp.nome AS impressora_preferida_nome,
      pv.diametro_bico_mm, pv.altura_camada_mm, pv.unidades_por_placa,
      pv.perfil_fatiamento, pv.placa_referencia,
      (SELECT COUNT(*) FROM produto_versoes todas WHERE todas.produto_id = pc.id) AS total_versoes,
      COUNT(DISTINCT p.id) AS total_pedidos,
      COALESCE(SUM(CASE WHEN p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado' THEN p.quantidade ELSE 0 END), 0) AS unidades_vendidas,
      COALESCE(ROUND(AVG(CASE WHEN p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado'
        THEN COALESCE(p.preco_unitario, p.valor_total_cobrado / MAX(p.quantidade, 1)) END), 2), 0) AS preco_medio_vendido,
      COALESCE(ROUND(
        SUM(CASE WHEN p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado' AND p.tempo_real_horas IS NOT NULL THEN p.tempo_real_horas ELSE 0 END) /
        NULLIF(SUM(CASE WHEN p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado' AND p.tempo_real_horas IS NOT NULL THEN p.quantidade ELSE 0 END), 0)
      , 2), 0) AS tempo_real_medio_unidade,
      COUNT(DISTINCT CASE WHEN p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado' AND p.falhas_impressao > 0 THEN p.id END) AS pedidos_com_falha
    FROM produtos_catalogo pc
    LEFT JOIN produto_versoes pv ON pv.produto_id = pc.id AND pv.ativa = 1
    LEFT JOIN impressoras imp ON imp.id = pv.impressora_preferida_id AND imp.tenant_id = pc.tenant_id
    LEFT JOIN pedidos p ON p.produto_id = pc.id AND p.tenant_id = pc.tenant_id
    WHERE pc.tenant_id = ? AND pc.ativo = 1
    GROUP BY pc.id, pv.id
    ORDER BY pc.nome
  `).all(TENANT_ID) as Array<Omit<ProdutoCatalogo, 'itens' | 'checklist'>>

  const buscarItens = db.prepare(`
    SELECT pvi.id, pvi.tipo_item, pvi.item_id, pvi.quantidade_por_unidade,
      CASE pvi.tipo_item WHEN 'Filamento' THEN
        COALESCE((SELECT f.material || ' ' || f.cor FROM filamentos f WHERE f.id = pvi.item_id), 'Filamento removido')
      ELSE COALESCE((SELECT i.nome FROM insumos i WHERE i.id = pvi.item_id), 'Insumo removido') END AS item_nome,
      CASE pvi.tipo_item WHEN 'Filamento' THEN 'g'
      ELSE COALESCE((SELECT i.unidade FROM insumos i WHERE i.id = pvi.item_id), 'unid') END AS unidade,
      CASE pvi.tipo_item WHEN 'Filamento' THEN COALESCE((
        SELECT f.preco_rolo / f.peso_rolo_gramas FROM filamentos f WHERE f.id = pvi.item_id
      ), 0) ELSE COALESCE((SELECT i.custo_unitario FROM insumos i WHERE i.id = pvi.item_id), 0) END AS custo_unitario
    FROM produto_versao_itens pvi WHERE pvi.versao_id = ? ORDER BY pvi.tipo_item, pvi.id
  `)
  const buscarChecklist = db.prepare(`SELECT id, etapa, texto, ordem
    FROM produto_checklist_itens WHERE tenant_id = ? AND produto_id = ? AND ativo = 1
    ORDER BY CASE etapa WHEN 'Produção' THEN 0 ELSE 1 END, ordem, id`)

  const materiais = db.prepare(`
    SELECT 'Filamento' AS tipo_item, id AS item_id, material || ' ' || cor AS nome,
      'g' AS unidade, preco_rolo / peso_rolo_gramas AS custo_unitario
    FROM filamentos WHERE tenant_id = ? AND ativo = 1
    UNION ALL
    SELECT 'Insumo', id, nome, unidade, custo_unitario
    FROM insumos WHERE tenant_id = ? AND ativo = 1
    ORDER BY tipo_item, nome
  `).all(TENANT_ID, TENANT_ID) as CatalogoDados['materiais']

  const impressoras = db.prepare(`SELECT id, nome, modelo, bico_atual FROM impressoras
    WHERE tenant_id = ? AND ativo = 1 ORDER BY nome`).all(TENANT_ID) as CatalogoDados['impressoras']

  return {
    produtos: produtos.map(produto => ({
      ...produto,
      itens: produto.versao_id ? buscarItens.all(produto.versao_id) as ItemFichaTecnica[] : [],
      checklist: buscarChecklist.all(TENANT_ID, produto.id) as ProdutoCatalogo['checklist'],
    })),
    materiais,
    impressoras,
  }
}

export async function salvarProdutoCatalogo(id: number | null, data: ProdutoCatalogoInput): Promise<ActionResult> {
  try {
    const nome = data.nome.trim()
    const nomeChave = normalizarNomeProduto(nome)
    if (!nome || nome.length > 160) return { success: false, message: 'Informe um nome de produto válido.' }
    if (!nomeChave) return { success: false, message: 'Nome de produto inválido.' }
    if (data.categoria.length > 80 || data.descricao.length > 1000 || data.observacoesVersao.length > 1000 ||
        data.perfilFatiamento.length > 160 || data.placaReferencia.length > 120) {
      return { success: false, message: 'Categoria, descrição ou observações muito longas.' }
    }
    if (!Number.isFinite(data.precoBaseUnitario) || data.precoBaseUnitario < 0 || data.precoBaseUnitario > 1_000_000 ||
        !Number.isFinite(data.tempoImpressaoHorasUnidade) || data.tempoImpressaoHorasUnidade < 0 || data.tempoImpressaoHorasUnidade > 10_000) {
      return { success: false, message: 'Preço ou tempo de impressão inválido.' }
    }
    if ((data.impressoraPreferidaId !== null && (!Number.isSafeInteger(data.impressoraPreferidaId) || data.impressoraPreferidaId <= 0)) ||
        (data.diametroBicoMm !== null && (!Number.isFinite(data.diametroBicoMm) || data.diametroBicoMm <= 0 || data.diametroBicoMm > 2)) ||
        (data.alturaCamadaMm !== null && (!Number.isFinite(data.alturaCamadaMm) || data.alturaCamadaMm <= 0 || data.alturaCamadaMm > 1)) ||
        (data.unidadesPorPlaca !== null && (!Number.isSafeInteger(data.unidadesPorPlaca) || data.unidadesPorPlaca <= 0 || data.unidadesPorPlaca > 100_000))) {
      return { success: false, message: 'Revise a impressora, o bico, a camada e a capacidade por placa.' }
    }
    if (!Array.isArray(data.itens) || data.itens.length > 30) return { success: false, message: 'Ficha técnica inválida.' }
    const unicos = new Set<string>()
    for (const item of data.itens) {
      const chave = `${item.tipoItem}-${item.itemId}`
      if (!['Filamento', 'Insumo'].includes(item.tipoItem) || !Number.isSafeInteger(item.itemId) || item.itemId <= 0 ||
          !Number.isFinite(item.quantidadePorUnidade) || item.quantidadePorUnidade <= 0 || item.quantidadePorUnidade > 1_000_000 || unicos.has(chave)) {
        return { success: false, message: 'Há materiais duplicados ou com quantidade inválida.' }
      }
      unicos.add(chave)
    }

    let produtoId = id
    let versao = 1
    const salvar = db.transaction(() => {
      if (data.impressoraPreferidaId !== null && !db.prepare(`SELECT 1 FROM impressoras
        WHERE id = ? AND tenant_id = ? AND ativo = 1`).get(data.impressoraPreferidaId, TENANT_ID)) {
        throw new Error('IMPRESSORA_INVALIDA')
      }
      for (const item of data.itens) {
        const tabela = item.tipoItem === 'Filamento' ? 'filamentos' : 'insumos'
        if (!db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ? AND tenant_id = ? AND ativo = 1`).get(item.itemId, TENANT_ID)) {
          throw new Error('ITEM_INVALIDO')
        }
      }
      if (id === null) {
        const proximo = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS valor FROM produtos_catalogo WHERE tenant_id = ?')
          .get(TENANT_ID) as { valor: number }).valor
        const result = db.prepare(`INSERT INTO produtos_catalogo
          (tenant_id, usuario_id, codigo, nome, nome_chave, categoria, descricao)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(TENANT_ID, USUARIO_ID, `PRD-${String(proximo).padStart(6, '0')}`, nome, nomeChave,
            data.categoria.trim() || null, data.descricao.trim() || null)
        produtoId = Number(result.lastInsertRowid)
      } else {
        const atual = db.prepare(`SELECT COALESCE(MAX(pv.versao), 0) AS ultima
          FROM produtos_catalogo pc LEFT JOIN produto_versoes pv ON pv.produto_id = pc.id
          WHERE pc.id = ? AND pc.tenant_id = ? AND pc.ativo = 1`).get(id, TENANT_ID) as { ultima: number } | undefined
        if (!atual) throw new Error('NOT_FOUND')
        versao = atual.ultima + 1
        db.prepare(`UPDATE produtos_catalogo SET nome = ?, nome_chave = ?, categoria = ?, descricao = ?
          WHERE id = ? AND tenant_id = ?`).run(nome, nomeChave, data.categoria.trim() || null,
            data.descricao.trim() || null, id, TENANT_ID)
        db.prepare('UPDATE produto_versoes SET ativa = 0 WHERE produto_id = ? AND ativa = 1').run(id)
      }
      const versaoResult = db.prepare(`INSERT INTO produto_versoes
        (produto_id, versao, preco_base_unitario, tempo_impressao_horas_unidade, observacoes,
          impressora_preferida_id, diametro_bico_mm, altura_camada_mm, unidades_por_placa,
          perfil_fatiamento, placa_referencia)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(produtoId, versao, data.precoBaseUnitario, data.tempoImpressaoHorasUnidade,
          data.observacoesVersao.trim() || null, data.impressoraPreferidaId,
          data.diametroBicoMm, data.alturaCamadaMm, data.unidadesPorPlaca,
          data.perfilFatiamento.trim() || null, data.placaReferencia.trim() || null)
      const versaoId = Number(versaoResult.lastInsertRowid)
      const inserirItem = db.prepare(`INSERT INTO produto_versao_itens
        (versao_id, tipo_item, item_id, quantidade_por_unidade) VALUES (?, ?, ?, ?)`)
      for (const item of data.itens) inserirItem.run(versaoId, item.tipoItem, item.itemId, item.quantidadePorUnidade)
      registrarAuditoria(db, { entidade: 'ProdutoCatalogo', entidadeId: produtoId,
        acao: id ? 'NOVA_VERSAO' : 'CRIAR', descricao: `${nome} · versão ${versao}` })
    })
    salvar.immediate()
    revalidatePath('/produtos')
    revalidatePath('/orcamentos')
    return { success: true, message: id ? `Nova versão ${versao} da ficha salva.` : 'Produto e ficha técnica cadastrados.' }
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return { success: false, message: 'Produto não encontrado.' }
    if (error instanceof Error && error.message === 'ITEM_INVALIDO') return { success: false, message: 'Um material da ficha não está mais disponível.' }
    if (error instanceof Error && error.message === 'IMPRESSORA_INVALIDA') return { success: false, message: 'A impressora preferida não está disponível.' }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, message: 'Já existe um produto com esse nome.' }
    }
    console.error('[salvarProdutoCatalogo]', error)
    return { success: false, message: 'Erro interno ao salvar a ficha técnica.' }
  }
}

export async function arquivarProdutoCatalogo(id: number): Promise<ActionResult> {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, message: 'Produto inválido.' }
  const result = db.prepare('UPDATE produtos_catalogo SET ativo = 0 WHERE id = ? AND tenant_id = ? AND ativo = 1')
    .run(id, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Produto não encontrado.' }
  registrarAuditoria(db, { entidade: 'ProdutoCatalogo', entidadeId: id, acao: 'ARQUIVAR', descricao: 'Ficha arquivada' })
  revalidatePath('/produtos')
  return { success: true, message: 'Produto arquivado; vendas e versões anteriores foram preservadas.' }
}
