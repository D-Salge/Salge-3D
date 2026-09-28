'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CheckCircle2, Cloud, DatabaseBackup, Download, HardDrive, RefreshCw } from 'lucide-react'
import { copiarBackupExterno, criarBackupManual } from '@/app/actions/backups'
import type { BackupRegistro } from '@/lib/backup'

function tamanho(bytes: number) { return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }

export function BackupsPage({ backups }: { backups: BackupRegistro[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState('')
  function criar() { startTransition(async () => { const result = await criarBackupManual(); setMensagem(result.message); if (result.success) router.refresh() }) }
  function copiar(id: number) { startTransition(async () => { const result = await copiarBackupExterno(id); setMensagem(result.message); router.refresh() }) }
  return <><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-semibold"><DatabaseBackup size={18} className="text-[#d8f45a]" /> Backups verificados</h2><p className="mt-1 text-xs text-white/35">Uma cópia automática por dia. BACKUP_EXTERNAL_DIR envia outra cópia para OneDrive, Google Drive ou NAS.</p></div><button onClick={criar} disabled={isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#d8f45a] px-4 text-xs font-semibold text-[#15180d] disabled:opacity-50"><HardDrive size={14} /> {isPending ? 'Criando...' : 'Criar backup agora'}</button></div>{mensagem && <p className="mb-4 rounded-lg bg-white/[0.04] p-3 text-xs text-white/60">{mensagem}</p>}<div className="rounded-2xl border border-white/[0.08] bg-[#15171b]"><div className="divide-y divide-white/[0.05]">{backups.length === 0 && <p className="p-8 text-center text-xs text-white/35">O primeiro backup será criado ao abrir o dashboard.</p>}{backups.map((backup) => <div key={backup.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="text-sm font-medium">{backup.arquivo}</p><p className="mt-1 text-[10px] text-white/30">{backup.tipo} · {new Date(backup.criado_em).toLocaleString('pt-BR')} · {tamanho(backup.tamanho_bytes)} · SHA-256 {backup.sha256.slice(0, 12)}…</p><p className={`mt-1 flex items-center gap-1 text-[10px] ${backup.externo_status === 'Copiado' ? 'text-blue-300' : backup.externo_status === 'Falhou' ? 'text-red-300' : 'text-white/25'}`}><Cloud size={10} /> Externo: {backup.externo_status}{backup.externo_em ? ` · ${new Date(backup.externo_em).toLocaleString('pt-BR')}` : ''}</p></div><div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] ${backup.integridade === 'Válido' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}><CheckCircle2 size={11} /> {backup.integridade}</span>{backup.integridade !== 'Ausente' && <button disabled={isPending} onClick={() => copiar(backup.id)} className="rounded-lg bg-white/[0.05] p-2 text-white/50" title="Copiar novamente para destino externo"><RefreshCw size={14} /></button>}{backup.integridade !== 'Ausente' && <a href={`/api/backups/${backup.id}`} className="rounded-lg bg-white/[0.05] p-2 text-white/50" title="Baixar"><Download size={14} /></a>}</div></div>)}</div></div></>
}
