/**
 * Backups to Google Drive, straight from the browser.
 * Permission is `drive.file`: the app can only see files it created itself (its backup folder),
 * never anything else in the Drive. Google asks the person to approve the first time.
 */

/** Public OAuth client ID (not a secret). Can be overridden with VITE_GOOGLE_CLIENT_ID. */
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '730027450899-070gnfg17uo0g86kufk1m9iphe9b4k33.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER = 'Exchange Ledger Backups'
const TOKEN_KEY = 'exchange-ledger:drive-token'

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient } } }
  }
}

let gis: Promise<void> | null = null
function loadGis() {
  gis ??= new Promise<void>((ok, fail) => {
    if (window.google?.accounts) return ok()
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => ok()
    s.onerror = () => {
      gis = null
      fail(new Error("Couldn't reach Google. Check the internet connection."))
    }
    document.head.appendChild(s)
  })
  return gis
}

/** A token from this browser session, if it is still valid for a few minutes. */
function savedToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string; until: number } | null
    return t && t.until > Date.now() + 120_000 ? t.token : null
  } catch {
    return null
  }
}
export const driveConnected = () => !!savedToken()

/** Ask Google for permission (opens Google's window: call it from a click). */
async function getToken(): Promise<string> {
  const have = savedToken()
  if (have) return have
  await loadGis()
  return new Promise((ok, fail) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return fail(new Error(r.error_description || r.error || 'Google did not allow the backup'))
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: r.access_token, until: Date.now() + (r.expires_in ?? 3600) * 1000 }))
        } catch {
          /* fine: we'll ask again next time */
        }
        ok(r.access_token)
      },
      error_callback: (e) => fail(new Error(e.type === 'popup_closed' ? 'The Google window was closed before allowing the backup' : e.type === 'popup_failed_to_open' ? 'The browser blocked the Google window: allow pop-ups for this site and try again' : e.message || e.type)),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

async function drive(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + token, ...init.headers } })
  if (r.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY)
    throw new Error('Google sign-in expired: press the button again')
  }
  if (!r.ok) {
    const body = await r.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Google Drive said ${r.status}`)
  }
  return r.json()
}

/** The app's backup folder (created on first use). */
async function folderId(token: string): Promise<string> {
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)
  const found = (await drive(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`)) as { files: { id: string }[] }
  if (found.files[0]) return found.files[0].id
  const made = (await drive(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  })) as { id: string }
  return made.id
}

/** Upload the books as a JSON file into the backup folder. Returns the file name and a link to the folder. */
export async function backupToDrive(books: unknown): Promise<{ fileName: string; folderUrl: string }> {
  const token = await getToken()
  const parent = await folderId(token)
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const fileName = `exchange-ledger-backup_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`
  const boundary = 'xl' + Math.random().toString(36).slice(2)
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [parent], mimeType: 'application/json' })}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(books)}\r\n--${boundary}--`
  await drive(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return { fileName, folderUrl: `https://drive.google.com/drive/folders/${parent}` }
}
