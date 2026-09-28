'use server'

import { diagnosticarSistema, type DiagnosticoSistema } from '@/lib/readiness'
import { exigirPerfil } from '@/lib/session'

export async function getDiagnosticoSistema(): Promise<DiagnosticoSistema> {
  await exigirPerfil(['admin'])
  return diagnosticarSistema()
}

