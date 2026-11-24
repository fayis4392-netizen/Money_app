import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { DEFAULT_SETTINGS, type CapitalEntry, type Deal, type Narration, type Party, type Receipt, type Region, type Expense, type Settings, type Transfer } from '@/domain/types'

/**
 * App data. Screens read it only through `useAppState` and change it only through `actions.ts`.
 * Signed in to Supabase, the books are one shared document saved after every change (see
 * `supabase/migrations/0001_app_state.sql`); without Supabase they stay in this browser.
 */
export interface AppData {
  version: 2
  settings: Settings
  regions: Region[]
  parties: Party[]
  deals: Deal[]
  receipts: Receipt[]
  transfers: Transfer[]
  expenses: Expense[]
  capital: CapitalEntry[]
  /** reworded ledger lines, by line key */
  narrations: Record<string, Narration>
  counters: { deal: number; receipt: number; transfer: number; capital: number; expense: number }
}

const KEY = 'exchange-ledger:data'
const OLD_KEY = 'exchange-ledger:v1'

export function emptyData(): AppData {
  return { version: 2, settings: structuredClone(DEFAULT_SETTINGS), regions: [], parties: [], deals: [], receipts: [], transfers: [], expenses: [], capital: [], narrations: {}, counters: { deal: 0, receipt: 0, transfer: 0, capital: 0, expense: 0 } }
}

/**
 * Earlier the Dubai agent's rate was applied when he received AED (settle → ₹). Now his
 * account is kept in AED and the rate applies on each ₹ payout. Old payouts get the
 * average rate of that agent's old settlements (or today's quote) to work out their AED.
 */
function migrateAgentToAed(transfers: Transfer[], fallbackQuote: number): Transfer[] {
  if (!transfers.some((t) => t.kind === 'payout' && t.aed == null)) return transfers
  const old = new Map<string, { aed: number; inr: number }>()
  for (const t of transfers)
    if (t.kind === 'settle' && t.inr && t.aed && !t.voided) {
      const m = old.get(t.toId!) ?? { aed: 0, inr: 0 }
      old.set(t.toId!, { aed: m.aed + t.aed, inr: m.inr + t.inr })
    }
  return transfers.map((t) => {
    if (t.kind === 'settle') return { ...t, inr: undefined, rate: undefined, marketRate: undefined }
    if (t.kind === 'payout' && t.aed == null) {
      const m = old.get(t.fromId)
      const rate = m && m.inr > 0 ? Math.round(((m.aed * 1000) / m.inr) * 1e4) / 1e4 : fallbackQuote
      return { ...t, rate, aed: Math.round((t.inr! / 1000) * rate * 1000) / 1000 }
    }
    return t
  })
}

/** Rates used to be AED per 1 SAR (0.979); they're now SAR per 1 AED (1.0215), the way the business quotes them. */
function migrateToSarPerAed(d: Record<string, any>) {
  const s = d.settings
  if (!s || s.sarAedRate == null) return
  const flip = (x: number) => Math.round((1 / x) * 1e6) / 1e6
  s.sarPerAed = flip(s.sarAedRate)
  delete s.sarAedRate
  s.rateLog = (s.rateLog ?? []).map((r: any) => { const { sarAedRate, ...rest } = r; return sarAedRate != null ? { ...rest, sarPerAed: flip(sarAedRate) } : r })
  d.deals = (d.deals ?? []).map((x: any) => { const { sarAedRate, ...rest } = x; return sarAedRate != null ? { ...rest, sarPerAed: flip(sarAedRate) } : x })
  // the AED actually received stays exactly as recorded; only the rate is shown the other way round
  d.transfers = (d.transfers ?? []).map((t: any) => (t.kind === 'exchange' && t.rate ? { ...t, rate: flip(t.rate) } : t))
}

/** Bring saved books of any earlier shape up to date. */
export function normalize(input: unknown): AppData {
  const d = structuredClone(input ?? {}) as Partial<AppData> & { batches?: unknown }
    // the batch model was replaced by transfer entries; old batch data is dropped
    delete d.batches
    delete (d as Record<string, unknown>).allocations
    // v1 had settings, regions and parties only
    if (d.settings) delete (d.settings as unknown as Record<string, unknown>).defaultDistributorFeeInr
    migrateToSarPerAed(d)
    if (d.transfers) d.transfers = migrateAgentToAed(d.transfers, { ...DEFAULT_SETTINGS, ...d.settings }.dubaiQuote)
    // books started before the rate was turned round kept the old default (0.979 AED per SAR)
    if (d.settings && typeof d.settings.sarPerAed === 'number' && d.settings.sarPerAed > 0 && d.settings.sarPerAed < 1) d.settings.sarPerAed = Math.round((1 / d.settings.sarPerAed) * 1e4) / 1e4
    const e = emptyData()
    return { ...e, ...d, version: 2, settings: { ...DEFAULT_SETTINGS, ...d.settings }, counters: { ...e.counters, ...d.counters } }
}

/** The books saved in this browser (before Supabase, or when it isn't set up). */
export function loadLocal(): AppData {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)
    return raw ? normalize(JSON.parse(raw)) : emptyData()
  } catch {
    return emptyData()
  }
}

let state: AppData = supabase ? emptyData() : loadLocal()
const listeners = new Set<() => void>()

export function getState() {
  return state
}

/** Apply a change and persist it. `fn` returns the next state; never mutate. */
export function setState(fn: (s: AppData) => AppData) {
  state = fn(state)
  if (cloud.on) queueSave()
  else
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
      localStorage.removeItem(OLD_KEY)
    } catch {
      toast.error("Couldn't save in this browser (storage full or blocked). Download a backup from Settings now.", { id: 'local-save' })
    }
  listeners.forEach((l) => l())
}

/* ======================= shared books in Supabase ======================= */

export type SyncStatus = 'local' | 'saved' | 'saving' | 'offline' | 'error'
const cloud = { on: false, version: 0, saving: false, dirty: false, status: 'local' as SyncStatus, updatedAt: '', retry: 0 as ReturnType<typeof setTimeout> | 0 }
const syncListeners = new Set<() => void>()
const setStatus = (s: SyncStatus) => {
  cloud.status = s
  syncListeners.forEach((l) => l())
}
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => (syncListeners.add(l), () => syncListeners.delete(l)),
    () => cloud.status,
  )
/** True while a change hasn't reached Supabase yet. */
export const hasUnsaved = () => cloud.on && (cloud.saving || cloud.dirty || cloud.status === 'offline' || cloud.status === 'error')

function replaceState(d: AppData) {
  state = d
  listeners.forEach((l) => l())
}

async function fetchRemote() {
  const { data, error } = await supabase!.from('app_state').select('data, version, updated_at').eq('id', 1).single()
  if (error) throw error
  return { data: data.data as unknown, version: Number(data.version), updatedAt: data.updated_at as string }
}

function queueSave() {
  if (cloud.saving) {
    cloud.dirty = true
    return
  }
  void save()
}

/** Save the books; refused if someone else saved first, in which case their version is loaded. */
async function save() {
  cloud.saving = true
  cloud.dirty = false
  setStatus('saving')
  const snapshot = state
  const { data, error } = await supabase!.rpc('save_state', { expected_version: cloud.version, new_data: snapshot })
  cloud.saving = false
  if (!error) {
    cloud.version = Number(data)
    setStatus('saved')
    if (cloud.dirty) queueSave()
    return
  }
  if (error.code === 'P0409') {
    // someone else saved in between: never overwrite their work; show the latest books instead
    try {
      const r = await fetchRemote()
      cloud.version = r.version
      cloud.dirty = false
      replaceState(normalize(r.data))
      setStatus('saved')
    } catch {
      setStatus('offline')
    }
    toast.error('Someone else saved at the same moment, so your last change was not kept. The latest books are now shown: please enter it again.', { duration: 15000 })
    return
  }
  // no connection (or a server problem): keep the change here and try again shortly
  cloud.dirty = true
  setStatus(error.message?.toLowerCase().includes('fetch') ? 'offline' : 'error')
  if (error.code === '42501') toast.error('You are signed out: sign in again to save.', { id: 'save-auth' })
  clearTimeout(cloud.retry)
  cloud.retry = setTimeout(() => cloud.dirty && !cloud.saving && queueSave(), 5000)
}

let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null

/** After sign-in: load the shared books and follow other people's changes live. */
export async function connectCloud(): Promise<{ firstTime: boolean }> {
  const r = await fetchRemote()
  cloud.on = true
  cloud.version = r.version
  replaceState(normalize(r.data))
  setStatus('saved')
  channel?.unsubscribe()
  channel = supabase!
    .channel('books')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_state' }, async () => {
      if (cloud.saving || cloud.dirty) return // our own save, or one about to happen: its result decides
      try {
        const x = await fetchRemote()
        if (x.version > cloud.version && !cloud.saving && !cloud.dirty) {
          cloud.version = x.version
          replaceState(normalize(x.data))
        }
      } catch {
        /* the next save or reload will catch up */
      }
    })
    .subscribe()
  return { firstTime: r.version === 0 }
}

/** First time on Supabase: start the shared books from these. */
export function seedCloud(d: AppData) {
  setState(() => normalize(d))
}

export function disconnectCloud() {
  channel?.unsubscribe()
  channel = null
  Object.assign(cloud, { on: false, version: 0, saving: false, dirty: false })
  setStatus('local')
  replaceState(emptyData())
}

/** Restore points kept by Supabase (one an hour at most). */
export async function listRestorePoints() {
  const { data, error } = await supabase!.from('app_state_history').select('id, version, saved_at').order('saved_at', { ascending: false }).limit(200)
  if (error) throw error
  return data as { id: number; version: number; saved_at: string }[]
}
export async function restorePoint(id: number) {
  const { data, error } = await supabase!.from('app_state_history').select('data').eq('id', id).single()
  if (error) throw error
  setState(() => normalize(data.data))
}

if (typeof window !== 'undefined')
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsaved()) e.preventDefault()
  })

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Read app data; select a slice that is stored as-is (not a new object) to avoid re-render loops. */
export function useAppState<T>(select: (s: AppData) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

/** Whole data object (for screens that derive ledgers). */
export const useData = () => useAppState((s) => s)
