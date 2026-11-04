'use client'

import { useState, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { changeTheme, getTheme, subscribeTheme } from '@/public/theme-transition.mjs'

const getServerTheme = () => 'dark' as const

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme)
  const [changing, setChanging] = useState(false)
  const dark = theme === 'dark'
  const label = dark ? 'Ativar modo claro' : 'Ativar modo escuro'

  async function toggle() {
    setChanging(true)
    try {
      await changeTheme(dark ? 'light' : 'dark')
    } finally {
      setChanging(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={changing}
      aria-busy={changing}
      aria-label={label}
      title={label}
      className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-subtle disabled:cursor-wait sm:px-3"
    >
      {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
      <span className="hidden xl:inline">{dark ? 'Claro' : 'Escuro'}</span>
    </button>
  )
}
