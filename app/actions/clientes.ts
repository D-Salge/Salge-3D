'use server'

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

export interface Cliente {
  id: number
  nome: string
  telefone: string | null
  email: string | null
  instagram: string | null
  cidade: string | null
  origem: string | null
  tipo_cliente: string | null
  observacoes: string | null
  ultimo_contato: string | null
  criado_em?: string
  total_pedidos?: number
  total_vendido?: number
  saldo_pendente?: number
}

export interface ClientePedidoResumo {
  id: number
  numero_orcamento: string | null
  nome_da_peca: string
  quantidade: number
  valor_total_cobrado: number
  total_recebido: number
  saldo_pendente: number
  orcamento_status: string
  status: string
  data_pedido: string
}

export interface ClienteContato {
  id: number
  pedido_id: number
  numero_orcamento: string | null
  evento: string
  descricao: string
  criado_em: string
}

export interface ClienteDetalhes extends Cliente {
  total_pedidos: number
  pedidos_aprovados: number
  total_vendido: number
  total_recebido: number
  saldo_pendente: number
  ticket_medio: number
  pedidos: ClientePedidoResumo[]
  contatos: ClienteContato[]
}

export interface SalvarClienteInput {
  id: number | null
  nome: string
  telefone: string
  email: string
  instagram: string
  cidade: string
  origem: string
  tipoCliente: string
  observacoes: string
}

export interface ActionResult {
  success: boolean
  message: string
}

export async function getClientesLista(): Promise<Cliente[]> {
  return db
    .prepare(
      `SELECT c.id, c.nome, c.telefone, c.email, c.instagram, c.cidade, c.origem,
         c.tipo_cliente, c.observacoes, c.ultimo_contato, c.criado_em,
         (SELECT COUNT(*) FROM pedidos p
           WHERE p.cliente_id = c.id AND p.status != 'Cancelado') AS total_pedidos,
         COALESCE((SELECT SUM(p.valor_total_cobrado) FROM pedidos p
           WHERE p.cliente_id = c.id AND p.orcamento_status = 'Aprovado'
             AND p.status != 'Cancelado'), 0) AS total_vendido,
         MAX(0,
           COALESCE((SELECT SUM(p.valor_total_cobrado) FROM pedidos p
             WHERE p.cliente_id = c.id AND p.orcamento_status = 'Aprovado'
               AND p.status != 'Cancelado'), 0) -
           COALESCE((SELECT SUM(r.valor) FROM recebimentos r
             JOIN pedidos p ON p.id = r.pedido_id
             WHERE p.cliente_id = c.id AND p.orcamento_status = 'Aprovado'
               AND p.status != 'Cancelado' AND r.estornado_em IS NULL), 0)
         ) AS saldo_pendente
       FROM clientes c
       WHERE c.tenant_id = ? AND c.ativo = 1
       ORDER BY c.nome ASC`
    )
    .all(TENANT_ID) as Cliente[]
}

export async function getClienteDetalhes(clienteId: number): Promise<ClienteDetalhes | null> {
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) return null

  const cliente = db.prepare(`
    SELECT c.id, c.nome, c.telefone, c.email, c.instagram, c.cidade, c.origem,
      c.tipo_cliente, c.observacoes,
      COALESCE((SELECT MAX(h.criado_em) FROM historico_pedidos h
        JOIN pedidos ph ON ph.id = h.pedido_id
        WHERE ph.cliente_id = c.id AND h.evento LIKE 'WhatsApp:%'), c.ultimo_contato) AS ultimo_contato,
      c.criado_em,
      (SELECT COUNT(*) FROM pedidos p
        WHERE p.cliente_id = c.id AND p.status != 'Cancelado') AS total_pedidos,
      (SELECT COUNT(*) FROM pedidos p
        WHERE p.cliente_id = c.id AND p.orcamento_status = 'Aprovado'
          AND p.status != 'Cancelado') AS pedidos_aprovados,
      COALESCE((SELECT SUM(p.valor_total_cobrado) FROM pedidos p
        WHERE p.cliente_id = c.id AND p.orcamento_status = 'Aprovado'
          AND p.status != 'Cancelado'), 0) AS total_vendido,
      COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        JOIN pedidos p ON p.id = r.pedido_id
        WHERE p.cliente_id = c.id AND p.orcamento_status = 'Aprovado'
          AND p.status != 'Cancelado' AND r.estornado_em IS NULL), 0) AS total_recebido
    FROM clientes c
    WHERE c.id = ? AND c.tenant_id = ? AND c.ativo = 1
  `).get(clienteId, TENANT_ID) as Omit<ClienteDetalhes, 'pedidos' | 'contatos' | 'saldo_pendente' | 'ticket_medio'> | undefined
  if (!cliente) return null

  const pedidos = db.prepare(`
    SELECT p.id, p.numero_orcamento, p.nome_da_peca, p.quantidade,
      p.valor_total_cobrado, p.orcamento_status, p.status, p.data_pedido,
      COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0) AS total_recebido,
      MAX(0, p.valor_total_cobrado - COALESCE((SELECT SUM(r.valor) FROM recebimentos r
        WHERE r.pedido_id = p.id AND r.estornado_em IS NULL), 0)) AS saldo_pendente
    FROM pedidos p
    WHERE p.cliente_id = ? AND p.tenant_id = ?
    ORDER BY p.data_pedido DESC, p.id DESC
  `).all(clienteId, TENANT_ID) as ClientePedidoResumo[]

  const contatos = db.prepare(`
    SELECT h.id, h.pedido_id, p.numero_orcamento, h.evento, h.descricao, h.criado_em
    FROM historico_pedidos h
    JOIN pedidos p ON p.id = h.pedido_id AND p.tenant_id = h.tenant_id
    WHERE p.cliente_id = ? AND h.tenant_id = ? AND h.evento LIKE 'WhatsApp:%'
    ORDER BY h.criado_em DESC, h.id DESC
    LIMIT 30
  `).all(clienteId, TENANT_ID) as ClienteContato[]

  const saldoPendente = Math.max(0, cliente.total_vendido - cliente.total_recebido)
  const ticketMedio = cliente.pedidos_aprovados > 0
    ? cliente.total_vendido / cliente.pedidos_aprovados
    : 0
  return {
    ...cliente,
    saldo_pendente: saldoPendente,
    ticket_medio: ticketMedio,
    pedidos,
    contatos,
  }
}

export async function salvarCliente(dados: SalvarClienteInput): Promise<ActionResult> {
  try {
    if (!dados.nome.trim()) return { success: false, message: 'O nome é obrigatório.' }
    if (dados.nome.trim().length > 160) return { success: false, message: 'O nome deve ter até 160 caracteres.' }
    if (dados.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim())) {
      return { success: false, message: 'Informe um e-mail válido.' }
    }
    if (dados.observacoes.length > 2_000) {
      return { success: false, message: 'As observações devem ter até 2.000 caracteres.' }
    }

    const valores = [
      dados.nome.trim(),
      dados.telefone.trim() || null,
      dados.email.trim() || null,
      dados.instagram.trim() || null,
      dados.cidade.trim() || null,
      dados.origem || null,
      dados.tipoCliente || null,
      dados.observacoes.trim() || null,
    ]

    if (dados.id) {
      db.prepare(
        `UPDATE clientes SET nome = ?, telefone = ?, email = ?, instagram = ?, cidade = ?,
          origem = ?, tipo_cliente = ?, observacoes = ? WHERE id = ? AND tenant_id = ?`,
      ).run(...valores, dados.id, TENANT_ID)
    } else {
      db.prepare(
        `INSERT INTO clientes (
          tenant_id, usuario_id, nome, telefone, email, instagram, cidade,
          origem, tipo_cliente, observacoes
        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(TENANT_ID, ...valores)
    }

    revalidatePath('/clientes')
    if (dados.id) revalidatePath(`/clientes/${dados.id}`)
    revalidatePath('/orcamentos')
    return { success: true, message: dados.id ? 'Cliente atualizado!' : 'Cliente criado!' }
  } catch (error) {
    console.error('[salvarCliente]', error)
    return { success: false, message: 'Erro interno ao salvar.' }
  }
}

export async function deletarCliente(id: number): Promise<ActionResult> {
  try {
    const res = db.prepare(
      'UPDATE clientes SET ativo = 0 WHERE id = ? AND tenant_id = ? AND ativo = 1',
    ).run(id, TENANT_ID)
    if (res.changes === 0) return { success: false, message: 'Cliente não encontrado.' }

    revalidatePath('/clientes')
    revalidatePath('/orcamentos')
    return { success: true, message: 'Cliente arquivado com segurança!' }
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
    ) {
      return { success: false, message: 'Este cliente possui orçamentos/pedidos e não pode ser excluído.' }
    }
    console.error('[deletarCliente]', error)
    return { success: false, message: 'Erro interno ao excluir.' }
  }
}
