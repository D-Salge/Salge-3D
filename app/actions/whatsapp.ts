'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { ROTULOS_MENSAGEM_WHATSAPP, TIPOS_MENSAGEM_WHATSAPP } from '@/lib/whatsapp.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export type TipoMensagemWhatsApp = 'orcamento' | 'cobranca' | 'producao' | 'pronto'

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

type PedidoPendenteRow = PedidoWhatsApp & { ultimo_contato: string | null }

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
        WHERE h.pedido_id = p.id AND h.evento LIKE 'WhatsApp:%') AS ultimo_contato
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND p.status != 'Cancelado'
      AND c.telefone IS NOT NULL AND trim(c.telefone) != ''
      AND (
        p.orcamento_status = 'Enviado'
        OR (p.orcamento_status = 'Aprovado' AND p.status = 'Finalizado')
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

  const limiteRecente = Date.now() - 24 * 60 * 60 * 1000
  return pedidos
    .filter((pedido) => !pedido.ultimo_contato || new Date(pedido.ultimo_contato).getTime() < limiteRecente)
    .map((pedido) => {
      let tipo_sugerido: TipoMensagemWhatsApp = 'pronto'
      if (pedido.orcamento_status === 'Aprovado' && pedido.saldo_pendente > 0.009) {
        tipo_sugerido = 'cobranca'
      } else if (pedido.orcamento_status === 'Enviado') {
        tipo_sugerido = 'orcamento'
      }
      return { ...pedido, tipo_sugerido }
    })
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
      SELECT p.id, p.numero_orcamento, c.telefone
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = ? AND p.tenant_id = ? AND c.tenant_id = ?
    `).get(dados.pedidoId, TENANT_ID, TENANT_ID) as {
      id: number
      numero_orcamento: string | null
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
    revalidatePath(`/pedidos/${pedido.id}`)
    return { success: true, message: 'Contato registrado no histórico do pedido.' }
  } catch (error) {
    console.error('[registrarContatoWhatsApp]', error)
    return { success: false, message: 'Não foi possível registrar o contato.' }
  }
}
