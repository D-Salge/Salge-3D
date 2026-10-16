'use client'

/**
 * app/components/DashboardHeader.tsx
 * Header compartilhado entre todas as páginas do dashboard.
 * Client Component — gera data dinâmica no cliente para evitar hydration mismatch.
 */

import { Box, LogOut } from 'lucide-react'
import type { SessaoAtual } from '@/lib/session'
import { BuscaGlobal } from '@/app/components/BuscaGlobal'

export function DashboardHeader({ usuario }: { usuario: SessaoAtual }) {
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const hojeFormatado = hoje.charAt(0).toUpperCase() + hoje.slice(1)

  return (
    <header className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#101114]/90 px-4 backdrop-blur-xl sm:px-6 lg:h-[76px] lg:px-10">
      {/* Logo mobile */}
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#d8f45a] text-[#16180f]">
          <Box size={18} />
        </div>
        <div><p className="text-sm font-semibold">Salge<span className="text-[#d8f45a]">3D</span></p><p className="text-[9px] uppercase tracking-[0.16em] text-white/30">ERP</p></div>
      </div>

      {/* Saudação desktop */}
      <div className="hidden lg:block">
        <p className="text-xs text-white/35">{hojeFormatado}</p>
        <p className="mt-1 text-sm font-medium text-white/75">Olá, {usuario.nome.split(/\s+/)[0]} 👋</p>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-4">
        <BuscaGlobal />
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#2e3540] text-xs font-semibold text-[#d8f45a]">
            {usuario.nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-medium">{usuario.nome}</p>
            <p className="text-[10px] text-white/35">{usuario.perfil === 'admin' ? 'Administrador' : usuario.perfil === 'operador' ? 'Operador' : 'Visualizador'}</p>
          </div>
          <a href="/logout" title="Sair" aria-label="Sair" className="rounded-lg p-2 text-white/35 hover:bg-white/[0.06] hover:text-white"><LogOut size={14} /></a>
        </div>
      </div>
    </header>
  )
}
