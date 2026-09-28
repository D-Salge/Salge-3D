'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { classificarPrazo, resumirAgenda } from '@/lib/agenda.mjs'
import { getPedidosComSaldoPendente } from '@/app/actions/recebimentos'
import type { PedidoWhatsApp, TipoMensagemWhatsApp } from '@/app/actions/whatsapp'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1
const TIPOS = ['Entrega', 'Cobranca', 'Follow-up', 'Pos-venda', 'Outro'] as const

export type TipoAgenda = typeof TIPOS[number]
export type GrupoAgenda = 'Atrasado' | 'Hoje' | 'Proximos7Dias' | 'Futuro'

export interface ItemAgenda {
  id: string
  tarefa_id: number | null
  origem: 'Automatica' | 'Lembrete'
  tipo: TipoAgenda
  titulo: string
  descricao: string | null
  vencimento_em: string
  pedido_id: number | null
  cliente_nome: string | null
  valor: number | null
  href: string | null
  whatsapp: PedidoWhatsApp | null
  whatsapp_tipo: TipoMensagemWhatsApp | null
  permite_avaliacao: boolean
  grupo: GrupoAgenda
}

export interface AgendaDados {
  hoje: string
  itens: ItemAgenda[]
  resumo: { total: number; Atrasado: number; Hoje: number; Proximos7Dias: number; Futuro: number }
  avaliacoes: { total: number; media: number }
}

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

type PedidoBase = PedidoWhatsApp & { cliente_id: number }

function pedidosParaWhatsApp(ids: number[]) {
  if (ids.length === 0) return new Map<number, PedidoBase>()
  const unicos = [...new Set(ids)]
  const placeholders = unicos.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT p.id, p.numero_orcamento, p.nome_da_peca, p.cliente_id,
      c.nome AS cliente_nome, c.telefone AS cliente_telefone,
      p.valor_total_cobrado, p.orcamento_status, p.status, p.vencimento_em,
      COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS total_recebido,
      MAX(0, p.valor_total_cobrado - COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)) AS saldo_pendente
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND p.id IN (${placeholders})
  `).all(TENANT_ID, ...unicos) as PedidoBase[]
  return new Map(rows.map((row) => [row.id, row]))
}

export async function getAgenda(): Promise<AgendaDados> {
  const hoje = hojeSaoPaulo()
  const configuracao = db.prepare(`
    SELECT dias_followup_orcamento, dias_pos_venda FROM tenants WHERE id = ?
  `).get(TENANT_ID) as { dias_followup_orcamento: number; dias_pos_venda: number }

  const tarefas = db.prepare(`
    SELECT t.id, t.tipo, t.titulo, t.descricao, date(t.vencimento_em) AS vencimento_em,
      t.pedido_id, c.nome AS cliente_nome
    FROM tarefas_agenda t LEFT JOIN clientes c ON c.id = t.cliente_id
    WHERE t.tenant_id = ? AND t.status = 'Pendente'
    ORDER BY date(t.vencimento_em), t.id LIMIT 200
  `).all(TENANT_ID) as Array<{
    id: number; tipo: TipoAgenda; titulo: string; descricao: string | null
    vencimento_em: string; pedido_id: number | null; cliente_nome: string | null
  }>

  const entregas = db.prepare(`
    SELECT p.id AS pedido_id, p.numero_orcamento, p.nome_da_peca,
      c.nome AS cliente_nome, date(p.data_entrega) AS vencimento_em
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Aprovado'
      AND p.status IN ('Fila', 'Imprimindo', 'Acabamento') AND p.data_entrega IS NOT NULL
    ORDER BY date(p.data_entrega), p.id LIMIT 100
  `).all(TENANT_ID) as Array<{
    pedido_id: number; numero_orcamento: string | null; nome_da_peca: string
    cliente_nome: string; vencimento_em: string
  }>

  const followups = db.prepare(`
    SELECT p.id AS pedido_id, p.numero_orcamento, p.nome_da_peca,
      c.nome AS cliente_nome,
      date(COALESCE((SELECT MAX(h.criado_em) FROM historico_pedidos h
        WHERE h.pedido_id = p.id AND h.evento = 'WhatsApp: Enviar orçamento'), p.data_pedido),
        '+' || ? || ' days') AS vencimento_em
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Enviado'
      AND NOT EXISTS (SELECT 1 FROM historico_pedidos h
        WHERE h.pedido_id = p.id AND h.evento = 'WhatsApp: Acompanhar orçamento')
    ORDER BY vencimento_em, p.id LIMIT 100
  `).all(configuracao.dias_followup_orcamento, TENANT_ID) as Array<{
    pedido_id: number; numero_orcamento: string | null; nome_da_peca: string
    cliente_nome: string; vencimento_em: string
  }>

  const posVendas = db.prepare(`
    SELECT p.id AS pedido_id, p.numero_orcamento, p.nome_da_peca,
      c.nome AS cliente_nome,
      date(COALESCE(p.data_conclusao, p.data_entrega, p.data_pedido), '+' || ? || ' days') AS vencimento_em,
      EXISTS (SELECT 1 FROM historico_pedidos h
        WHERE h.pedido_id = p.id AND h.evento = 'WhatsApp: Pós-venda') AS contatado
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Aprovado' AND p.status = 'Finalizado'
      AND NOT EXISTS (SELECT 1 FROM avaliacoes_pedido a
        WHERE a.tenant_id = p.tenant_id AND a.pedido_id = p.id)
    ORDER BY vencimento_em, p.id LIMIT 100
  `).all(configuracao.dias_pos_venda, TENANT_ID) as Array<{
    pedido_id: number; numero_orcamento: string | null; nome_da_peca: string
    cliente_nome: string; vencimento_em: string; contatado: number
  }>

  const parcelas = await getPedidosComSaldoPendente()
  const despesas = db.prepare(`
    SELECT id, descricao, valor, date(COALESCE(vencimento_em, data_despesa)) AS vencimento_em
    FROM despesas
    WHERE tenant_id = ? AND estornada_em IS NULL AND pago_em IS NULL
    ORDER BY date(COALESCE(vencimento_em, data_despesa)), id LIMIT 100
  `).all(TENANT_ID) as Array<{ id: number; descricao: string; valor: number; vencimento_em: string }>

  const pedidoIds = [
    ...tarefas.flatMap((item) => item.pedido_id ? [item.pedido_id] : []),
    ...entregas.map((item) => item.pedido_id), ...followups.map((item) => item.pedido_id),
    ...posVendas.map((item) => item.pedido_id), ...parcelas.map((item) => item.pedido_id),
  ]
  const pedidos = pedidosParaWhatsApp(pedidoIds)
  const bruto: Omit<ItemAgenda, 'grupo'>[] = []

  for (const item of tarefas) bruto.push({
    id: `tarefa-${item.id}`, tarefa_id: item.id, origem: 'Lembrete', tipo: item.tipo,
    titulo: item.titulo, descricao: item.descricao, vencimento_em: item.vencimento_em,
    pedido_id: item.pedido_id, cliente_nome: item.cliente_nome, valor: null,
    href: item.pedido_id ? `/pedidos/${item.pedido_id}` : null,
    whatsapp: item.pedido_id ? pedidos.get(item.pedido_id) ?? null : null,
    whatsapp_tipo: item.tipo === 'Follow-up' ? 'followup' : item.tipo === 'Pos-venda' ? 'pos_venda' : item.tipo === 'Cobranca' ? 'cobranca' : null,
    permite_avaliacao: item.tipo === 'Pos-venda' && Boolean(item.pedido_id),
  })
  for (const item of entregas) bruto.push({
    id: `entrega-${item.pedido_id}`, tarefa_id: null, origem: 'Automatica', tipo: 'Entrega',
    titulo: `Entregar ${item.numero_orcamento ?? `#${item.pedido_id}`}`,
    descricao: `${item.nome_da_peca} · ${item.cliente_nome}`, vencimento_em: item.vencimento_em,
    pedido_id: item.pedido_id, cliente_nome: item.cliente_nome, valor: null,
    href: `/pedidos/${item.pedido_id}`, whatsapp: pedidos.get(item.pedido_id) ?? null,
    whatsapp_tipo: 'producao', permite_avaliacao: false,
  })
  for (const item of followups) bruto.push({
    id: `followup-${item.pedido_id}`, tarefa_id: null, origem: 'Automatica', tipo: 'Follow-up',
    titulo: `Retomar ${item.numero_orcamento ?? `#${item.pedido_id}`}`,
    descricao: `${item.nome_da_peca} · ${item.cliente_nome}`, vencimento_em: item.vencimento_em,
    pedido_id: item.pedido_id, cliente_nome: item.cliente_nome, valor: pedidos.get(item.pedido_id)?.valor_total_cobrado ?? null,
    href: `/pedidos/${item.pedido_id}`, whatsapp: pedidos.get(item.pedido_id) ?? null,
    whatsapp_tipo: 'followup', permite_avaliacao: false,
  })
  for (const item of posVendas) bruto.push({
    id: `pos-venda-${item.pedido_id}`, tarefa_id: null, origem: 'Automatica', tipo: 'Pos-venda',
    titulo: `Pós-venda ${item.numero_orcamento ?? `#${item.pedido_id}`}`,
    descricao: `${item.nome_da_peca} · ${item.cliente_nome}`, vencimento_em: item.vencimento_em,
    pedido_id: item.pedido_id, cliente_nome: item.cliente_nome, valor: null,
    href: `/pedidos/${item.pedido_id}`, whatsapp: pedidos.get(item.pedido_id) ?? null,
    whatsapp_tipo: item.contatado ? null : 'pos_venda', permite_avaliacao: true,
  })
  for (const item of parcelas) bruto.push({
    id: `parcela-${item.parcela_id}`, tarefa_id: null, origem: 'Automatica', tipo: 'Cobranca',
    titulo: `Receber parcela ${item.numero_parcela}/${item.total_parcelas}`,
    descricao: `${item.nome_da_peca} · ${item.cliente_nome}`, vencimento_em: item.vencimento_em ?? hoje,
    pedido_id: item.pedido_id, cliente_nome: item.cliente_nome, valor: item.saldo_pendente,
    href: '/financeiro', whatsapp: pedidos.get(item.pedido_id) ?? null,
    whatsapp_tipo: 'cobranca', permite_avaliacao: false,
  })
  for (const item of despesas) bruto.push({
    id: `despesa-${item.id}`, tarefa_id: null, origem: 'Automatica', tipo: 'Cobranca',
    titulo: 'Pagar despesa', descricao: item.descricao, vencimento_em: item.vencimento_em,
    pedido_id: null, cliente_nome: null, valor: item.valor, href: '/financeiro',
    whatsapp: null, whatsapp_tipo: null, permite_avaliacao: false,
  })

  const ordemGrupo: Record<GrupoAgenda, number> = { Atrasado: 0, Hoje: 1, Proximos7Dias: 2, Futuro: 3 }
  const itens = bruto.map((item) => ({
    ...item,
    grupo: classificarPrazo(item.vencimento_em, hoje) as GrupoAgenda,
  }))
  itens.sort((a, b) => ordemGrupo[a.grupo] - ordemGrupo[b.grupo] || a.vencimento_em.localeCompare(b.vencimento_em) || a.id.localeCompare(b.id))

  const avaliacao = db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(AVG(nota), 0) AS media
    FROM avaliacoes_pedido WHERE tenant_id = ?
  `).get(TENANT_ID) as { total: number; media: number }

  return {
    hoje, itens, resumo: resumirAgenda(itens, hoje),
    avaliacoes: { total: avaliacao.total, media: Number(avaliacao.media.toFixed(1)) },
  }
}

export async function criarLembreteAgenda(data: {
  tipo: TipoAgenda; titulo: string; descricao: string; vencimento_em: string
}): Promise<{ success: boolean; message: string }> {
  try {
    const titulo = data.titulo.trim()
    if (!TIPOS.includes(data.tipo) || !titulo || titulo.length > 120) return { success: false, message: 'Preencha um título válido.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.vencimento_em)) return { success: false, message: 'Informe uma data válida.' }
    if (data.descricao.length > 500) return { success: false, message: 'A descrição deve ter no máximo 500 caracteres.' }
    const result = db.prepare(`
      INSERT INTO tarefas_agenda (tenant_id, usuario_id, tipo, titulo, descricao, vencimento_em)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(TENANT_ID, USUARIO_ID, data.tipo, titulo, data.descricao.trim() || null, data.vencimento_em)
    registrarAuditoria(db, { entidade: 'Agenda', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR', descricao: titulo })
    revalidatePath('/agenda'); revalidatePath('/')
    return { success: true, message: 'Lembrete criado.' }
  } catch (error) {
    console.error('[criarLembreteAgenda]', error)
    return { success: false, message: 'Não foi possível criar o lembrete.' }
  }
}

export async function concluirLembreteAgenda(id: number): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(id) || id <= 0) return { success: false, message: 'Lembrete inválido.' }
    const result = db.prepare(`
      UPDATE tarefas_agenda SET status = 'Concluida', concluida_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND tenant_id = ? AND status = 'Pendente'
    `).run(id, TENANT_ID)
    if (result.changes !== 1) return { success: false, message: 'Lembrete não encontrado.' }
    registrarAuditoria(db, { entidade: 'Agenda', entidadeId: id, acao: 'CONCLUIR', descricao: 'Lembrete concluído' })
    revalidatePath('/agenda'); revalidatePath('/')
    return { success: true, message: 'Lembrete concluído.' }
  } catch (error) {
    console.error('[concluirLembreteAgenda]', error)
    return { success: false, message: 'Não foi possível concluir o lembrete.' }
  }
}

export async function adiarLembreteAgenda(id: number, vencimentoEm: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(id) || id <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(vencimentoEm)) return { success: false, message: 'Data inválida.' }
    const result = db.prepare(`UPDATE tarefas_agenda SET vencimento_em = ? WHERE id = ? AND tenant_id = ? AND status = 'Pendente'`).run(vencimentoEm, id, TENANT_ID)
    if (result.changes !== 1) return { success: false, message: 'Lembrete não encontrado.' }
    registrarAuditoria(db, { entidade: 'Agenda', entidadeId: id, acao: 'ADIAR', descricao: `Novo prazo: ${vencimentoEm}` })
    revalidatePath('/agenda')
    return { success: true, message: 'Lembrete adiado.' }
  } catch (error) {
    console.error('[adiarLembreteAgenda]', error)
    return { success: false, message: 'Não foi possível adiar o lembrete.' }
  }
}

export async function salvarAvaliacaoPedido(data: {
  pedidoId: number; nota: number; comentario: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0 || !Number.isSafeInteger(data.nota) || data.nota < 1 || data.nota > 5) {
      return { success: false, message: 'Pedido ou nota inválida.' }
    }
    if (data.comentario.length > 1000) return { success: false, message: 'O comentário deve ter no máximo 1.000 caracteres.' }
    const pedido = db.prepare(`SELECT id, numero_orcamento, status FROM pedidos WHERE id = ? AND tenant_id = ?`).get(data.pedidoId, TENANT_ID) as { id: number; numero_orcamento: string | null; status: string } | undefined
    if (!pedido || pedido.status !== 'Finalizado') return { success: false, message: 'A avaliação só pode ser registrada em pedido finalizado.' }
    db.transaction(() => {
      db.prepare(`
        INSERT INTO avaliacoes_pedido (tenant_id, usuario_id, pedido_id, nota, comentario)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (tenant_id, pedido_id) DO UPDATE SET nota = excluded.nota, comentario = excluded.comentario
      `).run(TENANT_ID, USUARIO_ID, data.pedidoId, data.nota, data.comentario.trim() || null)
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Avaliação do cliente', ?)
      `).run(TENANT_ID, data.pedidoId, USUARIO_ID, `${data.nota}/5${data.comentario.trim() ? ` · ${data.comentario.trim()}` : ''}`)
      registrarAuditoria(db, { entidade: 'Pedido', entidadeId: data.pedidoId, acao: 'AVALIAR', descricao: `${pedido.numero_orcamento ?? `#${pedido.id}`} · ${data.nota}/5` })
    })()
    revalidatePath('/agenda'); revalidatePath(`/pedidos/${data.pedidoId}`)
    return { success: true, message: 'Avaliação registrada.' }
  } catch (error) {
    console.error('[salvarAvaliacaoPedido]', error)
    return { success: false, message: 'Não foi possível registrar a avaliação.' }
  }
}
