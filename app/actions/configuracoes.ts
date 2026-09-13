'use server'

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

export interface ConfiguracoesTenant {
  meta_mensal: number
  taxa_operacional: number
  custo_hora_maquina: number
}

export interface ActionResult {
  success: boolean
  message: string
}

export async function getConfiguracoes(): Promise<ConfiguracoesTenant> {
  return db
    .prepare(
      `SELECT meta_mensal, taxa_operacional, custo_hora_maquina
       FROM tenants
       WHERE id = ?`
    )
    .get(TENANT_ID) as ConfiguracoesTenant
}

export async function salvarConfiguracoes(data: ConfiguracoesTenant): Promise<ActionResult> {
  try {
    if (data.meta_mensal < 0 || data.taxa_operacional < 0 || data.custo_hora_maquina < 0) {
      return { success: false, message: 'Os valores não podem ser negativos.' }
    }

    db.prepare(`
      UPDATE tenants 
      SET meta_mensal = ?, taxa_operacional = ?, custo_hora_maquina = ?
      WHERE id = ?
    `).run(data.meta_mensal, data.taxa_operacional, data.custo_hora_maquina, TENANT_ID)

    revalidatePath('/')
    revalidatePath('/configuracoes')
    revalidatePath('/orcamentos')
    
    return { success: true, message: 'Configurações salvas com sucesso!' }
  } catch (error) {
    console.error('[salvarConfiguracoes]', error)
    return { success: false, message: 'Erro interno ao salvar configurações.' }
  }
}
