'use client'

/**
 * app/components/DashboardHeader.tsx
 * Header compartilhado entre todas as páginas do dashboard.
 * Client Component — gera data dinâmica no cliente para evitar hydration mismatch.
 */

import { Bell, Box, ChevronDown } from 'lucide-react'

export function DashboardHeader() {
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const hojeFormatado = hoje.charAt(0).toUpperCase() + hoje.slice(1)

  return (
    <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/[0.07] px-6 lg:px-10">
      {/* Logo mobile */}
      <div className="lg:hidden">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#d8f45a] text-[#16180f]">
          <Box size={18} />
        </div>
      </div>

      {/* Saudação desktop */}
      <div className="hidden lg:block">
        <p className="text-xs text-white/35">{hojeFormatado}</p>
        <p className="mt-1 text-sm font-medium text-white/75">Olá, Daniel 👋</p>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-4">
        <button
          aria-label="Notificações"
          className="relative rounded-lg p-2 text-white/45 transition hover:bg-white/[0.06] hover:text-white"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[#d8f45a]" />
        </button>

        <div className="flex items-center gap-3 border-l border-white/[0.08] pl-4">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#2e3540] text-xs font-semibold text-[#d8f45a]">
            DS
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-xs font-medium">Daniel Salge</p>
            <p className="text-[10px] text-white/35">Administrador</p>
          </div>
          <ChevronDown size={14} className="text-white/35" />
        </div>
      </div>
    </header>
  )
}
