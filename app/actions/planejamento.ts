'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { planejarFilaProducao } from '@/lib/producao.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

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
  inicio_previsto_calculado: string
  fim_previsto_calculado: string
  atrasado: boolean
}

export interface FilaImpressoraPlanejada {
  id: number
  nome: string
  modelo: string | null
  status: string
  pedidos: PedidoPlanejado[]
  horas_planejadas: number
  livre_em: string
  atrasados: number
}

export interface PlanejamentoProducao {
  impressoras: FilaImpressoraPlanejada[]
  semImpressora: Omit<PedidoPlanejado, 'inicio_previsto_calculado' | 'fim_previsto_calculado' | 'atrasado'>[]
}

function calcularPlanejamento(): PlanejamentoProducao {
  const impressoras = db.prepare(`
    SELECT id, nome, modelo, status FROM impressoras
    WHERE tenant_id = ? AND ativo = 1 AND status IN ('Disponivel', 'Em uso')
    ORDER BY nome
  `).all(TENANT_ID) as Array<{ id: number; nome: string; modelo: string | null; status: string }>
  const pedidos = db.prepare(`
    SELECT p.id, p.numero_orcamento, p.nome_da_peca, c.nome AS cliente_nome,
      p.status, p.tempo_impressao_horas, p.data_entrega, p.data_pedido, p.impressora_id
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id
    WHERE p.tenant_id = ? AND p.orcamento_status = 'Aprovado'
      AND p.status IN ('Fila', 'Imprimindo')
    ORDER BY p.data_pedido, p.id
  `).all(TENANT_ID)
  return planejarFilaProducao({ impressoras, pedidos, agora: new Date().toISOString() }) as PlanejamentoProducao
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
