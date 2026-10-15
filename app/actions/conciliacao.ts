'use server'

import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import {
  detectarTransferenciaMercadoPago,
  parseExtrato,
  parseExtratoMercadoPago,
  sugerirConciliacao,
} from '@/lib/conciliacao.mjs'
import { exigirSessao } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export interface CandidatoConciliacao {
  tipo: 'Recebimento' | 'Despesa'
  id: number
  data: string
  valor: number
  descricao: string
  conta_financeira_id: number | null
  distanciaDias?: number
}

export type ClassificacaoExtrato = 'Venda' | 'Aporte' | 'Despesa' | 'Transferencia' | 'Pessoal'

export interface LancamentoExtrato {
  id: number
  data_lancamento: string
  descricao: string
  valor: number
  status: 'Pendente' | 'Conciliado' | 'Ignorado'
  classificacao: ClassificacaoExtrato | null
  entidade_tipo: string | null
  entidade_id: number | null
  nome_arquivo: string
  conta_financeira_id: number
  conta_financeira_nome: string
  sugestao: CandidatoConciliacao | null
}

const CATEGORIAS_DESPESA = [
  'Filamentos', 'Insumos', 'Equipamento', 'Energia', 'Marketing',
  'Software', 'Manutencao', 'Embalagens', 'Frete', 'Outros',
] as const

type CategoriaDespesa = typeof CATEGORIAS_DESPESA[number]

function candidatos(tenantId: number): CandidatoConciliacao[] {
  return db.prepare(`
    SELECT 'Recebimento' AS tipo, r.id, substr(r.data_recebimento, 1, 10) AS data,
      r.valor, c.nome || ' · ' || p.nome_da_peca AS descricao, r.conta_financeira_id
    FROM recebimentos r
    JOIN pedidos p ON p.id = r.pedido_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE r.tenant_id = ? AND r.estornado_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM extrato_lancamentos el WHERE el.tenant_id = r.tenant_id
        AND el.entidade_tipo = 'Recebimento' AND el.entidade_id = r.id AND el.status = 'Conciliado')
    UNION ALL
    SELECT 'Despesa' AS tipo, d.id, substr(COALESCE(d.pago_em, d.vencimento_em, d.data_despesa), 1, 10) AS data,
      d.valor, d.descricao, d.conta_financeira_id
    FROM despesas d
    WHERE d.tenant_id = ? AND d.estornada_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM extrato_lancamentos el WHERE el.tenant_id = d.tenant_id
        AND el.entidade_tipo = 'Despesa' AND el.entidade_id = d.id AND el.status = 'Conciliado')
  `).all(tenantId, tenantId) as CandidatoConciliacao[]
}

export async function getConciliacaoBancaria(): Promise<{ lancamentos: LancamentoExtrato[]; candidatos: CandidatoConciliacao[] }> {
  const sessao = await exigirSessao()
  const opcoes = candidatos(sessao.tenantId)
  const linhas = db.prepare(`
    SELECT el.id, el.data_lancamento, el.descricao, el.valor, el.status,
      el.classificacao, el.entidade_tipo, el.entidade_id, ei.nome_arquivo,
      ei.conta_financeira_id, cf.nome AS conta_financeira_nome
    FROM extrato_lancamentos el
    JOIN extrato_importacoes ei ON ei.id = el.importacao_id
    JOIN contas_financeiras cf ON cf.id = ei.conta_financeira_id
    WHERE el.tenant_id = ?
    ORDER BY CASE el.status WHEN 'Pendente' THEN 0 ELSE 1 END, el.data_lancamento DESC, el.id DESC
    LIMIT 300
  `).all(sessao.tenantId) as Omit<LancamentoExtrato, 'sugestao'>[]
  return {
    candidatos: opcoes,
    lancamentos: linhas.map((linha) => ({
      ...linha,
      sugestao: linha.status === 'Pendente'
        ? sugerirConciliacao({ data: linha.data_lancamento, valor: linha.valor },
            opcoes.filter((opcao) => opcao.conta_financeira_id === linha.conta_financeira_id))
        : null,
    })),
  }
}

async function lerXlsxMercadoPago(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
  const worksheet = workbook.worksheets[0]
  if (!worksheet) throw new Error('MERCADO_PAGO_HEADERS')
  const linhas: unknown[][] = []
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const valores: unknown[] = []
    for (let coluna = 1; coluna <= worksheet.columnCount; coluna += 1) {
      valores.push(row.getCell(coluna).text)
    }
    linhas.push(valores)
  })
  return parseExtratoMercadoPago(linhas)
}

export async function importarExtrato(formData: FormData): Promise<{ success: boolean; message: string }> {
  try {
    const sessao = await exigirSessao()
    const arquivo = formData.get('arquivo')
    const contaFinanceiraId = Number(formData.get('conta_financeira_id'))
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return { success: false, message: 'Selecione um arquivo XLSX, CSV ou OFX.' }
    }
    if (arquivo.size > 2_000_000) return { success: false, message: 'O arquivo deve ter no máximo 2 MB.' }
    if (!/\.(xlsx|csv|ofx)$/i.test(arquivo.name)) {
      return { success: false, message: 'Use um arquivo .xlsx do Mercado Pago, .csv ou .ofx.' }
    }
    const conta = db.prepare(`SELECT id, nome, instituicao FROM contas_financeiras
      WHERE id = ? AND tenant_id = ? AND ativa = 1`).get(contaFinanceiraId, sessao.tenantId) as {
        id: number; nome: string; instituicao: string
      } | undefined
    if (!conta) return { success: false, message: 'Selecione a conta correspondente ao extrato.' }

    const buffer = Buffer.from(await arquivo.arrayBuffer())
    const mercadoPagoXlsx = /\.xlsx$/i.test(arquivo.name)
    if (mercadoPagoXlsx && !`${conta.nome} ${conta.instituicao}`.toLowerCase().includes('mercado pago')) {
      return { success: false, message: 'O XLSX do Mercado Pago deve ser importado na conta Mercado Pago.' }
    }

    let lancamentos
    try {
      lancamentos = mercadoPagoXlsx
        ? await lerXlsxMercadoPago(buffer)
        : parseExtrato(buffer.toString('utf8'), arquivo.name)
    } catch (error) {
      const codigo = error instanceof Error ? error.message : ''
      if (codigo === 'CSV_HEADERS') {
        return { success: false, message: 'CSV inválido. Use as colunas Data, Descrição e Valor.' }
      }
      if (codigo === 'MERCADO_PAGO_HEADERS') {
        return { success: false, message: 'XLSX inválido. Exporte o extrato de movimentações diretamente pelo Mercado Pago.' }
      }
      throw error
    }
    if (lancamentos.length === 0) return { success: false, message: 'Nenhum lançamento válido foi encontrado.' }
    if (lancamentos.length > 5000) return { success: false, message: 'O arquivo excede 5.000 lançamentos.' }

    const hash = createHash('sha256').update(buffer).digest('hex')
    if (db.prepare(`SELECT 1 FROM extrato_importacoes WHERE tenant_id = ? AND hash_arquivo = ?`)
      .get(sessao.tenantId, hash)) {
      return { success: false, message: 'Este arquivo já foi importado.' }
    }

    let importados = 0
    let duplicados = 0
    let transferencias = 0
    const importar = db.transaction(() => {
      let cofrinhoId: number | null = null
      if (mercadoPagoXlsx) {
        db.prepare(`INSERT OR IGNORE INTO contas_financeiras (
          tenant_id, usuario_id, nome, instituicao, tipo
        ) VALUES (?, ?, 'Cofrinho Salge 3D', 'Mercado Pago', 'Reserva')`)
          .run(sessao.tenantId, sessao.usuarioId)
        cofrinhoId = (db.prepare(`SELECT id FROM contas_financeiras
          WHERE tenant_id = ? AND nome = 'Cofrinho Salge 3D'`).get(sessao.tenantId) as { id: number }).id
      }

      const importacao = db.prepare(`
        INSERT INTO extrato_importacoes (
          tenant_id, usuario_id, nome_arquivo, hash_arquivo, quantidade_lancamentos,
          conta_financeira_id
        ) VALUES (?, ?, ?, ?, 0, ?)
      `).run(sessao.tenantId, sessao.usuarioId, arquivo.name.slice(0, 200), hash, contaFinanceiraId)
      const importacaoId = Number(importacao.lastInsertRowid)
      const inserirLancamento = db.prepare(`
        INSERT INTO extrato_lancamentos (
          tenant_id, importacao_id, identificador_externo, data_lancamento, descricao, valor
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      const referenciaExistente = db.prepare(`
        SELECT 1
        FROM extrato_lancamentos el
        JOIN extrato_importacoes ei ON ei.id = el.importacao_id
        WHERE el.tenant_id = ? AND ei.conta_financeira_id = ?
          AND el.identificador_externo = ?
        LIMIT 1
      `)
      const inserirTransferencia = db.prepare(`INSERT INTO transferencias_financeiras (
        tenant_id, usuario_id, conta_origem_id, conta_destino_id,
        valor, data_transferencia, descricao
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      const conciliarTransferencia = db.prepare(`UPDATE extrato_lancamentos
        SET status = 'Conciliado', classificacao = 'Transferencia',
          transferencia_financeira_id = ?, conciliado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?`)
      const referenciaConfiavel = mercadoPagoXlsx || /\.ofx$/i.test(arquivo.name)

      for (const item of lancamentos) {
        if (referenciaConfiavel && referenciaExistente.get(sessao.tenantId, contaFinanceiraId, item.identificador)) {
          duplicados += 1
          continue
        }
        const result = inserirLancamento.run(
          sessao.tenantId, importacaoId, item.identificador, item.data, item.descricao, item.valor,
        )
        importados += 1
        if (!mercadoPagoXlsx || !cofrinhoId) continue
        const movimento = detectarTransferenciaMercadoPago(item.descricao, item.valor)
        if (!movimento) continue
        const origemId = movimento === 'ParaReserva' ? contaFinanceiraId : cofrinhoId
        const destinoId = movimento === 'ParaReserva' ? cofrinhoId : contaFinanceiraId
        const transferencia = inserirTransferencia.run(
          sessao.tenantId, sessao.usuarioId, origemId, destinoId, Math.abs(item.valor), item.data,
          `Importado do Mercado Pago · ${item.descricao} · ref. ${item.identificador}`,
        )
        conciliarTransferencia.run(Number(transferencia.lastInsertRowid), Number(result.lastInsertRowid))
        transferencias += 1
      }

      if (importados === 0) {
        db.prepare('DELETE FROM extrato_importacoes WHERE id = ?').run(importacaoId)
        return
      }
      db.prepare(`UPDATE extrato_importacoes SET quantidade_lancamentos = ? WHERE id = ?`)
        .run(importados, importacaoId)
      registrarAuditoria(db, {
        tenantId: sessao.tenantId,
        usuarioId: sessao.usuarioId,
        entidade: 'ExtratoBancario', entidadeId: importacaoId, acao: 'IMPORTAR',
        descricao: `${arquivo.name} · ${importados} lançamento(s)`,
        detalhes: { duplicados, transferencias },
      })
    })
    importar.immediate()
    if (importados === 0) {
      return { success: false, message: `Nenhum lançamento novo. ${duplicados} referência(s) já estavam importadas.` }
    }
    revalidatePath('/financeiro/conciliacao')
    revalidatePath('/financeiro')
    const partes = [`${importados} lançamento(s) importado(s)`]
    if (transferencias) partes.push(`${transferencias} transferência(s) do cofrinho reconhecida(s)`)
    if (duplicados) partes.push(`${duplicados} duplicado(s) ignorado(s)`)
    return { success: true, message: `${partes.join(' · ')}.` }
  } catch (error) {
    console.error('[importarExtrato]', error)
    return { success: false, message: 'Não foi possível importar o extrato.' }
  }
}

export async function conciliarLancamento(lancamentoId: number, tipo: 'Recebimento' | 'Despesa', entidadeId: number): Promise<{ success: boolean; message: string }> {
  try {
    const sessao = await exigirSessao()
    if (!Number.isSafeInteger(lancamentoId) || lancamentoId <= 0 || !['Recebimento', 'Despesa'].includes(tipo) ||
        !Number.isSafeInteger(entidadeId) || entidadeId <= 0) return { success: false, message: 'Conciliação inválida.' }
    const conciliar = db.transaction(() => {
      const linha = db.prepare(`
        SELECT el.id, el.data_lancamento, el.valor, ei.conta_financeira_id
        FROM extrato_lancamentos el JOIN extrato_importacoes ei ON ei.id = el.importacao_id
        WHERE el.id = ? AND el.tenant_id = ? AND el.status = 'Pendente'
      `).get(lancamentoId, sessao.tenantId) as {
        id: number; data_lancamento: string; valor: number; conta_financeira_id: number
      } | undefined
      if (!linha) throw new Error('NOT_FOUND')
      if ((linha.valor > 0 ? 'Recebimento' : 'Despesa') !== tipo) throw new Error('TYPE')
      const tabela = tipo === 'Recebimento' ? 'recebimentos' : 'despesas'
      const estorno = tipo === 'Recebimento' ? 'estornado_em' : 'estornada_em'
      const entidade = db.prepare(`SELECT id, valor, conta_financeira_id FROM ${tabela}
        WHERE id = ? AND tenant_id = ? AND ${estorno} IS NULL`)
        .get(entidadeId, sessao.tenantId) as { id: number; valor: number; conta_financeira_id: number | null } | undefined
      if (!entidade) throw new Error('ENTITY_NOT_FOUND')
      if (entidade.conta_financeira_id !== linha.conta_financeira_id) throw new Error('ACCOUNT')
      if (Math.abs(entidade.valor - Math.abs(linha.valor)) > 0.01) throw new Error('AMOUNT')
      const usada = db.prepare(`
        SELECT 1 FROM extrato_lancamentos WHERE tenant_id = ? AND status = 'Conciliado'
          AND entidade_tipo = ? AND entidade_id = ?
      `).get(sessao.tenantId, tipo, entidadeId)
      if (usada) throw new Error('USED')
      db.prepare(`
        UPDATE extrato_lancamentos SET status = 'Conciliado', classificacao = ?,
          entidade_tipo = ?, entidade_id = ?, conciliado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).run(tipo === 'Recebimento' ? 'Venda' : 'Despesa', tipo, entidadeId, lancamentoId)
      if (tipo === 'Despesa') db.prepare('UPDATE despesas SET pago_em = COALESCE(pago_em, ?) WHERE id = ?')
        .run(linha.data_lancamento, entidadeId)
      registrarAuditoria(db, {
        tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'ExtratoBancario', entidadeId: lancamentoId, acao: 'CONCILIAR',
        descricao: `${tipo} #${entidadeId} · R$ ${Math.abs(linha.valor).toFixed(2)}`,
      })
    })
    try { conciliar.immediate() } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_FOUND') return { success: false, message: 'Lançamento pendente não encontrado.' }
      if (code === 'ENTITY_NOT_FOUND') return { success: false, message: 'Registro financeiro não encontrado.' }
      if (code === 'TYPE') return { success: false, message: 'Créditos conciliam recebimentos e débitos conciliam despesas.' }
      if (code === 'AMOUNT') return { success: false, message: 'Os valores precisam ser exatamente iguais.' }
      if (code === 'ACCOUNT') return { success: false, message: 'O lançamento e o registro financeiro pertencem a contas diferentes.' }
      if (code === 'USED') return { success: false, message: 'Esse registro financeiro já foi conciliado.' }
      throw error
    }
    revalidatePath('/financeiro/conciliacao')
    revalidatePath('/financeiro')
    return { success: true, message: 'Lançamento conciliado.' }
  } catch (error) {
    console.error('[conciliarLancamento]', error)
    return { success: false, message: 'Não foi possível conciliar.' }
  }
}

export async function classificarLancamento(
  lancamentoId: number,
  classificacao: 'Aporte' | 'Despesa' | 'Pessoal',
  opcoes?: { categoria?: CategoriaDespesa; descricao?: string },
): Promise<{ success: boolean; message: string }> {
  try {
    const sessao = await exigirSessao()
    if (!Number.isSafeInteger(lancamentoId) || lancamentoId <= 0 ||
        !['Aporte', 'Despesa', 'Pessoal'].includes(classificacao)) {
      return { success: false, message: 'Classificação inválida.' }
    }
    const categoria = opcoes?.categoria ?? 'Outros'
    if (!CATEGORIAS_DESPESA.includes(categoria)) return { success: false, message: 'Categoria de despesa inválida.' }

    const classificar = db.transaction(() => {
      const linha = db.prepare(`SELECT el.id, el.data_lancamento, el.descricao, el.valor,
          ei.conta_financeira_id
        FROM extrato_lancamentos el JOIN extrato_importacoes ei ON ei.id = el.importacao_id
        WHERE el.id = ? AND el.tenant_id = ? AND el.status = 'Pendente'`)
        .get(lancamentoId, sessao.tenantId) as {
          id: number; data_lancamento: string; descricao: string; valor: number; conta_financeira_id: number
        } | undefined
      if (!linha) throw new Error('NOT_FOUND')
      const descricao = opcoes?.descricao?.trim().slice(0, 300) || linha.descricao

      if (classificacao === 'Despesa') {
        if (linha.valor >= 0) throw new Error('TYPE')
        const despesa = db.prepare(`INSERT INTO despesas (
          tenant_id, usuario_id, categoria, descricao, valor, data_despesa,
          competencia_em, vencimento_em, pago_em, forma_pagamento, conta_financeira_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Extrato bancário', ?)`)
          .run(sessao.tenantId, sessao.usuarioId, categoria, descricao, Math.abs(linha.valor),
            linha.data_lancamento, linha.data_lancamento, linha.data_lancamento,
            linha.data_lancamento, linha.conta_financeira_id)
        const despesaId = Number(despesa.lastInsertRowid)
        db.prepare(`UPDATE extrato_lancamentos SET status = 'Conciliado', classificacao = 'Despesa',
          entidade_tipo = 'Despesa', entidade_id = ?, conciliado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ?`).run(despesaId, linha.id)
        registrarAuditoria(db, {
          tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
          entidade: 'Despesa', entidadeId: despesaId, acao: 'CRIAR_DO_EXTRATO',
          descricao: `${descricao} · R$ ${Math.abs(linha.valor).toFixed(2)}`,
        })
        return
      }

      if (classificacao === 'Aporte' && linha.valor <= 0) throw new Error('TYPE')
      const tipoCapital = linha.valor > 0 ? 'Aporte' : 'Retirada'
      const fluxo = db.prepare(`INSERT INTO fluxo_capital (
        tenant_id, usuario_id, tipo, valor, descricao, data_movimentacao, conta_financeira_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(sessao.tenantId, sessao.usuarioId, tipoCapital, Math.abs(linha.valor), descricao,
          linha.data_lancamento, linha.conta_financeira_id)
      const fluxoId = Number(fluxo.lastInsertRowid)
      db.prepare(`UPDATE extrato_lancamentos SET status = 'Conciliado', classificacao = ?,
        fluxo_capital_id = ?, conciliado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?`).run(classificacao, fluxoId, linha.id)
      registrarAuditoria(db, {
        tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
        entidade: 'FluxoCapital', entidadeId: fluxoId, acao: 'CRIAR_DO_EXTRATO',
        descricao: `${tipoCapital} · R$ ${Math.abs(linha.valor).toFixed(2)}`,
      })
    })
    try { classificar.immediate() } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_FOUND') return { success: false, message: 'Lançamento pendente não encontrado.' }
      if (code === 'TYPE') return { success: false, message: 'Essa classificação não corresponde à entrada ou saída do lançamento.' }
      throw error
    }
    revalidatePath('/financeiro/conciliacao')
    revalidatePath('/financeiro')
    return { success: true, message: classificacao === 'Despesa'
      ? 'Despesa criada e conciliada.'
      : 'Movimentação de capital criada e conciliada.' }
  } catch (error) {
    console.error('[classificarLancamento]', error)
    return { success: false, message: 'Não foi possível classificar o lançamento.' }
  }
}

export async function ignorarLancamento(lancamentoId: number): Promise<{ success: boolean; message: string }> {
  try {
    const sessao = await exigirSessao()
    const result = db.prepare(`
      UPDATE extrato_lancamentos SET status = 'Ignorado'
      WHERE id = ? AND tenant_id = ? AND status = 'Pendente'
    `).run(lancamentoId, sessao.tenantId)
    if (result.changes !== 1) return { success: false, message: 'Lançamento pendente não encontrado.' }
    registrarAuditoria(db, {
      tenantId: sessao.tenantId, usuarioId: sessao.usuarioId,
      entidade: 'ExtratoBancario', entidadeId: lancamentoId, acao: 'IGNORAR',
      descricao: 'Lançamento ignorado manualmente',
    })
    revalidatePath('/financeiro/conciliacao')
    return { success: true, message: 'Lançamento ignorado.' }
  } catch (error) {
    console.error('[ignorarLancamento]', error)
    return { success: false, message: 'Não foi possível ignorar o lançamento.' }
  }
}
