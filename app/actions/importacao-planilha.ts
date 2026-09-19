'use server'

import db from '@/lib/db'
import { analisarPlanilha, contarDadosOperacionais, importarPlanilha } from '@/lib/importacao-planilha.mjs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'

const TENANT_ID = 1
const USUARIO_ID = 1
const MAX_FILE_SIZE = 5 * 1024 * 1024

export interface ImportacaoReport {
  arquivo: { nome: string; tamanho: number; sha256: string }
  valido: boolean
  erros: string[]
  avisos: string[]
  contagens: Record<string, number>
  totais: Record<string, number>
  reconciliacao: {
    recebimentosDivergentes: Array<Record<string, unknown>>
    sobrepagamentos: Array<Record<string, unknown>>
    ajustesFilamento: Array<Record<string, unknown>>
    ajustesMaterial: Array<Record<string, unknown>>
    errosFormula: number
  }
  abas: Array<{ name: string; destino: string }>
  baseAtual?: Record<string, number>
  importado?: Record<string, number>
}

export interface ImportacaoActionResult {
  success: boolean
  message: string
  importacaoId?: number
  report?: ImportacaoReport
}

export interface ImportacaoHistorico {
  id: number
  nome_arquivo: string
  status: 'Pendente' | 'Importando' | 'Concluida' | 'Falhou'
  criado_em: string
  concluido_em: string | null
  erro: string | null
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : 'Erro desconhecido.'
}

export async function prepararImportacaoPlanilha(formData: FormData): Promise<ImportacaoActionResult> {
  try {
    const uploaded = formData.get('arquivo')
    if (!(uploaded instanceof File) || uploaded.size === 0) {
      return { success: false, message: 'Selecione uma planilha .xlsx.' }
    }
    if (!uploaded.name.toLowerCase().endsWith('.xlsx')) {
      return { success: false, message: 'Formato inválido. Envie o arquivo .xlsx da Salge 3D.' }
    }
    if (uploaded.size > MAX_FILE_SIZE) {
      return { success: false, message: 'A planilha excede o limite de 5 MB.' }
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer())
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return { success: false, message: 'O arquivo não é uma planilha XLSX válida.' }
    }
    const parsed = await analisarPlanilha(buffer, { nomeArquivo: uploaded.name })
    const report: ImportacaoReport = {
      ...parsed.report,
      baseAtual: contarDadosOperacionais(db, TENANT_ID),
    }

    const previous = db.prepare(`SELECT id, status FROM importacoes_planilha
      WHERE tenant_id = ? AND sha256 = ?`).get(TENANT_ID, report.arquivo.sha256) as { id: number; status: string } | undefined
    if (previous?.status === 'Concluida') {
      return { success: false, message: 'Este mesmo arquivo já foi importado. Nenhum dado foi duplicado.', report }
    }

    let importacaoId: number
    if (previous) {
      db.prepare(`UPDATE importacoes_planilha
        SET nome_arquivo = ?, arquivo_original = ?, status = 'Pendente', relatorio_json = ?, erro = NULL
        WHERE id = ?`).run(uploaded.name, buffer, JSON.stringify(report), previous.id)
      importacaoId = previous.id
    } else {
      const inserted = db.prepare(`INSERT INTO importacoes_planilha
        (tenant_id, usuario_id, nome_arquivo, sha256, arquivo_original, status, relatorio_json)
        VALUES (?, ?, ?, ?, ?, 'Pendente', ?)`)
        .run(TENANT_ID, USUARIO_ID, uploaded.name, report.arquivo.sha256, buffer, JSON.stringify(report))
      importacaoId = Number(inserted.lastInsertRowid)
    }

    return {
      success: report.valido,
      message: report.valido
        ? 'Planilha validada. Revise a prévia antes de confirmar.'
        : 'A planilha possui erros bloqueantes e não pode ser importada.',
      importacaoId,
      report,
    }
  } catch (error) {
    console.error('[prepararImportacaoPlanilha]', error)
    return { success: false, message: `Não foi possível analisar a planilha: ${safeError(error)}` }
  }
}

export async function executarImportacaoPlanilha(importacaoId: number, permitirMesclar: boolean): Promise<ImportacaoActionResult> {
  try {
    if (!Number.isInteger(importacaoId) || importacaoId <= 0) {
      return { success: false, message: 'Importação inválida.' }
    }
    const pending = db.prepare(`SELECT nome_arquivo, arquivo_original, status
      FROM importacoes_planilha WHERE id = ? AND tenant_id = ?`)
      .get(importacaoId, TENANT_ID) as { nome_arquivo: string; arquivo_original: Buffer; status: string } | undefined
    if (!pending || pending.status !== 'Pendente') {
      return { success: false, message: 'Esta importação não está pendente ou já foi concluída.' }
    }

    const parsed = await analisarPlanilha(Buffer.from(pending.arquivo_original), { nomeArquivo: pending.nome_arquivo })
    if (!parsed.report.valido) {
      return { success: false, message: 'A validação mudou ou falhou. Envie o arquivo novamente.', report: parsed.report }
    }

    const backupDirectory = path.join(process.cwd(), 'database', 'backups')
    await mkdir(backupDirectory, { recursive: true })
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
    const backupPath = path.join(backupDirectory, `antes-importacao-${timestamp}.sqlite`)
    db.pragma('wal_checkpoint(PASSIVE)')
    await db.backup(backupPath)

    const report = importarPlanilha(db, parsed, { importacaoId, tenantId: TENANT_ID, usuarioId: USUARIO_ID, permitirMesclar }) as ImportacaoReport
    revalidatePath('/')
    revalidatePath('/clientes')
    revalidatePath('/estoque')
    revalidatePath('/filamentos')
    revalidatePath('/insumos')
    revalidatePath('/financeiro')
    revalidatePath('/orcamentos')
    revalidatePath('/producao')
    revalidatePath('/configuracoes')
    revalidatePath('/configuracoes/importar-planilha')
    return { success: true, message: 'Importação concluída e conferida com sucesso.', importacaoId, report }
  } catch (error) {
    const message = safeError(error)
    if (message === 'BASE_NAO_VAZIA') {
      return { success: false, message: 'O ERP já contém dados. Marque a confirmação de mesclagem ou limpe apenas os dados de demonstração antes de importar.' }
    }
    console.error('[executarImportacaoPlanilha]', error)
    db.prepare(`UPDATE importacoes_planilha SET status = 'Falhou', erro = ?
      WHERE id = ? AND tenant_id = ? AND status != 'Concluida'`).run(message, importacaoId, TENANT_ID)
    return { success: false, message: `A importação foi revertida sem gravar dados: ${message}` }
  }
}

export async function getHistoricoImportacoes(): Promise<ImportacaoHistorico[]> {
  return db.prepare(`SELECT id, nome_arquivo, status, criado_em, concluido_em, erro
    FROM importacoes_planilha WHERE tenant_id = ? ORDER BY id DESC LIMIT 20`)
    .all(TENANT_ID) as ImportacaoHistorico[]
}
