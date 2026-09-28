'use server'

import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { calcularLimiteMei, resumirLimiteMei, vencimentoDas } from '@/lib/mei.mjs'
import { exigirSessao } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export interface ReceitaFiscal {
  id: number
  data_competencia: string
  natureza: 'Venda' | 'Serviço'
  origem: 'ERP' | 'Externa'
  descricao: string
  valor: number
  nota_fiscal_emitida: number
  numero_documento: string | null
  recebimento_id: number | null
}

export interface ObrigacaoFiscal {
  id: number | null
  tipo: 'DAS' | 'Relatório mensal' | 'DASN'
  competencia: string
  vencimento_em: string
  status: 'Pendente' | 'Pago' | 'Entregue' | 'Dispensado'
  valor: number | null
}

export interface PainelFiscal {
  ano: number
  inicioMei: string | null
  limiteAnualConfigurado: number
  naturezaPadrao: 'Venda' | 'Serviço'
  resumo: ReturnType<typeof resumirLimiteMei>
  totalVendas: number
  totalServicos: number
  meses: Array<{ mes: string; vendas: number; servicos: number; total: number }>
  receitas: ReceitaFiscal[]
  obrigacoes: ObrigacaoFiscal[]
}

function validarAno(ano: number) {
  if (!Number.isSafeInteger(ano) || ano < 2020 || ano > 2100) throw new Error('INVALID_YEAR')
}

export async function getPainelFiscal(ano = new Date().getFullYear()): Promise<PainelFiscal> {
  const sessao = await exigirSessao()
  validarAno(ano)
  const config = db.prepare(`SELECT mei_inicio_em, mei_limite_anual, mei_natureza_padrao
    FROM tenants WHERE id = ?`).get(sessao.tenantId) as {
      mei_inicio_em: string | null; mei_limite_anual: number; mei_natureza_padrao: 'Venda' | 'Serviço'
    }
  const totais = db.prepare(`SELECT natureza, COALESCE(SUM(valor), 0) AS total
    FROM receitas_fiscais WHERE tenant_id = ? AND cancelada_em IS NULL
      AND strftime('%Y', data_competencia) = ? GROUP BY natureza`
  ).all(sessao.tenantId, String(ano)) as Array<{ natureza: 'Venda' | 'Serviço'; total: number }>
  const totalVendas = totais.find((item) => item.natureza === 'Venda')?.total || 0
  const totalServicos = totais.find((item) => item.natureza === 'Serviço')?.total || 0
  const agregados = db.prepare(`SELECT strftime('%m', data_competencia) AS mes, natureza,
      COALESCE(SUM(valor), 0) AS total
    FROM receitas_fiscais WHERE tenant_id = ? AND cancelada_em IS NULL
      AND strftime('%Y', data_competencia) = ? GROUP BY mes, natureza`
  ).all(sessao.tenantId, String(ano)) as Array<{ mes: string; natureza: 'Venda' | 'Serviço'; total: number }>
  const meses = Array.from({ length: 12 }, (_, index) => {
    const mes = String(index + 1).padStart(2, '0')
    const vendas = agregados.find((item) => item.mes === mes && item.natureza === 'Venda')?.total || 0
    const servicos = agregados.find((item) => item.mes === mes && item.natureza === 'Serviço')?.total || 0
    return { mes: `${ano}-${mes}`, vendas, servicos, total: vendas + servicos }
  })
  const receitas = db.prepare(`SELECT id, data_competencia, natureza, origem, descricao, valor,
      nota_fiscal_emitida, numero_documento, recebimento_id
    FROM receitas_fiscais WHERE tenant_id = ? AND cancelada_em IS NULL
      AND strftime('%Y', data_competencia) = ?
    ORDER BY data_competencia DESC, id DESC LIMIT 300`
  ).all(sessao.tenantId, String(ano)) as ReceitaFiscal[]

  const salvas = db.prepare(`SELECT id, tipo, competencia, vencimento_em, status, valor
    FROM obrigacoes_fiscais WHERE tenant_id = ? AND (
      competencia LIKE ? OR (tipo = 'DASN' AND competencia = ?)
    )`).all(sessao.tenantId, `${ano}-%`, String(ano - 1)) as ObrigacaoFiscal[]
  const obrigacoes: ObrigacaoFiscal[] = []
  for (let mes = 1; mes <= 12; mes++) {
    const competencia = `${ano}-${String(mes).padStart(2, '0')}`
    for (const tipo of ['DAS', 'Relatório mensal'] as const) {
      const salva = salvas.find((item) => item.tipo === tipo && item.competencia === competencia)
      obrigacoes.push(salva || {
        id: null, tipo, competencia, vencimento_em: vencimentoDas(competencia), status: 'Pendente', valor: null,
      })
    }
  }
  const dasn = salvas.find((item) => item.tipo === 'DASN' && item.competencia === String(ano - 1))
  obrigacoes.push(dasn || {
    id: null, tipo: 'DASN', competencia: String(ano - 1),
    vencimento_em: `${ano}-05-31`, status: 'Pendente', valor: null,
  })
  const limite = calcularLimiteMei({ ano, inicioEm: config.mei_inicio_em, limiteAnual: config.mei_limite_anual })
  return {
    ano, inicioMei: config.mei_inicio_em, limiteAnualConfigurado: config.mei_limite_anual,
    naturezaPadrao: config.mei_natureza_padrao,
    resumo: resumirLimiteMei(totalVendas + totalServicos, limite),
    totalVendas, totalServicos, meses, receitas, obrigacoes,
  }
}

export async function salvarConfiguracaoMei(data: {
  inicioMei: string | null; limiteAnual: number; naturezaPadrao: 'Venda' | 'Serviço'
}) {
  try {
    const sessao = await exigirSessao()
    if (data.inicioMei && !/^\d{4}-\d{2}-\d{2}$/.test(data.inicioMei)) return { success: false, message: 'Data de abertura inválida.' }
    if (!Number.isFinite(data.limiteAnual) || data.limiteAnual <= 0) return { success: false, message: 'Limite anual inválido.' }
    if (!['Venda', 'Serviço'].includes(data.naturezaPadrao)) return { success: false, message: 'Natureza padrão inválida.' }
    db.prepare(`UPDATE tenants SET mei_inicio_em = ?, mei_limite_anual = ?, mei_natureza_padrao = ? WHERE id = ?`)
      .run(data.inicioMei || null, data.limiteAnual, data.naturezaPadrao, sessao.tenantId)
    revalidatePath('/financeiro/fiscal')
    return { success: true, message: 'Configuração fiscal salva.' }
  } catch (error) { console.error('[salvarConfiguracaoMei]', error); return { success: false, message: 'Não foi possível salvar.' } }
}

export async function adicionarReceitaExterna(data: {
  dataCompetencia: string; natureza: 'Venda' | 'Serviço'; descricao: string; valor: number
  notaFiscalEmitida?: boolean; numeroDocumento?: string
}) {
  try {
    const sessao = await exigirSessao()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dataCompetencia)) return { success: false, message: 'Data inválida.' }
    if (!['Venda', 'Serviço'].includes(data.natureza)) return { success: false, message: 'Natureza inválida.' }
    if (!data.descricao.trim() || !Number.isFinite(data.valor) || data.valor <= 0) return { success: false, message: 'Preencha descrição e valor.' }
    const result = db.prepare(`INSERT INTO receitas_fiscais (
      tenant_id, usuario_id, data_competencia, natureza, origem, descricao,
      valor, nota_fiscal_emitida, numero_documento
    ) VALUES (?, ?, ?, ?, 'Externa', ?, ?, ?, ?)`
    ).run(sessao.tenantId, sessao.usuarioId, data.dataCompetencia, data.natureza,
      data.descricao.trim(), data.valor, data.notaFiscalEmitida ? 1 : 0, data.numeroDocumento?.trim() || null)
    registrarAuditoria(db, { entidade: 'ReceitaFiscal', entidadeId: Number(result.lastInsertRowid), acao: 'CRIAR', descricao: `Receita externa de R$ ${data.valor.toFixed(2)}` })
    revalidatePath('/financeiro/fiscal')
    return { success: true, message: 'Receita adicionada ao controle do MEI.' }
  } catch (error) { console.error('[adicionarReceitaExterna]', error); return { success: false, message: 'Não foi possível adicionar a receita.' } }
}

export async function atualizarDocumentoFiscal(id: number, emitida: boolean, numeroDocumento?: string) {
  try {
    const sessao = await exigirSessao()
    const result = db.prepare(`UPDATE receitas_fiscais SET nota_fiscal_emitida = ?, numero_documento = ?
      WHERE id = ? AND tenant_id = ? AND cancelada_em IS NULL`
    ).run(emitida ? 1 : 0, numeroDocumento?.trim() || null, id, sessao.tenantId)
    if (!result.changes) return { success: false, message: 'Receita não encontrada.' }
    revalidatePath('/financeiro/fiscal')
    return { success: true, message: 'Documento fiscal atualizado.' }
  } catch (error) { console.error('[atualizarDocumentoFiscal]', error); return { success: false, message: 'Não foi possível atualizar.' } }
}

export async function cancelarReceitaExterna(id: number) {
  try {
    const sessao = await exigirSessao()
    const result = db.prepare(`UPDATE receitas_fiscais SET cancelada_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND tenant_id = ? AND origem = 'Externa' AND cancelada_em IS NULL`
    ).run(id, sessao.tenantId)
    if (!result.changes) return { success: false, message: 'Somente receitas externas podem ser removidas aqui.' }
    revalidatePath('/financeiro/fiscal')
    return { success: true, message: 'Receita externa removida.' }
  } catch (error) { console.error('[cancelarReceitaExterna]', error); return { success: false, message: 'Não foi possível remover.' } }
}

export async function salvarObrigacaoFiscal(data: {
  tipo: ObrigacaoFiscal['tipo']; competencia: string; vencimentoEm: string
  status: ObrigacaoFiscal['status']; valor?: number | null
}) {
  try {
    const sessao = await exigirSessao()
    if (!['DAS', 'Relatório mensal', 'DASN'].includes(data.tipo) || !/^\d{4}(-\d{2})?$/.test(data.competencia) || !/^\d{4}-\d{2}-\d{2}$/.test(data.vencimentoEm)) {
      return { success: false, message: 'Obrigação fiscal inválida.' }
    }
    if (!['Pendente', 'Pago', 'Entregue', 'Dispensado'].includes(data.status)) return { success: false, message: 'Status inválido.' }
    const valor = data.valor == null ? null : Number(data.valor)
    if (valor != null && (!Number.isFinite(valor) || valor < 0)) return { success: false, message: 'Valor inválido.' }
    db.prepare(`INSERT INTO obrigacoes_fiscais (
      tenant_id, usuario_id, tipo, competencia, vencimento_em, status, valor, concluido_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'Pendente' THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%SZ', 'now') END)
    ON CONFLICT(tenant_id, tipo, competencia) DO UPDATE SET
      usuario_id = excluded.usuario_id, vencimento_em = excluded.vencimento_em,
      status = excluded.status, valor = excluded.valor, concluido_em = excluded.concluido_em`
    ).run(sessao.tenantId, sessao.usuarioId, data.tipo, data.competencia, data.vencimentoEm, data.status, valor, data.status)
    revalidatePath('/financeiro/fiscal')
    return { success: true, message: 'Obrigação atualizada.' }
  } catch (error) { console.error('[salvarObrigacaoFiscal]', error); return { success: false, message: 'Não foi possível atualizar.' } }
}

