'use server'

import { criarBackupRegistrado, listarBackups, reenviarBackupExterno, type BackupRegistro } from '@/lib/backup'
import { exigirPerfil } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export async function getBackups(): Promise<BackupRegistro[]> {
  const sessao = await exigirPerfil(['admin'])
  return listarBackups(sessao.tenantId)
}

export async function copiarBackupExterno(id: number): Promise<{ success: boolean; message: string }> {
  try {
    const sessao = await exigirPerfil(['admin'])
    const backup = await reenviarBackupExterno(sessao.tenantId, id)
    revalidatePath('/configuracoes/seguranca')
    return backup.externo_status === 'Copiado'
      ? { success: true, message: 'Cópia externa criada e conferida por SHA-256.' }
      : { success: false, message: process.env.BACKUP_EXTERNAL_DIR ? 'A cópia externa falhou. Verifique a pasta e as permissões.' : 'Configure BACKUP_EXTERNAL_DIR para uma pasta sincronizada.' }
  } catch (error) {
    console.error('[copiarBackupExterno]', error)
    return { success: false, message: 'Não foi possível copiar o backup para o destino externo.' }
  }
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
