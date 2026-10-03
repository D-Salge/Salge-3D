'use server'

import { createHash } from 'node:crypto'
import db from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'
import { parseExtrato, sugerirConciliacao } from '@/lib/conciliacao.mjs'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1

export interface CandidatoConciliacao {
  tipo: 'Recebimento' | 'Despesa'
  id: number
  data: string
  valor: number
  descricao: string
  conta_financeira_id: number | null
  distanciaDias?: number
}

export interface LancamentoExtrato {
  id: number
  data_lancamento: string
  descricao: string
  valor: number
  status: 'Pendente' | 'Conciliado' | 'Ignorado'
  entidade_tipo: string | null
  entidade_id: number | null
  nome_arquivo: string
  conta_financeira_id: number
  conta_financeira_nome: string
  sugestao: CandidatoConciliacao | null
}

function candidatos(): CandidatoConciliacao[] {
  return db.prepare(`
    SELECT 'Recebimento' AS tipo, r.id, substr(r.data_recebimento, 1, 10) AS data,
      r.valor, c.nome || ' · ' || p.nome_da_peca AS descricao, r.conta_financeira_id
    FROM recebimentos r
    JOIN pedidos p ON p.id = r.pedido_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE r.tenant_id = ? AND r.estornado_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM extrato_lancamentos el WHERE el.entidade_tipo = 'Recebimento' AND el.entidade_id = r.id AND el.status = 'Conciliado')
    UNION ALL
    SELECT 'Despesa' AS tipo, d.id, substr(COALESCE(d.pago_em, d.vencimento_em, d.data_despesa), 1, 10) AS data,
      d.valor, d.descricao, d.conta_financeira_id
    FROM despesas d
    WHERE d.tenant_id = ? AND d.estornada_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM extrato_lancamentos el WHERE el.entidade_tipo = 'Despesa' AND el.entidade_id = d.id AND el.status = 'Conciliado')
  `).all(TENANT_ID, TENANT_ID) as CandidatoConciliacao[]
}

export async function getConciliacaoBancaria(): Promise<{ lancamentos: LancamentoExtrato[]; candidatos: CandidatoConciliacao[] }> {
  const opcoes = candidatos()
  const linhas = db.prepare(`
    SELECT el.id, el.data_lancamento, el.descricao, el.valor, el.status,
      el.entidade_tipo, el.entidade_id, ei.nome_arquivo, ei.conta_financeira_id,
      cf.nome AS conta_financeira_nome
    FROM extrato_lancamentos el
    JOIN extrato_importacoes ei ON ei.id = el.importacao_id
    JOIN contas_financeiras cf ON cf.id = ei.conta_financeira_id
    WHERE el.tenant_id = ?
    ORDER BY CASE el.status WHEN 'Pendente' THEN 0 ELSE 1 END, el.data_lancamento DESC, el.id DESC
    LIMIT 200
  `).all(TENANT_ID) as Omit<LancamentoExtrato, 'sugestao'>[]
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

export async function importarExtrato(formData: FormData): Promise<{ success: boolean; message: string }> {
  try {
    const arquivo = formData.get('arquivo')
    const contaFinanceiraId = Number(formData.get('conta_financeira_id'))
    if (!(arquivo instanceof File) || arquivo.size === 0) return { success: false, message: 'Selecione um arquivo CSV ou OFX.' }
    if (arquivo.size > 2_000_000) return { success: false, message: 'O arquivo deve ter no máximo 2 MB.' }
    if (!/\.(csv|ofx)$/i.test(arquivo.name)) return { success: false, message: 'Use um arquivo .csv ou .ofx.' }
    if (!Number.isSafeInteger(contaFinanceiraId) || contaFinanceiraId <= 0 ||
        !db.prepare(`SELECT 1 FROM contas_financeiras WHERE id = ? AND tenant_id = ? AND ativa = 1`)
          .get(contaFinanceiraId, TENANT_ID)) {
      return { success: false, message: 'Selecione a conta correspondente ao extrato.' }
    }
    const conteudo = await arquivo.text()
    let lancamentos
    try { lancamentos = parseExtrato(conteudo, arquivo.name) } catch (error) {
      if (error instanceof Error && error.message === 'CSV_HEADERS') {
        return { success: false, message: 'CSV inválido. Use as colunas Data, Descrição e Valor.' }
      }
      throw error
    }
    if (lancamentos.length === 0) return { success: false, message: 'Nenhum lançamento válido foi encontrado.' }
    if (lancamentos.length > 5000) return { success: false, message: 'O arquivo excede 5.000 lançamentos.' }
    const hash = createHash('sha256').update(conteudo).digest('hex')
    const importar = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO extrato_importacoes (
          tenant_id, usuario_id, nome_arquivo, hash_arquivo, quantidade_lancamentos,
          conta_financeira_id
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(TENANT_ID, USUARIO_ID, arquivo.name.slice(0, 200), hash, lancamentos.length, contaFinanceiraId)
      const importacaoId = Number(result.lastInsertRowid)
      const inserir = db.prepare(`
        INSERT OR IGNORE INTO extrato_lancamentos (
          tenant_id, importacao_id, identificador_externo, data_lancamento, descricao, valor
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      for (const item of lancamentos) inserir.run(TENANT_ID, importacaoId, item.identificador, item.data, item.descricao, item.valor)
      registrarAuditoria(db, {
        entidade: 'ExtratoBancario', entidadeId: importacaoId, acao: 'IMPORTAR',
        descricao: `${arquivo.name} · ${lancamentos.length} lançamento(s)`,
      })
    })
    try { importar.immediate() } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { success: false, message: 'Este arquivo já foi importado.' }
      }
      throw error
    }
    revalidatePath('/financeiro/conciliacao')
    return { success: true, message: `${lancamentos.length} lançamento(s) importado(s).` }
  } catch (error) {
    console.error('[importarExtrato]', error)
    return { success: false, message: 'Não foi possível importar o extrato.' }
  }
}

export async function conciliarLancamento(lancamentoId: number, tipo: 'Recebimento' | 'Despesa', entidadeId: number): Promise<{ success: boolean; message: string }> {
  try {
    if (!Number.isSafeInteger(lancamentoId) || lancamentoId <= 0 || !['Recebimento', 'Despesa'].includes(tipo) ||
        !Number.isSafeInteger(entidadeId) || entidadeId <= 0) return { success: false, message: 'Conciliação inválida.' }
    const conciliar = db.transaction(() => {
      const linha = db.prepare(`
        SELECT el.id, el.data_lancamento, el.valor, ei.conta_financeira_id
        FROM extrato_lancamentos el JOIN extrato_importacoes ei ON ei.id = el.importacao_id
        WHERE el.id = ? AND el.tenant_id = ? AND el.status = 'Pendente'
      `).get(lancamentoId, TENANT_ID) as {
        id: number; data_lancamento: string; valor: number; conta_financeira_id: number
      } | undefined
      if (!linha) throw new Error('NOT_FOUND')
      if ((linha.valor > 0 ? 'Recebimento' : 'Despesa') !== tipo) throw new Error('TYPE')
      const tabela = tipo === 'Recebimento' ? 'recebimentos' : 'despesas'
      const estorno = tipo === 'Recebimento' ? 'estornado_em' : 'estornada_em'
      const entidade = db.prepare(`SELECT id, valor, conta_financeira_id FROM ${tabela}
        WHERE id = ? AND tenant_id = ? AND ${estorno} IS NULL`)
        .get(entidadeId, TENANT_ID) as { id: number; valor: number; conta_financeira_id: number | null } | undefined
      if (!entidade) throw new Error('ENTITY_NOT_FOUND')
      if (entidade.conta_financeira_id !== linha.conta_financeira_id) throw new Error('ACCOUNT')
      if (Math.abs(entidade.valor - Math.abs(linha.valor)) > 0.01) throw new Error('AMOUNT')
      const usada = db.prepare(`
        SELECT 1 FROM extrato_lancamentos WHERE tenant_id = ? AND status = 'Conciliado'
          AND entidade_tipo = ? AND entidade_id = ?
      `).get(TENANT_ID, tipo, entidadeId)
      if (usada) throw new Error('USED')
      db.prepare(`
        UPDATE extrato_lancamentos SET status = 'Conciliado', entidade_tipo = ?, entidade_id = ?,
          conciliado_em = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?
      `).run(tipo, entidadeId, lancamentoId)
      if (tipo === 'Despesa') db.prepare('UPDATE despesas SET pago_em = COALESCE(pago_em, ?) WHERE id = ?').run(linha.data_lancamento, entidadeId)
      registrarAuditoria(db, {
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

export async function ignorarLancamento(lancamentoId: number): Promise<{ success: boolean; message: string }> {
  const result = db.prepare(`
    UPDATE extrato_lancamentos SET status = 'Ignorado'
    WHERE id = ? AND tenant_id = ? AND status = 'Pendente'
  `).run(lancamentoId, TENANT_ID)
  if (result.changes !== 1) return { success: false, message: 'Lançamento pendente não encontrado.' }
  registrarAuditoria(db, { entidade: 'ExtratoBancario', entidadeId: lancamentoId, acao: 'IGNORAR', descricao: 'Lançamento ignorado manualmente' })
  revalidatePath('/financeiro/conciliacao')
  return { success: true, message: 'Lançamento ignorado.' }
}
