import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { criarPadraoLike, normalizarTermoBusca, normalizarTextoBusca } from '@/lib/busca-global.mjs'
import { getSessaoAtual } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAtual()
  if (!sessao) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  const termo = normalizarTermoBusca(request.nextUrl.searchParams.get('q'))
  const padrao = criarPadraoLike(termo)
  if (!padrao) return NextResponse.json({ resultados: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  const termoComparacao = normalizarTextoBusca(termo)

  const pedidos = db.prepare(`
    SELECT p.id, p.numero_orcamento, p.nome_da_peca, p.orcamento_status, p.status,
      c.nome AS cliente_nome
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND (
      normalizar_busca(p.numero_orcamento) LIKE ? ESCAPE '!' OR
      normalizar_busca(p.nome_da_peca) LIKE ? ESCAPE '!' OR
      normalizar_busca(c.nome) LIKE ? ESCAPE '!'
    )
    ORDER BY CASE WHEN normalizar_busca(p.numero_orcamento) = ? THEN 0 ELSE 1 END,
      p.data_pedido DESC, p.id DESC
    LIMIT 8
  `).all(sessao.tenantId, padrao, padrao, padrao, termoComparacao) as Array<{
    id: number
    numero_orcamento: string | null
    nome_da_peca: string
    orcamento_status: string
    status: string
    cliente_nome: string
  }>

  const clientes = db.prepare(`
    SELECT id, nome, telefone, cidade
    FROM clientes
    WHERE tenant_id = ? AND ativo = 1 AND (
      normalizar_busca(nome) LIKE ? ESCAPE '!' OR
      normalizar_busca(COALESCE(telefone, '')) LIKE ? ESCAPE '!' OR
      normalizar_busca(COALESCE(email, '')) LIKE ? ESCAPE '!' OR
      normalizar_busca(COALESCE(instagram, '')) LIKE ? ESCAPE '!'
    )
    ORDER BY nome COLLATE NOCASE
    LIMIT 6
  `).all(sessao.tenantId, padrao, padrao, padrao, padrao) as Array<{
    id: number
    nome: string
    telefone: string | null
    cidade: string | null
  }>

  const produtos = db.prepare(`
    SELECT id, codigo, nome, categoria
    FROM produtos_catalogo
    WHERE tenant_id = ? AND ativo = 1 AND (
      normalizar_busca(codigo) LIKE ? ESCAPE '!' OR
      normalizar_busca(nome) LIKE ? ESCAPE '!' OR
      normalizar_busca(COALESCE(categoria, '')) LIKE ? ESCAPE '!'
    )
    ORDER BY nome COLLATE NOCASE
    LIMIT 5
  `).all(sessao.tenantId, padrao, padrao, padrao) as Array<{
    id: number
    codigo: string
    nome: string
    categoria: string | null
  }>

  const filamentos = db.prepare(`
    SELECT id, material, cor, marca, COALESCE(estoque_gramas, peso_rolo_gramas) AS saldo
    FROM filamentos
    WHERE tenant_id = ? AND ativo = 1 AND (
      normalizar_busca(material) LIKE ? ESCAPE '!' OR
      normalizar_busca(cor) LIKE ? ESCAPE '!' OR
      normalizar_busca(COALESCE(marca, '')) LIKE ? ESCAPE '!'
    )
    ORDER BY material COLLATE NOCASE, cor COLLATE NOCASE
    LIMIT 4
  `).all(sessao.tenantId, padrao, padrao, padrao) as Array<{
    id: number
    material: string
    cor: string
    marca: string | null
    saldo: number
  }>

  const insumos = db.prepare(`
    SELECT id, nome, unidade, estoque_atual
    FROM insumos
    WHERE tenant_id = ? AND ativo = 1 AND normalizar_busca(nome) LIKE ? ESCAPE '!'
    ORDER BY nome COLLATE NOCASE
    LIMIT 4
  `).all(sessao.tenantId, padrao) as Array<{
    id: number
    nome: string
    unidade: string
    estoque_atual: number
  }>

  const resultados = [
    ...pedidos.map((item) => ({
      id: `pedido-${item.id}`, tipo: 'Pedido',
      titulo: `${item.numero_orcamento ?? `#${item.id}`} · ${item.nome_da_peca}`,
      detalhe: `${item.cliente_nome} · ${item.orcamento_status === 'Aprovado' ? item.status : item.orcamento_status}`,
      href: `/pedidos/${item.id}`,
    })),
    ...clientes.map((item) => ({
      id: `cliente-${item.id}`, tipo: 'Cliente', titulo: item.nome,
      detalhe: [item.telefone, item.cidade].filter(Boolean).join(' · ') || 'Sem contato informado',
      href: `/clientes/${item.id}`,
    })),
    ...produtos.map((item) => ({
      id: `produto-${item.id}`, tipo: 'Produto', titulo: item.nome,
      detalhe: [item.codigo, item.categoria].filter(Boolean).join(' · '), href: '/produtos',
    })),
    ...filamentos.map((item) => ({
      id: `filamento-${item.id}`, tipo: 'Filamento', titulo: `${item.material} ${item.cor}`,
      detalhe: `${item.marca || 'Fabricante não informado'} · ${item.saldo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g`,
      href: '/filamentos',
    })),
    ...insumos.map((item) => ({
      id: `insumo-${item.id}`, tipo: 'Insumo', titulo: item.nome,
      detalhe: `${item.estoque_atual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${item.unidade} em estoque`,
      href: '/insumos',
    })),
  ]
  return NextResponse.json({ resultados }, { headers: { 'Cache-Control': 'private, no-store' } })
}

