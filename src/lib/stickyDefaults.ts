import { todayStr } from '@/domain/format'

const KEY = 'exchange-ledger:sticky-defaults'

export interface StickyDefaults {
  /** Calendar day these defaults were saved; if it changes, date resets to today. */
  savedOn?: string
  dealDate?: string
  customerId?: string
  regionId?: string
  distributorId?: string
  autoRate?: boolean
  customerRate?: string
  collectorId?: string
}

export function getStickyDefaults(): StickyDefaults {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StickyDefaults
    // On a new calendar day, don't carry over yesterday's dealDate
    if (parsed.savedOn && parsed.savedOn !== todayStr()) {
      return { ...parsed, dealDate: undefined }
    }
    return parsed
  } catch {
    return {}
  }
}

export function saveStickyDefaults(patch: Partial<StickyDefaults>) {
  try {
    const next: StickyDefaults = { ...getStickyDefaults(), ...patch, savedOn: todayStr() }
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore storage errors */
  }
}

export function clearStickyDefaults() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
