import { toast } from 'sonner'
import { hasUnsaved } from '@/data/store'

/*
 * Every deploy gives the app's files new names. A tab opened before a deploy still asks for
 * the old names (e.g. the PDF code), which no longer exist. So: notice new versions early,
 * and if an old file is missing, reload into the new version (once, and never over unsaved work).
 */

const RELOADED_AT = 'exchange-ledger:reloaded-at'
let reloading = false

export function reloadForUpdate() {
  if (reloading) return
  if (hasUnsaved()) {
    toast('The app was updated. It will reload once your changes are saved.', { id: 'update' })
    setTimeout(reloadForUpdate, 3000)
    return
  }
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0)
    if (Date.now() - last < 30_000) {
      // just reloaded and still failing: don't loop, ask instead
      toast.error('Part of the app could not load. Check the internet connection and refresh the page.', { id: 'update' })
      return
    }
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    /* private mode: reload anyway */
  }
  reloading = true
  toast('Updating to the latest version…', { id: 'update' })
  location.reload()
}

/** The main script this tab is running, e.g. /assets/index-AbC123.js */
const current = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src')

/** Ask the server which version is live; offer a reload when it's newer than this tab. */
async function checkForUpdate() {
  const mine = current()
  if (!mine) return // dev server
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text()
    const live = html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/)?.[1]
    if (live && live !== mine)
      toast('A new version of the app is ready', { id: 'update', duration: Infinity, action: { label: 'Reload', onClick: reloadForUpdate } })
  } catch {
    /* offline: try again later */
  }
}

export function watchForUpdates() {
  // Vite reports a file that failed to load (e.g. the PDF code from an older version)
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    reloadForUpdate()
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void checkForUpdate())
  setInterval(() => document.visibilityState === 'visible' && void checkForUpdate(), 10 * 60_000)
}

/** True for "a file of the app couldn't be loaded" errors (an old tab after a deploy, or offline). */
export const isMissingChunk = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i.test(String((e as Error)?.message ?? e))
