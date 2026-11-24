import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS, type CapitalEntry, type Deal, type Narration, type Party, type Receipt, type Region, type Expense, type Settings, type Transfer } from '@/domain/types'

/**
 * App data. Until the Supabase project is connected it lives in this browser
 * (localStorage). Screens read it only through `useAppState` and change it only
 * through `actions.ts`, so moving to Supabase replaces this file, not the screens.
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

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)
    if (!raw) return emptyData()
    const d = JSON.parse(raw) as Partial<AppData> & { batches?: unknown }
    // the batch model was replaced by transfer entries; old batch data is dropped
    delete d.batches
    delete (d as Record<string, unknown>).allocations
    // v1 had settings, regions and parties only
    if (d.settings) delete (d.settings as unknown as Record<string, unknown>).defaultDistributorFeeInr
    migrateToSarPerAed(d)
    if (d.transfers) d.transfers = migrateAgentToAed(d.transfers, { ...DEFAULT_SETTINGS, ...d.settings }.dubaiQuote)
    const e = emptyData()
    return { ...e, ...d, version: 2, settings: { ...DEFAULT_SETTINGS, ...d.settings }, counters: { ...e.counters, ...d.counters } }
  } catch {
    return emptyData()
  }
}

let state: AppData = load()
const listeners = new Set<() => void>()

export function getState() {
  return state
}

/** Apply a change and persist it. `fn` returns the next state; never mutate. */
export function setState(fn: (s: AppData) => AppData) {
  state = fn(state)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    localStorage.removeItem(OLD_KEY)
  } catch {
    /* storage full or blocked: keep working in memory */
  }
  listeners.forEach((l) => l())
}

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
