import { existsSync } from 'node:fs'
import path from 'node:path'
import db from '@/lib/db'
import { configuracaoWhatsApp, nomeTemplateWhatsApp } from '@/lib/whatsapp-cloud.mjs'
import { TIPOS_MENSAGEM_WHATSAPP } from '@/lib/whatsapp.mjs'

export interface DiagnosticoItem {
  id: string
  titulo: string
  detalhe: string
  status: 'Pronto' | 'Atenção' | 'Bloqueio'
}

export interface DiagnosticoSistema {
  prontoParaRede: boolean
  itens: DiagnosticoItem[]
  whatsappAusentes: string[]
  templatesAusentes: string[]
  backupExternoConfigurado: boolean
}

export function diagnosticarSistema(): DiagnosticoSistema {
  const itens: DiagnosticoItem[] = []
  const integridade = String(db.pragma('integrity_check', { simple: true }))
  itens.push({ id: 'sqlite-integrity', titulo: 'Integridade do banco', detalhe: integridade === 'ok' ? 'SQLite respondeu integrity_check = ok.' : `SQLite respondeu: ${integridade}`, status: integridade === 'ok' ? 'Pronto' : 'Bloqueio' })
  const journal = String(db.pragma('journal_mode', { simple: true })).toLowerCase()
  itens.push({ id: 'sqlite-wal', titulo: 'Concorrência local', detalhe: journal === 'wal' ? 'WAL ativo para leituras simultâneas e uma instância do ERP.' : `Journal mode atual: ${journal}.`, status: journal === 'wal' ? 'Pronto' : 'Bloqueio' })
  itens.push({ id: 'sqlite-instance', titulo: 'Topologia de hospedagem', detalhe: 'O SQLite exige uma única instância do servidor e disco persistente. Não use escalonamento horizontal.', status: 'Atenção' })

  const appUrl = process.env.APP_URL?.trim() || ''
  const https = appUrl.startsWith('https://')
  itens.push({ id: 'app-url', titulo: 'URL pública HTTPS', detalhe: https ? appUrl : 'Defina APP_URL com a URL HTTPS usada pelos usuários e pelo webhook.', status: https ? 'Pronto' : 'Atenção' })
  const cookieSeguro = process.env.AUTH_COOKIE_SECURE === 'true'
  itens.push({ id: 'secure-cookie', titulo: 'Cookie seguro', detalhe: cookieSeguro ? 'AUTH_COOKIE_SECURE=true.' : 'Mantenha false no localhost; use true quando publicar com HTTPS.', status: https && !cookieSeguro ? 'Bloqueio' : cookieSeguro ? 'Pronto' : 'Atenção' })

  const ultimoBackup = db.prepare(`SELECT criado_em, integridade, arquivo FROM backups_registro
    ORDER BY criado_em DESC, id DESC LIMIT 1`).get() as { criado_em: string; integridade: string; arquivo: string } | undefined
  const arquivoPresente = ultimoBackup ? existsSync(path.join(process.cwd(), 'database', 'backups', ultimoBackup.arquivo)) : false
  itens.push({ id: 'backup-local', titulo: 'Backup local recente', detalhe: ultimoBackup && arquivoPresente ? `${ultimoBackup.arquivo} · ${ultimoBackup.criado_em}` : 'Ainda não há um backup local disponível.', status: ultimoBackup?.integridade === 'Válido' && arquivoPresente ? 'Pronto' : 'Bloqueio' })
  const backupExternoConfigurado = Boolean(process.env.BACKUP_EXTERNAL_DIR?.trim())
  itens.push({ id: 'backup-external', titulo: 'Destino externo', detalhe: backupExternoConfigurado ? 'BACKUP_EXTERNAL_DIR configurado; novas cópias serão verificadas por SHA-256.' : 'Configure uma pasta sincronizada por OneDrive, Google Drive ou NAS.', status: backupExternoConfigurado ? 'Pronto' : 'Atenção' })

  const whatsapp = configuracaoWhatsApp()
  const templatesAusentes = TIPOS_MENSAGEM_WHATSAPP.map((tipo) => nomeTemplateWhatsApp(tipo)).filter((item) => !item.nome).map((item) => item.chave)
  itens.push({ id: 'whatsapp-api', titulo: 'WhatsApp Cloud API', detalhe: whatsapp.configurado ? 'Credenciais principais configuradas sem exposição no navegador.' : `Variáveis ausentes: ${whatsapp.ausentes.join(', ')}.`, status: whatsapp.configurado ? 'Pronto' : 'Atenção' })
  itens.push({ id: 'whatsapp-templates', titulo: 'Templates do WhatsApp', detalhe: templatesAusentes.length === 0 ? 'Todos os seis modelos possuem template configurado.' : `Ainda faltam ${templatesAusentes.length} templates.`, status: templatesAusentes.length === 0 ? 'Pronto' : 'Atenção' })
  return {
    prontoParaRede: !itens.some((item) => item.status === 'Bloqueio'), itens,
    whatsappAusentes: whatsapp.ausentes, templatesAusentes, backupExternoConfigurado,
  }
}

