'use server'

import db from '@/lib/db'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1

export interface ConfiguracoesTenant {
  nome: string
  meta_mensal: number
  taxa_operacional: number
  custo_hora_maquina: number
  tarifa_energia_kwh: number
  potencia_impressora_w: number
  saldo_inicial_caixa: number
  margem_perdas_padrao: number
  taxa_venda_padrao: number
  valor_hora_trabalho: number
  fator_b2c_personalizado: number
  fator_b2c_lote: number
  fator_b2b_piloto: number
  fator_b2b_recorrente: number
  pedido_minimo_b2b: number
}

export interface ActionResult {
  success: boolean
  message: string
}

export async function getConfiguracoes(): Promise<ConfiguracoesTenant> {
  return db
    .prepare(
      `SELECT nome, meta_mensal, taxa_operacional, custo_hora_maquina,
              tarifa_energia_kwh, potencia_impressora_w, saldo_inicial_caixa,
              margem_perdas_padrao, taxa_venda_padrao, valor_hora_trabalho,
              fator_b2c_personalizado, fator_b2c_lote, fator_b2b_piloto,
              fator_b2b_recorrente, pedido_minimo_b2b
       FROM tenants
       WHERE id = ?`
    )
    .get(TENANT_ID) as ConfiguracoesTenant
}

export async function salvarConfiguracoes(data: ConfiguracoesTenant): Promise<ActionResult> {
  try {
    const nonNegative = [
      data.meta_mensal, data.taxa_operacional, data.custo_hora_maquina,
      data.tarifa_energia_kwh, data.potencia_impressora_w, data.saldo_inicial_caixa,
      data.margem_perdas_padrao, data.taxa_venda_padrao, data.valor_hora_trabalho,
      data.pedido_minimo_b2b,
    ]
    const factors = [data.fator_b2c_personalizado, data.fator_b2c_lote, data.fator_b2b_piloto, data.fator_b2b_recorrente]
    if (!data.nome.trim() || nonNegative.some((value) => !Number.isFinite(value) || value < 0) || factors.some((value) => !Number.isFinite(value) || value <= 0)) {
      return { success: false, message: 'Os valores nao podem ser negativos.' }
    }
    if (data.margem_perdas_padrao > 1 || data.taxa_venda_padrao > 1) {
      return { success: false, message: 'Margem de perdas e taxa de venda devem ficar entre 0 e 1.' }
    }

    db.prepare(`
      UPDATE tenants
      SET nome                  = ?,
          meta_mensal           = ?,
          taxa_operacional      = ?,
          custo_hora_maquina    = ?,
          tarifa_energia_kwh    = ?,
          potencia_impressora_w = ?,
          saldo_inicial_caixa   = ?,
          margem_perdas_padrao  = ?,
          taxa_venda_padrao     = ?,
          valor_hora_trabalho   = ?,
          fator_b2c_personalizado = ?,
          fator_b2c_lote        = ?,
          fator_b2b_piloto      = ?,
          fator_b2b_recorrente  = ?,
          pedido_minimo_b2b     = ?
      WHERE id = ?
    `).run(
      data.nome.trim(),
      data.meta_mensal,
      data.taxa_operacional,
      data.custo_hora_maquina,
      data.tarifa_energia_kwh,
      data.potencia_impressora_w,
      data.saldo_inicial_caixa,
      data.margem_perdas_padrao,
      data.taxa_venda_padrao,
      data.valor_hora_trabalho,
      data.fator_b2c_personalizado,
      data.fator_b2c_lote,
      data.fator_b2b_piloto,
      data.fator_b2b_recorrente,
      data.pedido_minimo_b2b,
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
