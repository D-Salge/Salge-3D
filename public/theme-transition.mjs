// Shared by the ERP and its visual preview. No keyboard shortcut is registered.
export const THEME_STORAGE_KEY = 'salge3d-theme'
export const THEME_EVENT = 'salge3d:theme-change'
export const themeInitializationScript = `try{document.documentElement.dataset.theme=localStorage.getItem('${THEME_STORAGE_KEY}')==='light'?'light':'dark'}catch{document.documentElement.dataset.theme='dark'}`

let changing = false

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function subscribeTheme(listener) {
  const sync = (event) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return
    document.documentElement.dataset.theme = event.newValue === 'light' ? 'light' : 'dark'
    listener()
  }
  window.addEventListener(THEME_EVENT, listener)
  window.addEventListener('storage', sync)
  return () => {
    window.removeEventListener(THEME_EVENT, listener)
    window.removeEventListener('storage', sync)
  }
}

export async function changeTheme(next) {
  if (changing || !['dark', 'light'].includes(next) || next === getTheme()) return
  const root = document.documentElement
  changing = true
  let applied = false
  const apply = () => {
    if (applied) return
    applied = true
    root.dataset.theme = next
    // Privacy mode or a full storage quota must not prevent switching themes.
    try { localStorage.setItem(THEME_STORAGE_KEY, next) } catch {}
    window.dispatchEvent(new Event(THEME_EVENT))
  }

  try {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || !document.startViewTransition || !CSS.supports('mask-image', 'linear-gradient(black, transparent)')) {
      apply()
      return
    }
    root.dataset.themeTransition = next === 'light' ? 'sunrise' : 'sunset'
    const transition = document.startViewTransition(apply)
    // A hidden tab or another transition may skip the animation.
    transition.ready.catch(() => {})
    await transition.finished
  } catch {
    apply()
  } finally {
    delete root.dataset.themeTransition
    changing = false
  }
}
