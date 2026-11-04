import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { changeTheme, getTheme, subscribeTheme, themeInitializationScript } from '../public/theme-transition.mjs'

const names = ['document', 'window', 'localStorage', 'CSS']
const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
afterEach(() => {
  for (const name of names) {
    const descriptor = original.get(name)
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

function browser({ reducedMotion = false, storageFails = false, startViewTransition } = {}) {
  const events = new EventTarget()
  const writes = []
  const root = { dataset: { theme: 'dark' } }
  Object.assign(globalThis, {
    document: { documentElement: root, startViewTransition },
    window: {
      matchMedia: () => ({ matches: reducedMotion }),
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    },
    localStorage: { setItem: (...args) => { if (storageFails) throw new Error('blocked'); writes.push(args) } },
    CSS: { supports: () => true },
  })
  return { root, writes, events }
}

test('first paint validates saved preferences and defaults to dark even when storage is blocked', () => {
  for (const saved of [null, 'dark', 'invalid', 'light']) {
    const document = { documentElement: { dataset: {} } }
    runInNewContext(themeInitializationScript, { document, localStorage: { getItem: () => saved } })
    assert.equal(document.documentElement.dataset.theme, saved === 'light' ? 'light' : 'dark')
  }
  const document = { documentElement: { dataset: {} } }
  runInNewContext(themeInitializationScript, { document, localStorage: { getItem() { throw new Error('blocked') } } })
  assert.equal(document.documentElement.dataset.theme, 'dark')
})

test('reduced motion and browsers without View Transitions switch without depending on storage', async () => {
  let calls = 0
  const { root } = browser({ reducedMotion: true, storageFails: true, startViewTransition() { throw new Error('must not animate') } })
  const unsubscribe = subscribeTheme(() => calls++)
  await changeTheme('light')
  assert.equal(root.dataset.theme, 'light')
  assert.equal(root.dataset.themeTransition, undefined)
  assert.equal(calls, 1)
  await changeTheme('light')
  await changeTheme('invalid')
  assert.equal(calls, 1)
  unsubscribe()
  const fallback = browser()
  await changeTheme('light')
  assert.equal(fallback.root.dataset.theme, 'light')
  assert.equal(fallback.writes.length, 1)
})

test('sunrise/sunset keep the current operation locked until the snapshot finishes and always clean up', async () => {
  let finish
  const { root, writes } = browser({ startViewTransition(update) {
    update()
    return { ready: Promise.resolve(), finished: new Promise(resolve => { finish = resolve }) }
  } })
  const first = changeTheme('light')
  assert.equal(root.dataset.themeTransition, 'sunrise')
  await changeTheme('dark')
  assert.equal(getTheme(), 'light')
  finish()
  await first
  assert.equal(root.dataset.themeTransition, undefined)
  const second = changeTheme('dark')
  assert.equal(root.dataset.themeTransition, 'sunset')
  finish()
  await second
  assert.equal(getTheme(), 'dark')
  assert.equal(writes.length, 2)
  assert.equal(root.dataset.themeTransition, undefined)
})

test('a skipped/failed animation still applies the preference exactly once and releases the lock', async () => {
  const { root, writes } = browser({ startViewTransition(update) {
    update()
    return { ready: Promise.reject(new Error('skipped')), finished: Promise.reject(new Error('hidden tab')) }
  } })
  await changeTheme('light')
  assert.equal(root.dataset.theme, 'light')
  assert.equal(root.dataset.themeTransition, undefined)
  assert.equal(writes.length, 1)
  await changeTheme('dark')
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(writes.length, 2)
})

test('cross-tab synchronization ignores unrelated keys, handles storage clear and unsubscribes', () => {
  const { root, events } = browser()
  let calls = 0
  const unsubscribe = subscribeTheme(() => calls++)
  const storage = (key, newValue) => events.dispatchEvent(Object.assign(new Event('storage'), { key, newValue }))
  storage('unrelated', 'light')
  assert.equal(calls, 0)
  storage('salge3d-theme', 'light')
  assert.equal(root.dataset.theme, 'light')
  storage(null, null)
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(calls, 2)
  unsubscribe()
  storage('salge3d-theme', 'light')
  assert.equal(calls, 2)
})
