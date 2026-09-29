'use server'

import { randomBytes } from 'node:crypto'
import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { adicionarMeses, dividirEmParcelas } from '@/lib/financeiro.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface OrcamentoPortal {
  token: string
  numero_orcamento: string
  nome_da_peca: string
  descricao: string | null
  cliente_nome: string
  quantidade: number
  preco_unitario: number
  valor_total_cobrado: number
  frete_cobrado: number
  data_entrega: string | null
  validade_orcamento: string | null
  orcamento_status: string
  expira_em: string
  resposta: string | null
  respondido_em: string | null
  entregas: Array<{ quantidade: number; entregue_em: string }>
  expedicao: { modalidade: string; status: string; codigo_rastreio: string | null; url_rastreio: string | null; previsao_entrega: string | null } | null
}

export async function gerarLinkPortal(pedidoId: number): Promise<{ success: boolean; message: string; caminho?: string }> {
  try {
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) return { success: false, message: 'Pedido inválido.' }
    const pedido = db.prepare(`
      SELECT id, orcamento_status FROM pedidos WHERE id = ? AND tenant_id = ?
    `).get(pedidoId, TENANT_ID) as { id: number; orcamento_status: string } | undefined
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }
    if (!['Rascunho', 'Enviado', 'Aprovado'].includes(pedido.orcamento_status)) {
      return { success: false, message: 'Esse orçamento não pode ser compartilhado no estado atual.' }
    }
    const existente = db.prepare(`
      SELECT token FROM portal_links
      WHERE tenant_id = ? AND pedido_id = ? AND revogado_em IS NULL
        AND datetime(expira_em) > datetime('now')
      ORDER BY id DESC LIMIT 1
    `).get(TENANT_ID, pedidoId) as { token: string } | undefined
    if (existente) return { success: true, message: 'Link seguro recuperado.', caminho: `/portal/${existente.token}` }
    const token = randomBytes(24).toString('hex')
    const validadePedido = (db.prepare('SELECT validade_orcamento FROM pedidos WHERE id = ?').get(pedidoId) as { validade_orcamento: string | null }).validade_orcamento
    const limiteValidade = validadePedido ? new Date(`${validadePedido}T23:59:59Z`) : null
    const expiraEm = limiteValidade && limiteValidade.getTime() > Date.now()
      ? limiteValidade.toISOString()
      : new Date(Date.now() + 30 * 86_400_000).toISOString()
    const result = db.prepare(`
      INSERT INTO portal_links (tenant_id, usuario_id, pedido_id, token, expira_em)
      VALUES (?, ?, ?, ?, ?)
    `).run(TENANT_ID, USUARIO_ID, pedidoId, token, expiraEm)
    registrarAuditoria(db, {
      entidade: 'PortalCliente', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR_LINK',
      descricao: `Link seguro criado para o pedido #${pedidoId}`,
    })
    return { success: true, message: 'Link seguro criado.', caminho: `/portal/${token}` }
  } catch (error) {
    console.error('[gerarLinkPortal]', error)
    return { success: false, message: 'Não foi possível criar o link.' }
  }
}

export async function getOrcamentoPortal(token: string): Promise<OrcamentoPortal | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null
  const pedido = db.prepare(`
    SELECT pl.token, pl.expira_em, pl.resposta, pl.respondido_em,
      p.id, p.numero_orcamento, p.nome_da_peca, p.descricao, c.nome AS cliente_nome,
      p.quantidade, COALESCE(p.preco_unitario, p.valor_total_cobrado / MAX(p.quantidade, 1)) AS preco_unitario,
      p.valor_total_cobrado, p.frete_cobrado, p.data_entrega, p.validade_orcamento, p.orcamento_status
    FROM portal_links pl
    JOIN pedidos p ON p.id = pl.pedido_id AND p.tenant_id = pl.tenant_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE pl.token = ? AND pl.revogado_em IS NULL AND datetime(pl.expira_em) > datetime('now')
  `).get(token) as (Omit<OrcamentoPortal, 'entregas' | 'expedicao'> & { id: number }) | undefined
  if (!pedido) return null
  db.prepare(`UPDATE portal_links SET visualizado_em = COALESCE(visualizado_em, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) WHERE token = ?`).run(token)
  const entregas = db.prepare(`
    SELECT quantidade, entregue_em FROM entregas_pedido
    WHERE pedido_id = ? AND cancelada_em IS NULL ORDER BY entregue_em, id
  `).all(pedido.id) as OrcamentoPortal['entregas']
  const expedicao = db.prepare(`
    SELECT modalidade, status, codigo_rastreio, url_rastreio, previsao_entrega
    FROM expedicoes WHERE pedido_id = ? AND status != 'Cancelada' ORDER BY id DESC LIMIT 1
  `).get(pedido.id) as OrcamentoPortal['expedicao']
  return {
    token: pedido.token,
    numero_orcamento: pedido.numero_orcamento,
    nome_da_peca: pedido.nome_da_peca,
    descricao: pedido.descricao,
    cliente_nome: pedido.cliente_nome,
    quantidade: pedido.quantidade,
    preco_unitario: pedido.preco_unitario,
    valor_total_cobrado: pedido.valor_total_cobrado,
    frete_cobrado: pedido.frete_cobrado,
    data_entrega: pedido.data_entrega,
    validade_orcamento: pedido.validade_orcamento,
    orcamento_status: pedido.orcamento_status,
    expira_em: pedido.expira_em,
    resposta: pedido.resposta,
    respondido_em: pedido.respondido_em,
    entregas,
    expedicao: expedicao ?? null,
  }
}

export async function responderOrcamentoPortal(token: string, resposta: 'Aprovado' | 'Recusado'): Promise<{ success: boolean; message: string }> {
  try {
    if (!/^[a-f0-9]{48}$/.test(token) || !['Aprovado', 'Recusado'].includes(resposta)) {
      return { success: false, message: 'Link ou resposta inválida.' }
    }
    let pedidoId = 0
    const responder = db.transaction(() => {
      const link = db.prepare(`
        SELECT pl.id, pl.pedido_id, pl.respondido_em, p.orcamento_status,
          p.valor_total_cobrado, p.parcelas,
          COALESCE(p.vencimento_em, substr(p.data_pedido, 1, 10)) AS primeiro_vencimento
        FROM portal_links pl JOIN pedidos p ON p.id = pl.pedido_id AND p.tenant_id = pl.tenant_id
        WHERE pl.token = ? AND pl.revogado_em IS NULL AND datetime(pl.expira_em) > datetime('now')
      `).get(token) as {
        id: number; pedido_id: number; respondido_em: string | null; orcamento_status: string
        valor_total_cobrado: number; parcelas: number; primeiro_vencimento: string
      } | undefined
      if (!link) throw new Error('INVALID_LINK')
      if (link.respondido_em) throw new Error('ANSWERED')
      if (!['Rascunho', 'Enviado'].includes(link.orcamento_status)) throw new Error('STATUS')
      pedidoId = link.pedido_id
      db.prepare(`
        UPDATE portal_links SET resposta = ?, respondido_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
      `).run(resposta, link.id)
      db.prepare('UPDATE pedidos SET orcamento_status = ? WHERE id = ?').run(resposta, pedidoId)
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Resposta pelo portal', ?)
      `).run(TENANT_ID, pedidoId, USUARIO_ID, `Cliente marcou o orçamento como ${resposta.toLowerCase()}`)
      if (resposta === 'Aprovado') {
        const total = (db.prepare('SELECT COUNT(*) AS total FROM parcelas_receber WHERE pedido_id = ?').get(pedidoId) as { total: number }).total
        if (total === 0) {
          const inserir = db.prepare(`
            INSERT INTO parcelas_receber (tenant_id, pedido_id, numero, valor, vencimento_em)
            VALUES (?, ?, ?, ?, ?)
          `)
          dividirEmParcelas(link.valor_total_cobrado, link.parcelas).forEach((valor, index) => {
            inserir.run(TENANT_ID, pedidoId, index + 1, valor, adicionarMeses(link.primeiro_vencimento, index))
          })
        }
      }
      registrarAuditoria(db, {
        entidade: 'Pedido', entidadeId: pedidoId, acao: 'RESPOSTA_PORTAL', descricao: resposta,
      })
    })
    try { responder.immediate() } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'INVALID_LINK') return { success: false, message: 'Este link expirou ou foi revogado.' }
      if (code === 'ANSWERED') return { success: false, message: 'Este orçamento já recebeu uma resposta.' }
      if (code === 'STATUS') return { success: false, message: 'O orçamento não aceita mais respostas.' }
      throw error
    }
    revalidatePath(`/portal/${token}`)
    revalidatePath(`/pedidos/${pedidoId}`)
    revalidatePath('/orcamentos')
    return { success: true, message: resposta === 'Aprovado' ? 'Orçamento aprovado com sucesso.' : 'Orçamento recusado. A empresa foi avisada.' }
  } catch (error) {
    console.error('[responderOrcamentoPortal]', error)
    return { success: false, message: 'Não foi possível registrar sua resposta.' }
  }
}
