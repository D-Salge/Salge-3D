'use server'

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

export interface ConfiguracoesTenant {
  meta_mensal: number
  taxa_operacional: number
  custo_hora_maquina: number
  tarifa_energia_kwh: number
  potencia_impressora_w: number
}

export interface ActionResult {
  success: boolean
  message: string
}

export async function getConfiguracoes(): Promise<ConfiguracoesTenant> {
  return db
    .prepare(
      `SELECT meta_mensal, taxa_operacional, custo_hora_maquina,
              tarifa_energia_kwh, potencia_impressora_w
       FROM tenants
       WHERE id = ?`
    )
    .get(TENANT_ID) as ConfiguracoesTenant
}

export async function salvarConfiguracoes(data: ConfiguracoesTenant): Promise<ActionResult> {
  try {
    if (
      data.meta_mensal < 0 ||
      data.taxa_operacional < 0 ||
      data.custo_hora_maquina < 0 ||
      data.tarifa_energia_kwh < 0 ||
      data.potencia_impressora_w < 0
    ) {
      return { success: false, message: 'Os valores nao podem ser negativos.' }
    }

    db.prepare(`
      UPDATE tenants
      SET meta_mensal           = ?,
          taxa_operacional      = ?,
          custo_hora_maquina    = ?,
          tarifa_energia_kwh    = ?,
          potencia_impressora_w = ?
      WHERE id = ?
    `).run(
      data.meta_mensal,
      data.taxa_operacional,
      data.custo_hora_maquina,
      data.tarifa_energia_kwh,
      data.potencia_impressora_w,
      TENANT_ID,
    )

    revalidatePath('/')
    revalidatePath('/configuracoes')
    revalidatePath('/orcamentos')

    return { success: true, message: 'Configuracoes salvas com sucesso!' }
  } catch (error) {
    console.error('[salvarConfiguracoes]', error)
    return { success: false, message: 'Erro interno ao salvar configuracoes.' }
  }
}
