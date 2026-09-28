'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { ACOES_OCORRENCIA, determinarStatusExpedicao, normalizarCodigoRastreio, resumirAtendimento, TIPOS_OCORRENCIA } from '@/lib/atendimento.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export interface OcorrenciaQualidade {
  id: number
  pedido_id: number
  numero_orcamento: string
  produto_nome: string
  cliente_nome: string
  tipo: string
  status: 'Aberta' | 'Em análise' | 'Resolvida' | 'Cancelada'
  acao: string
  quantidade: number
  custo_estimado: number
  descricao: string
  resolucao: string | null
  prazo_em: string | null
  resolvida_em: string | null
  criado_em: string
}

export interface ExpedicaoPedido {
  id: number
  pedido_id: number
  entrega_id: number | null
  numero_orcamento: string
  produto_nome: string
  cliente_nome: string
  modalidade: string
  transportadora: string | null
  codigo_rastreio: string | null
  url_rastreio: string | null
  status: 'Preparando' | 'Postado' | 'Em trânsito' | 'Entregue' | 'Cancelada'
  status_exibicao: string
  postado_em: string | null
  previsao_entrega: string | null
  entregue_em: string | null
  custo: number
  observacoes: string | null
  criado_em: string
}

export interface AtendimentoDados {
  ocorrencias: OcorrenciaQualidade[]
  expedicoes: ExpedicaoPedido[]
  pedidos: Array<{ id: number; numero_orcamento: string; nome_da_peca: string; cliente_nome: string; quantidade: number }>
  resumo: { ocorrenciasAbertas: number; reimpressoesPendentes: number; expedicoesEmAberto: number; expedicoesAtrasadas: number }
  hoje: string
}

type ActionResult = { success: boolean; message: string }

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function revalidar(pedidoId?: number) {
  revalidatePath('/atendimento')
  revalidatePath('/agenda')
  if (pedidoId) revalidatePath(`/pedidos/${pedidoId}`)
}

export async function getAtendimentoDados(pedidoId?: number): Promise<AtendimentoDados> {
  const filtro = pedidoId ? ' AND p.id = ?' : ''
  const parametros = pedidoId ? [TENANT_ID, pedidoId] : [TENANT_ID]
  const ocorrencias = db.prepare(`
    SELECT oq.*, COALESCE(p.numero_orcamento, '#' || p.id) AS numero_orcamento,
      p.nome_da_peca AS produto_nome, c.nome AS cliente_nome
    FROM ocorrencias_qualidade oq JOIN pedidos p ON p.id = oq.pedido_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE oq.tenant_id = ?${filtro}
    ORDER BY CASE oq.status WHEN 'Aberta' THEN 0 WHEN 'Em análise' THEN 1 ELSE 2 END,
      COALESCE(oq.prazo_em, '9999-12-31'), oq.id DESC
  `).all(...parametros) as OcorrenciaQualidade[]
  const hoje = hojeSaoPaulo()
  const expedicoesBase = db.prepare(`
    SELECT e.*, COALESCE(p.numero_orcamento, '#' || p.id) AS numero_orcamento,
      p.nome_da_peca AS produto_nome, c.nome AS cliente_nome
    FROM expedicoes e JOIN pedidos p ON p.id = e.pedido_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE e.tenant_id = ?${filtro}
    ORDER BY CASE e.status WHEN 'Preparando' THEN 0 WHEN 'Postado' THEN 1 WHEN 'Em trânsito' THEN 2 ELSE 3 END,
      COALESCE(e.previsao_entrega, '9999-12-31'), e.id DESC
  `).all(...parametros) as Omit<ExpedicaoPedido, 'status_exibicao'>[]
  const expedicoes = expedicoesBase.map(item => ({ ...item, status_exibicao: item.status === 'Cancelada' ? 'Cancelada' : determinarStatusExpedicao({
    postadoEm: item.postado_em, entregueEm: item.entregue_em, previsaoEntrega: item.previsao_entrega, hoje,
  }) }))
  const pedidos = db.prepare(`
    SELECT p.id, COALESCE(p.numero_orcamento, '#' || p.id) AS numero_orcamento,
      p.nome_da_peca, c.nome AS cliente_nome, p.quantidade
    FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Aprovado' AND p.status != 'Cancelado'
    ORDER BY p.data_pedido DESC, p.id DESC LIMIT 200
  `).all(TENANT_ID) as AtendimentoDados['pedidos']
  return { ocorrencias, expedicoes, pedidos, resumo: resumirAtendimento(ocorrencias, expedicoes, hoje), hoje }
}

export async function registrarOcorrenciaQualidade(data: {
  pedidoId: number; tipo: string; acao: string; quantidade: number; custoEstimado: number;
  descricao: string; prazoEm: string | null
}): Promise<ActionResult> {
  try {
    if (!Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0 || !TIPOS_OCORRENCIA.includes(data.tipo) || !ACOES_OCORRENCIA.includes(data.acao)) {
      return { success: false, message: 'Pedido, tipo ou ação inválida.' }
    }
    if (!Number.isFinite(data.quantidade) || data.quantidade <= 0 || data.quantidade > 100_000 ||
        !Number.isFinite(data.custoEstimado) || data.custoEstimado < 0 || data.custoEstimado > 10_000_000) {
      return { success: false, message: 'Quantidade ou custo inválido.' }
    }
    if (!data.descricao.trim() || data.descricao.length > 2000 || (data.prazoEm !== null && !DATA_RE.test(data.prazoEm))) {
      return { success: false, message: 'Informe a ocorrência e revise o prazo.' }
    }
    const pedido = db.prepare(`SELECT p.quantidade, p.cliente_id,
      COALESCE(p.numero_orcamento, '#' || p.id) AS numero_orcamento, p.nome_da_peca
      FROM pedidos p WHERE p.id = ? AND p.tenant_id = ?`).get(data.pedidoId, TENANT_ID) as {
        quantidade: number; cliente_id: number; numero_orcamento: string; nome_da_peca: string
      } | undefined
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }
    const criar = db.transaction(() => {
      const result = db.prepare(`INSERT INTO ocorrencias_qualidade (
        tenant_id, usuario_id, pedido_id, tipo, status, acao, quantidade,
        custo_estimado, descricao, prazo_em
      ) VALUES (?, ?, ?, ?, 'Aberta', ?, ?, ?, ?, ?)`)
        .run(TENANT_ID, USUARIO_ID, data.pedidoId, data.tipo, data.acao, data.quantidade,
          data.custoEstimado, data.descricao.trim(), data.prazoEm)
      const id = Number(result.lastInsertRowid)
      if (data.acao === 'Reimprimir' && data.prazoEm) {
        const tarefa = db.prepare(`INSERT INTO tarefas_agenda (
          tenant_id, usuario_id, pedido_id, cliente_id, tipo, titulo, descricao, vencimento_em
        ) VALUES (?, ?, ?, ?, 'Outro', ?, ?, ?)`)
          .run(TENANT_ID, USUARIO_ID, data.pedidoId, pedido.cliente_id,
            `Reimprimir ${pedido.numero_orcamento}`, `${data.quantidade} un. de ${pedido.nome_da_peca} · ${data.descricao.trim()}`,
            data.prazoEm)
        db.prepare('UPDATE ocorrencias_qualidade SET tarefa_id = ? WHERE id = ?')
          .run(Number(tarefa.lastInsertRowid), id)
      }
      db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, 'Ocorrência de qualidade', ?)`)
        .run(TENANT_ID, data.pedidoId, USUARIO_ID, `${data.tipo} · ${data.acao} · ${data.quantidade} unidade(s)`)
      registrarAuditoria(db, { entidade: 'OcorrenciaQualidade', entidadeId: id, acao: 'CRIAR', descricao: data.descricao.trim() })
    })
    criar.immediate()
    revalidar(data.pedidoId)
    return { success: true, message: data.acao === 'Reimprimir' ? 'Ocorrência aberta e reimpressão sinalizada.' : 'Ocorrência registrada.' }
  } catch (error) {
    console.error('[registrarOcorrenciaQualidade]', error)
    return { success: false, message: 'Erro interno ao registrar ocorrência.' }
  }
}

export async function resolverOcorrenciaQualidade(id: number, pedidoId: number, resolucao: string): Promise<ActionResult> {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !resolucao.trim() || resolucao.length > 2000) {
    return { success: false, message: 'Informe uma resolução válida.' }
  }
  let resolvida = false
  const resolver = db.transaction(() => {
    const ocorrencia = db.prepare(`SELECT tarefa_id FROM ocorrencias_qualidade
      WHERE id = ? AND pedido_id = ? AND tenant_id = ? AND status NOT IN ('Resolvida', 'Cancelada')`)
      .get(id, pedidoId, TENANT_ID) as { tarefa_id: number | null } | undefined
    if (!ocorrencia) return
    db.prepare(`UPDATE ocorrencias_qualidade SET status = 'Resolvida', resolucao = ?, resolvida_em = ? WHERE id = ?`)
      .run(resolucao.trim(), hojeSaoPaulo(), id)
    if (ocorrencia.tarefa_id) db.prepare(`UPDATE tarefas_agenda SET status = 'Concluida', concluida_em = ?
      WHERE id = ? AND tenant_id = ? AND status = 'Pendente'`).run(hojeSaoPaulo(), ocorrencia.tarefa_id, TENANT_ID)
    db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
      VALUES (?, ?, ?, 'Ocorrência resolvida', ?)`)
      .run(TENANT_ID, pedidoId, USUARIO_ID, resolucao.trim())
    registrarAuditoria(db, { entidade: 'OcorrenciaQualidade', entidadeId: id, acao: 'RESOLVER', descricao: resolucao.trim() })
    resolvida = true
  })
  resolver.immediate()
  if (!resolvida) return { success: false, message: 'Ocorrência não encontrada ou já encerrada.' }
  revalidar(pedidoId)
  return { success: true, message: 'Ocorrência resolvida.' }
}

export async function registrarExpedicao(data: {
  pedidoId: number; modalidade: string; transportadora: string; codigoRastreio: string;
  urlRastreio: string; postadoEm: string | null; previsaoEntrega: string | null;
  custo: number; observacoes: string
}): Promise<ActionResult> {
  try {
    const modalidades = ['Retirada', 'Entrega local', 'Transportadora', 'Correios', 'Outro']
    if (!Number.isSafeInteger(data.pedidoId) || data.pedidoId <= 0 || !modalidades.includes(data.modalidade)) {
      return { success: false, message: 'Pedido ou modalidade inválida.' }
    }
    if ([data.postadoEm, data.previsaoEntrega].some(valor => valor !== null && !DATA_RE.test(valor)) ||
        !Number.isFinite(data.custo) || data.custo < 0 || data.custo > 1_000_000) {
      return { success: false, message: 'Data ou custo de expedição inválido.' }
    }
    let urlRastreio: string | null = null
    if (data.urlRastreio.trim()) {
      try {
        const url = new URL(data.urlRastreio.trim())
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
        urlRastreio = url.toString()
      } catch { return { success: false, message: 'Link de rastreamento inválido.' } }
    }
    if (!db.prepare(`SELECT 1 FROM pedidos WHERE id = ? AND tenant_id = ? AND orcamento_status = 'Aprovado' AND status != 'Cancelado'`)
      .get(data.pedidoId, TENANT_ID)) return { success: false, message: 'Pedido não encontrado ou cancelado.' }
    const status = data.postadoEm ? 'Em trânsito' : 'Preparando'
    const result = db.prepare(`INSERT INTO expedicoes (
      tenant_id, usuario_id, pedido_id, modalidade, transportadora, codigo_rastreio,
      url_rastreio, status, postado_em, previsao_entrega, custo, observacoes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(TENANT_ID, USUARIO_ID, data.pedidoId, data.modalidade, data.transportadora.trim() || null,
        normalizarCodigoRastreio(data.codigoRastreio) || null, urlRastreio, status, data.postadoEm,
        data.previsaoEntrega, data.custo, data.observacoes.trim() || null)
    const id = Number(result.lastInsertRowid)
    db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
      VALUES (?, ?, ?, 'Expedição registrada', ?)`)
      .run(TENANT_ID, data.pedidoId, USUARIO_ID, `${data.modalidade}${data.codigoRastreio ? ` · ${normalizarCodigoRastreio(data.codigoRastreio)}` : ''}`)
    registrarAuditoria(db, { entidade: 'Expedicao', entidadeId: id, acao: 'CRIAR', descricao: `${data.modalidade} · pedido ${data.pedidoId}` })
    revalidar(data.pedidoId)
    return { success: true, message: data.postadoEm ? 'Expedição registrada em trânsito.' : 'Expedição criada para preparação.' }
  } catch (error) {
    console.error('[registrarExpedicao]', error)
    return { success: false, message: 'Erro interno ao registrar expedição.' }
  }
}

export async function marcarExpedicaoEntregue(id: number, pedidoId: number, entregueEm: string): Promise<ActionResult> {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !DATA_RE.test(entregueEm)) {
    return { success: false, message: 'Expedição ou data inválida.' }
  }
  const result = db.prepare(`UPDATE expedicoes SET status = 'Entregue', entregue_em = ?
    WHERE id = ? AND pedido_id = ? AND tenant_id = ? AND status NOT IN ('Entregue', 'Cancelada')`)
    .run(entregueEm, id, pedidoId, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Expedição não encontrada ou já encerrada.' }
  db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
    VALUES (?, ?, ?, 'Expedição entregue', ?)`)
    .run(TENANT_ID, pedidoId, USUARIO_ID, `Entrega confirmada em ${entregueEm}`)
  registrarAuditoria(db, { entidade: 'Expedicao', entidadeId: id, acao: 'ENTREGAR', descricao: entregueEm })
  revalidar(pedidoId)
  return { success: true, message: 'Entrega da expedição confirmada.' }
}
