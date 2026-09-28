'use server'

import { criarBackupRegistrado, listarBackups, type BackupRegistro } from '@/lib/backup'
import { exigirPerfil } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export async function getBackups(): Promise<BackupRegistro[]> {
  const sessao = await exigirPerfil(['admin'])
  return listarBackups(sessao.tenantId)
}

export async function criarBackupManual(): Promise<{ success: boolean; message: string }> {
  try {
    const sessao = await exigirPerfil(['admin'])
    const backup = await criarBackupRegistrado('Manual', sessao)
    revalidatePath('/configuracoes/seguranca')
    return { success: true, message: `Backup ${backup.arquivo} criado e verificado.` }
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return { success: false, message: 'Apenas administradores podem criar backups.' }
    console.error('[criarBackupManual]', error)
    return { success: false, message: 'Não foi possível criar o backup.' }
  }
}
