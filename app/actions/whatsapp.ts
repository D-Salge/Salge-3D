'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import {
  contatoWhatsAppJaRegistrado,
  normalizarTelefoneWhatsApp,
  ROTULOS_MENSAGEM_WHATSAPP,
  sugerirTipoMensagemWhatsApp,
  TIPOS_MENSAGEM_WHATSAPP,
} from '@/lib/whatsapp.mjs'
import { revalidatePath } from 'next/cache'
import { exigirSessao } from '@/lib/session'
import { configuracaoWhatsApp, nomeTemplateWhatsApp, payloadTemplateWhatsApp } from '@/lib/whatsapp-cloud.mjs'

const TENANT_ID = 1
const USUARIO_ID = 1

export type TipoMensagemWhatsApp = 'orcamento' | 'followup' | 'cobranca' | 'producao' | 'pronto' | 'pos_venda'

export interface PedidoWhatsApp {
  id: number
  numero_orcamento: string | null
  nome_da_peca: string
  cliente_nome: string
  cliente_telefone: string | null
  valor_total_cobrado: number
  total_recebido: number
  saldo_pendente: number
  orcamento_status: string
  status: string
  vencimento_em: string | null
}

export interface PendenciaWhatsApp extends PedidoWhatsApp {
  tipo_sugerido: TipoMensagemWhatsApp
  ultimo_contato: string | null
}

type PedidoPendenteRow = PedidoWhatsApp & {
  ultimo_contato: string | null
  contatos_whatsapp: string | null
}

export async function getPendenciasWhatsApp(): Promise<PendenciaWhatsApp[]> {
  const pedidos = db.prepare(`
    SELECT p.id, p.numero_orcamento, p.nome_da_peca,
      c.nome AS cliente_nome, c.telefone AS cliente_telefone,
      p.valor_total_cobrado, p.orcamento_status, p.status, p.vencimento_em,
      COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS total_recebido,
      MAX(0, p.valor_total_cobrado - COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)) AS saldo_pendente,
      (SELECT MAX(h.criado_em) FROM historico_pedidos h
        WHERE h.pedido_id = p.id AND h.evento LIKE 'WhatsApp:%') AS ultimo_contato,
      (SELECT GROUP_CONCAT(h.evento, '||') FROM historico_pedidos h
        WHERE h.pedido_id = p.id AND h.evento LIKE 'WhatsApp:%') AS contatos_whatsapp
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND p.status != 'Cancelado'
      AND c.telefone IS NOT NULL AND trim(c.telefone) != ''
      AND (
        p.status = 'Finalizado'
        OR p.orcamento_status = 'Enviado'
        OR (p.orcamento_status = 'Aprovado' AND p.vencimento_em IS NOT NULL
          AND date(p.vencimento_em) < date('now'))
      )
    ORDER BY
      CASE
        WHEN p.orcamento_status = 'Aprovado' AND p.valor_total_cobrado >
          COALESCE((SELECT SUM(r.valor) FROM recebimentos r
            WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) THEN 0
        WHEN p.orcamento_status = 'Enviado' THEN 1
        ELSE 2
      END,
      COALESCE(ultimo_contato, '0000-00-00') ASC,
      p.data_pedido ASC
    LIMIT 30
  `).all(TENANT_ID) as PedidoPendenteRow[]

  return pedidos
    .map((pedido) => {
      const tipo_sugerido = sugerirTipoMensagemWhatsApp({
        orcamentoStatus: pedido.orcamento_status,
        status: pedido.status,
        saldoPendente: pedido.saldo_pendente,
        vencimentoEm: pedido.vencimento_em,
      }) as TipoMensagemWhatsApp
      return { ...pedido, tipo_sugerido }
    })
    .filter((pedido) => !contatoWhatsAppJaRegistrado(
      pedido.tipo_sugerido,
      pedido.contatos_whatsapp,
    ))
    .slice(0, 12)
}

export async function registrarContatoWhatsApp(dados: {
  pedidoId: number
  tipo: TipoMensagemWhatsApp
  mensagem: string
}): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(dados.pedidoId) || dados.pedidoId <= 0) {
      return { success: false, message: 'Pedido inválido.' }
    }
    if (!TIPOS_MENSAGEM_WHATSAPP.includes(dados.tipo)) {
      return { success: false, message: 'Modelo de mensagem inválido.' }
    }
    const mensagem = dados.mensagem.trim()
    if (!mensagem || mensagem.length > 2_000) {
      return { success: false, message: 'A mensagem deve ter entre 1 e 2.000 caracteres.' }
    }
    const pedido = db.prepare(`
      SELECT p.id, p.numero_orcamento, p.cliente_id, c.telefone
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = ? AND p.tenant_id = ? AND c.tenant_id = ?
    `).get(dados.pedidoId, TENANT_ID, TENANT_ID) as {
      id: number
      numero_orcamento: string | null
      cliente_id: number
      telefone: string | null
    } | undefined
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }
    if (!pedido.telefone?.trim()) return { success: false, message: 'Cliente sem telefone cadastrado.' }

    const rotulo = ROTULOS_MENSAGEM_WHATSAPP[dados.tipo]
    db.transaction(() => {
      db.prepare(`
        INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        TENANT_ID,
        pedido.id,
        USUARIO_ID,
        `WhatsApp: ${rotulo}`,
        `Conversa aberta com a mensagem: ${mensagem}`,
      )
      db.prepare(`
        UPDATE clientes SET ultimo_contato = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ? AND tenant_id = ?
      `).run(pedido.cliente_id, TENANT_ID)
      registrarAuditoria(db, {
        entidade: 'Pedido',
        entidadeId: pedido.id,
        acao: 'WHATSAPP_ABERTO',
        descricao: `${rotulo} — ${pedido.numero_orcamento || `#${pedido.id}`}`,
        detalhes: { tipo: dados.tipo, mensagem },
      })
    })()

    revalidatePath('/')
    revalidatePath('/orcamentos')
    revalidatePath('/clientes')
    revalidatePath(`/clientes/${pedido.cliente_id}`)
    revalidatePath(`/pedidos/${pedido.id}`)
    revalidatePath('/agenda')
    return { success: true, message: 'Contato registrado no histórico do pedido.' }
  } catch (error) {
    console.error('[registrarContatoWhatsApp]', error)
    return { success: false, message: 'Não foi possível registrar o contato.' }
  }
}

export interface EnvioWhatsAppOficial {
  id: number
  pedido_id: number
  numero_orcamento: string | null
  cliente_nome: string
  telefone: string
  tipo: string
  template_nome: string
  status: 'Fila' | 'Enviando' | 'Enviado' | 'Entregue' | 'Lido' | 'Falhou'
  tentativas: number
  erro: string | null
  criado_em: string
}

async function processarEnvio(id: number, tenantId: number) {
  const config = configuracaoWhatsApp()
  if (!config.configurado) throw new Error(`CONFIG:${config.ausentes.join(', ')}`)
  const envio = db.prepare(`SELECT id, telefone, template_nome, template_idioma, mensagem
    FROM whatsapp_envios WHERE id = ? AND tenant_id = ?`).get(id, tenantId) as {
      id: number; telefone: string; template_nome: string; template_idioma: string; mensagem: string
    } | undefined
  if (!envio) throw new Error('NOT_FOUND')
  db.prepare(`UPDATE whatsapp_envios SET status = 'Enviando', tentativas = tentativas + 1, erro = NULL
    WHERE id = ? AND tenant_id = ?`).run(id, tenantId)
  try {
    const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadTemplateWhatsApp({
        telefone: envio.telefone, template: envio.template_nome,
        idioma: envio.template_idioma, mensagem: envio.mensagem,
      })),
      cache: 'no-store',
    })
    const resposta = await response.json().catch(() => ({})) as {
      messages?: Array<{ id?: string }>; error?: { message?: string; code?: number }
    }
    const wamid = resposta.messages?.[0]?.id
    if (!response.ok || !wamid) {
      const detalhe = resposta.error?.message || `HTTP ${response.status}`
      throw new Error(detalhe.slice(0, 500))
    }
    db.prepare(`UPDATE whatsapp_envios SET status = 'Enviado', wamid = ?,
      enviado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), erro = NULL WHERE id = ? AND tenant_id = ?`
    ).run(wamid, id, tenantId)
    return wamid
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : 'Falha desconhecida'
    db.prepare(`UPDATE whatsapp_envios SET status = 'Falhou', erro = ? WHERE id = ? AND tenant_id = ?`)
      .run(mensagem.slice(0, 500), id, tenantId)
    throw error
  }
}

export async function enviarWhatsAppOficial(dados: {
  pedidoId: number
  tipo: TipoMensagemWhatsApp
  mensagem: string
}): Promise<{ success: boolean; message: string }> {
  let envioId: number | null = null
  try {
    const sessao = await exigirSessao()
    if (!Number.isSafeInteger(dados.pedidoId) || dados.pedidoId <= 0 || !TIPOS_MENSAGEM_WHATSAPP.includes(dados.tipo)) {
      return { success: false, message: 'Dados do envio inválidos.' }
    }
    const mensagem = dados.mensagem.trim()
    if (!mensagem || mensagem.length > 2_000) return { success: false, message: 'A mensagem deve ter entre 1 e 2.000 caracteres.' }
    const config = configuracaoWhatsApp()
    if (!config.configurado) return { success: false, message: `Integração oficial ainda não configurada: ${config.ausentes.join(', ')}.` }
    const template = nomeTemplateWhatsApp(dados.tipo)
    if (!template.nome) return { success: false, message: `Configure ${template.chave} com o nome do template aprovado pela Meta.` }
    const pedido = db.prepare(`SELECT p.id, p.numero_orcamento, p.cliente_id,
        c.telefone, c.nome AS cliente_nome
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
      WHERE p.id = ? AND p.tenant_id = ?`
    ).get(dados.pedidoId, sessao.tenantId) as {
      id: number; numero_orcamento: string | null; cliente_id: number; telefone: string | null; cliente_nome: string
    } | undefined
    if (!pedido) return { success: false, message: 'Pedido não encontrado.' }
    const telefone = normalizarTelefoneWhatsApp(pedido.telefone)
    if (!telefone) return { success: false, message: 'Cliente sem telefone brasileiro válido.' }
    const result = db.prepare(`INSERT INTO whatsapp_envios (
      tenant_id, usuario_id, pedido_id, cliente_id, telefone, tipo, mensagem,
      template_nome, template_idioma
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sessao.tenantId, sessao.usuarioId, pedido.id, pedido.cliente_id, telefone,
      dados.tipo, mensagem, template.nome, config.languageCode)
    envioId = Number(result.lastInsertRowid)
    const wamid = await processarEnvio(envioId, sessao.tenantId)
    db.transaction(() => {
      db.prepare(`INSERT INTO historico_pedidos (tenant_id, pedido_id, usuario_id, evento, descricao)
        VALUES (?, ?, ?, ?, ?)`
      ).run(sessao.tenantId, pedido.id, sessao.usuarioId,
        `WhatsApp: ${ROTULOS_MENSAGEM_WHATSAPP[dados.tipo]}`,
        `Mensagem enviada pela API oficial. Identificador: ${wamid}`)
      db.prepare(`UPDATE clientes SET ultimo_contato = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ? AND tenant_id = ?`).run(pedido.cliente_id, sessao.tenantId)
      registrarAuditoria(db, { entidade: 'WhatsAppEnvio', entidadeId: envioId!, acao: 'ENVIAR', descricao: `${pedido.numero_orcamento || `#${pedido.id}`} para ${pedido.cliente_nome}` })
    })()
    revalidatePath('/')
    revalidatePath('/configuracoes/integracoes')
    revalidatePath(`/pedidos/${pedido.id}`)
    return {
      success: true,
      message: config.testMode
        ? 'Teste aceito pela API oficial. A Meta enviará o template hello_world; o texto editado no ERP só será usado após a aprovação dos templates próprios.'
        : 'Mensagem aceita pela API oficial. A entrega será atualizada pelo webhook.',
    }
  } catch (error) {
    console.error('[enviarWhatsAppOficial]', error)
    const detalhe = error instanceof Error ? error.message : ''
    return { success: false, message: envioId ? `Envio registrado, mas falhou: ${detalhe}` : 'Não foi possível enviar pela API oficial.' }
  }
}

export async function reenviarWhatsAppOficial(id: number) {
  try {
    const sessao = await exigirSessao()
    const envio = db.prepare(`SELECT status FROM whatsapp_envios WHERE id = ? AND tenant_id = ?`)
      .get(id, sessao.tenantId) as { status: string } | undefined
    if (!envio) return { success: false, message: 'Envio não encontrado.' }
    if (envio.status !== 'Falhou' && envio.status !== 'Fila') {
      return { success: false, message: `O envio já está com status “${envio.status}” e não será duplicado.` }
    }
    await processarEnvio(id, sessao.tenantId)
    revalidatePath('/configuracoes/integracoes')
    return { success: true, message: 'Mensagem reenviada para a API oficial.' }
  } catch (error) {
    console.error('[reenviarWhatsAppOficial]', error)
    return { success: false, message: `Não foi possível reenviar: ${error instanceof Error ? error.message : 'erro desconhecido'}` }
  }
}

export async function getEnviosWhatsAppOficial(): Promise<EnvioWhatsAppOficial[]> {
  const sessao = await exigirSessao()
  return db.prepare(`SELECT w.id, w.pedido_id, p.numero_orcamento, c.nome AS cliente_nome,
      w.telefone, w.tipo, w.template_nome, w.status, w.tentativas, w.erro, w.criado_em
    FROM whatsapp_envios w JOIN pedidos p ON p.id = w.pedido_id
    JOIN clientes c ON c.id = w.cliente_id
    WHERE w.tenant_id = ? ORDER BY w.criado_em DESC, w.id DESC LIMIT 100`
  ).all(sessao.tenantId) as EnvioWhatsAppOficial[]
}
