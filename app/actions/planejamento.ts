'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { planejarFilaProducao } from '@/lib/producao.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface BloqueioImpressoraPlanejamento {
  id: number
  impressora_id: number
  impressora_nome: string
  inicio_em: string
  fim_em: string
  motivo: string
}

export interface PedidoPlanejado {
  id: number
  numero_orcamento: string | null
  nome_da_peca: string
  cliente_nome: string
  status: string
  tempo_impressao_horas: number
  data_entrega: string | null
  data_pedido: string
  impressora_id: number | null
  prioridade_producao: 'Normal' | 'Alta' | 'Urgente'
  ordem_fila: number | null
  impressora_preferida_id: number | null
  diametro_bico_mm: number | null
  inicio_previsto_calculado: string
  fim_previsto_calculado: string
  atrasado: boolean
  incompatibilidade_tecnica: boolean
}

export interface PedidoSemImpressora extends Omit<PedidoPlanejado, 'inicio_previsto_calculado' | 'fim_previsto_calculado' | 'atrasado' | 'incompatibilidade_tecnica'> {
  impressora_sugerida_id: number | null
  impressora_sugerida_nome: string | null
  inicio_previsto_sugerido: string | null
  fim_previsto_sugerido: string | null
  atrasado_sugerido: boolean
}

export interface FilaImpressoraPlanejada {
  id: number
  nome: string
  modelo: string | null
  status: string
  intervalo_entre_trabalhos_minutos: number
  bloqueios: BloqueioImpressoraPlanejamento[]
  pedidos: PedidoPlanejado[]
  horas_planejadas: number
  livre_em: string
  atrasados: number
}

export interface PlanejamentoProducao {
  impressoras: FilaImpressoraPlanejada[]
  semImpressora: PedidoSemImpressora[]
}

function calcularPlanejamento(): PlanejamentoProducao {
  const impressoras = db.prepare(`
    SELECT id, nome, modelo, status, bico_atual, intervalo_entre_trabalhos_minutos FROM impressoras
    WHERE tenant_id = ? AND ativo = 1 AND status IN ('Disponivel', 'Em uso')
    ORDER BY nome
  `).all(TENANT_ID) as Array<{ id: number; nome: string; modelo: string | null; status: string; bico_atual: string | null; intervalo_entre_trabalhos_minutos: number }>
  const bloqueios = db.prepare(`
    SELECT b.id, b.impressora_id, imp.nome AS impressora_nome, b.inicio_em, b.fim_em, b.motivo
    FROM bloqueios_impressora b
    JOIN impressoras imp ON imp.id = b.impressora_id AND imp.tenant_id = b.tenant_id
    WHERE b.tenant_id = ? AND datetime(b.fim_em) > datetime('now')
    ORDER BY datetime(b.inicio_em), b.id
  `).all(TENANT_ID) as BloqueioImpressoraPlanejamento[]
  const pedidos = db.prepare(`
    SELECT p.id, p.numero_orcamento, p.nome_da_peca, c.nome AS cliente_nome,
      p.status, p.tempo_impressao_horas, p.data_entrega, p.data_pedido, p.impressora_id,
      p.prioridade_producao, p.ordem_fila, pv.impressora_preferida_id, pv.diametro_bico_mm
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN produto_versoes pv ON pv.id = p.produto_versao_id
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Aprovado'
      AND p.status IN ('Fila', 'Imprimindo')
    ORDER BY p.data_pedido, p.id
  `).all(TENANT_ID)
  const impressorasComBloqueios = impressoras.map((impressora) => ({
    ...impressora,
    bloqueios: bloqueios.filter((bloqueio) => bloqueio.impressora_id === impressora.id),
  }))
  return planejarFilaProducao({ impressoras: impressorasComBloqueios, pedidos, agora: new Date().toISOString() }) as PlanejamentoProducao
}

export async function getPlanejamentoProducao(): Promise<PlanejamentoProducao> {
  return calcularPlanejamento()
}

export async function aplicarPlanejamentoProducao(): Promise<{ success: boolean; message: string }> {
  try {
    const plano = calcularPlanejamento()
    const aplicar = db.transaction(() => {
      const atualizar = db.prepare(`
        UPDATE pedidos SET inicio_previsto = ?, fim_previsto = ?
        WHERE id = ? AND tenant_id = ? AND impressora_id = ?
          AND orcamento_status = 'Aprovado' AND status IN ('Fila', 'Imprimindo')
      `)
      for (const impressora of plano.impressoras) {
        for (const pedido of impressora.pedidos) {
          if (atualizar.run(
            pedido.inicio_previsto_calculado,
            pedido.fim_previsto_calculado,
            pedido.id,
            TENANT_ID,
            impressora.id,
          ).changes !== 1) throw new Error('PEDIDO_ALTERADO')
          registrarAuditoria(db, {
            entidade: 'Pedido', entidadeId: pedido.id, acao: 'PLANEJAR_PRODUCAO',
            descricao: `${impressora.nome}: ${pedido.inicio_previsto_calculado} → ${pedido.fim_previsto_calculado}`,
          })
        }
      }
    })
    aplicar.immediate()
    revalidatePath('/producao')
    revalidatePath('/impressoras')
    return { success: true, message: 'Planejamento aplicado aos pedidos atribuídos.' }
  } catch (error) {
    if (error instanceof Error && error.message === 'PEDIDO_ALTERADO') {
      return { success: false, message: 'Um pedido mudou durante o planejamento. Atualize a página e tente novamente.' }
    }
    console.error('[aplicarPlanejamentoProducao]', error)
    return { success: false, message: 'Erro interno ao aplicar o planejamento.' }
  }
}

export async function atualizarPrioridadeProducao(
  pedidoId: number,
  prioridade: 'Normal' | 'Alta' | 'Urgente',
): Promise<{ success: boolean; message: string }> {
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !['Normal', 'Alta', 'Urgente'].includes(prioridade)) {
    return { success: false, message: 'Pedido ou prioridade inválida.' }
  }
  const result = db.prepare(`UPDATE pedidos SET prioridade_producao = ?
    WHERE id = ? AND tenant_id = ? AND orcamento_status = 'Aprovado'
      AND status IN ('Fila', 'Imprimindo', 'Acabamento')`
  ).run(prioridade, pedidoId, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Pedido ativo não encontrado.' }
  registrarAuditoria(db, { entidade: 'Pedido', entidadeId: pedidoId, acao: 'PRIORIDADE_PRODUCAO', descricao: prioridade })
  revalidatePath('/producao')
  revalidatePath(`/pedidos/${pedidoId}`)
  return { success: true, message: `Prioridade alterada para ${prioridade}.` }
}

export async function moverPedidoNaFila(
  pedidoId: number,
  direcao: 'subir' | 'descer',
): Promise<{ success: boolean; message: string }> {
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !['subir', 'descer'].includes(direcao)) {
    return { success: false, message: 'Movimento inválido.' }
  }
  try {
    let mudou = false
    const mover = db.transaction(() => {
      const atual = db.prepare(`SELECT id, impressora_id, prioridade_producao, COALESCE(ordem_fila, id) AS ordem_fila
        FROM pedidos WHERE id = ? AND tenant_id = ? AND orcamento_status = 'Aprovado' AND status = 'Fila'`
      ).get(pedidoId, TENANT_ID) as { id: number; impressora_id: number | null; prioridade_producao: string; ordem_fila: number } | undefined
      if (!atual) throw new Error('NOT_FOUND')
      const fila = db.prepare(`SELECT id, COALESCE(ordem_fila, id) AS ordem_fila FROM pedidos
        WHERE tenant_id = ? AND orcamento_status = 'Aprovado' AND status = 'Fila'
          AND prioridade_producao = ?
          AND ((impressora_id = ?) OR (impressora_id IS NULL AND ? IS NULL))
        ORDER BY COALESCE(ordem_fila, id), id`
      ).all(TENANT_ID, atual.prioridade_producao, atual.impressora_id, atual.impressora_id) as Array<{ id: number; ordem_fila: number }>
      const indice = fila.findIndex((item) => item.id === pedidoId)
      const destino = direcao === 'subir' ? indice - 1 : indice + 1
      if (indice < 0 || destino < 0 || destino >= fila.length) return
      const outro = fila[destino]
      db.prepare('UPDATE pedidos SET ordem_fila = ? WHERE id = ? AND tenant_id = ?').run(outro.ordem_fila, atual.id, TENANT_ID)
      db.prepare('UPDATE pedidos SET ordem_fila = ? WHERE id = ? AND tenant_id = ?').run(atual.ordem_fila, outro.id, TENANT_ID)
      mudou = true
      registrarAuditoria(db, { entidade: 'Pedido', entidadeId: pedidoId, acao: 'REORDENAR_FILA', descricao: direcao })
    })
    mover.immediate()
    revalidatePath('/producao')
    return { success: mudou, message: mudou ? 'Ordem da fila atualizada.' : 'O pedido já está no limite desta prioridade.' }
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return { success: false, message: 'Pedido em fila não encontrado.' }
    console.error('[moverPedidoNaFila]', error)
    return { success: false, message: 'Não foi possível reordenar a fila.' }
  }
}

export async function salvarBloqueioImpressora(data: {
  impressoraId: number
  inicioEm: string
  fimEm: string
  motivo: string
}): Promise<{ success: boolean; message: string }> {
  const inicio = new Date(data.inicioEm)
  const fim = new Date(data.fimEm)
  if (!Number.isSafeInteger(data.impressoraId) || data.impressoraId <= 0 ||
      Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim <= inicio) {
    return { success: false, message: 'Informe uma impressora e um período válido.' }
  }
  if (!data.motivo.trim() || data.motivo.trim().length > 160) {
    return { success: false, message: 'Informe um motivo de até 160 caracteres.' }
  }
  if (!db.prepare('SELECT 1 FROM impressoras WHERE id = ? AND tenant_id = ? AND ativo = 1').get(data.impressoraId, TENANT_ID)) {
    return { success: false, message: 'Impressora não encontrada.' }
  }
  const sobreposto = db.prepare(`SELECT 1 FROM bloqueios_impressora
    WHERE tenant_id = ? AND impressora_id = ? AND inicio_em < ? AND fim_em > ?`
  ).get(TENANT_ID, data.impressoraId, fim.toISOString(), inicio.toISOString())
  if (sobreposto) return { success: false, message: 'Já existe um bloqueio nesse período.' }
  const result = db.prepare(`INSERT INTO bloqueios_impressora
    (tenant_id, usuario_id, impressora_id, inicio_em, fim_em, motivo) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(TENANT_ID, USUARIO_ID, data.impressoraId, inicio.toISOString(), fim.toISOString(), data.motivo.trim())
  registrarAuditoria(db, { entidade: 'BloqueioImpressora', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR',
    descricao: data.motivo.trim(), detalhes: { impressoraId: data.impressoraId, inicio: inicio.toISOString(), fim: fim.toISOString() } })
  revalidatePath('/producao')
  return { success: true, message: 'Bloqueio incluído no planejamento.' }
}

export async function removerBloqueioImpressora(id: number): Promise<{ success: boolean; message: string }> {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, message: 'Bloqueio inválido.' }
  const result = db.prepare('DELETE FROM bloqueios_impressora WHERE id = ? AND tenant_id = ?').run(id, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Bloqueio não encontrado.' }
  registrarAuditoria(db, { entidade: 'BloqueioImpressora', entidadeId: id, acao: 'REMOVER', descricao: 'Bloqueio removido' })
  revalidatePath('/producao')
  return { success: true, message: 'Bloqueio removido.' }
}

export async function aplicarAtribuicoesSugeridas(): Promise<{ success: boolean; message: string }> {
  try {
    const plano = calcularPlanejamento()
    const sugestoes = plano.semImpressora.filter((pedido) => pedido.impressora_sugerida_id)
    if (sugestoes.length === 0) return { success: false, message: 'Não há pedidos com atribuição sugerida.' }
    let aplicadas = 0
    const aplicar = db.transaction(() => {
      const atualizar = db.prepare(`UPDATE pedidos SET impressora_id = ?, inicio_previsto = ?, fim_previsto = ?
        WHERE id = ? AND tenant_id = ? AND impressora_id IS NULL
          AND orcamento_status = 'Aprovado' AND status = 'Fila'`)
      for (const pedido of sugestoes) {
        const result = atualizar.run(pedido.impressora_sugerida_id, pedido.inicio_previsto_sugerido,
          pedido.fim_previsto_sugerido, pedido.id, TENANT_ID)
        if (result.changes === 1) {
          aplicadas++
          registrarAuditoria(db, { entidade: 'Pedido', entidadeId: pedido.id, acao: 'ATRIBUICAO_AUTOMATICA',
            descricao: `${pedido.impressora_sugerida_nome}: ${pedido.inicio_previsto_sugerido} → ${pedido.fim_previsto_sugerido}` })
        }
      }
    })
    aplicar.immediate()
    revalidatePath('/producao')
    revalidatePath('/impressoras')
    return { success: aplicadas > 0, message: `${aplicadas} pedido(s) distribuído(s) automaticamente.` }
  } catch (error) {
    console.error('[aplicarAtribuicoesSugeridas]', error)
    return { success: false, message: 'Não foi possível distribuir os pedidos.' }
  }
}
