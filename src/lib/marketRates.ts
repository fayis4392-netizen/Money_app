import { useCallback, useEffect, useState } from 'react'

/**
 * Market exchange rates for SAR, AED and INR, to watch only: nothing in the books uses them.
 * Free public sources, updated about once a day. Cached for an hour in this browser.
 */
export interface MarketRates {
  /** ₹ for 1 SAR */
  inrPerSar: number
  /** AED for 1 SAR */
  aedPerSar: number
  /** when the source last updated its rates (ISO) */
  updated: string
  source: string
}

const CACHE = 'exchange-ledger:market-rates'
const MAX_AGE = 60 * 60 * 1000

async function fromErApi(): Promise<MarketRates> {
  const r = await fetch('https://open.er-api.com/v6/latest/SAR')
  const d = (await r.json()) as { result?: string; rates?: Record<string, number>; time_last_update_unix?: number }
  if (d.result !== 'success' || !d.rates?.INR || !d.rates?.AED) throw new Error('rates unavailable')
  return { inrPerSar: d.rates.INR, aedPerSar: d.rates.AED, updated: new Date((d.time_last_update_unix ?? 0) * 1000).toISOString(), source: 'open.er-api.com' }
}

async function fromCurrencyApi(): Promise<MarketRates> {
  const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/sar.json')
  const d = (await r.json()) as { date?: string; sar?: Record<string, number> }
  if (!d.sar?.inr || !d.sar?.aed) throw new Error('rates unavailable')
  return { inrPerSar: d.sar.inr, aedPerSar: d.sar.aed, updated: (d.date ?? '') + 'T00:00:00Z', source: 'currency-api (jsDelivr)' }
}

function cached(): { at: number; rates: MarketRates } | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? 'null')
  } catch {
    return null
  }
}

export async function loadMarketRates(force = false): Promise<MarketRates> {
  const c = cached()
  if (!force && c && Date.now() - c.at < MAX_AGE) return c.rates
  let rates: MarketRates
  try {
    rates = await fromErApi()
  } catch {
    rates = await fromCurrencyApi() // second source if the first is down
  }
  try {
    localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), rates }))
  } catch {
    /* fine: fetch again next time */
  }
  return rates
}

/** Market rates for a screen: shows the cached copy at once, then refreshes it. */
export function useMarketRates() {
  const [rates, setRates] = useState<MarketRates | null>(() => cached()?.rates ?? null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const refresh = useCallback((force = false) => {
    setState('loading')
    loadMarketRates(force).then(
      (r) => {
        setRates(r)
        setState('idle')
      },
      () => setState('error'),
    )
  }, [])
  useEffect(() => {
    // fetching is a side effect of the screen opening, not of rendering
    const t = setTimeout(() => refresh(false), 0)
    return () => clearTimeout(t)
  }, [refresh])
  return { rates, state, refresh }
}

/* ---------------- daily history (last week / month) ---------------- */

export interface DayRate { date: string; inrPerSar: number; aedPerSar: number }
const HIST = 'exchange-ledger:fx-history'

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

async function fetchDay(date: string | 'latest'): Promise<DayRate | null> {
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/sar.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/sar.json`,
  ]
  for (const u of urls) {
    try {
      const r = await fetch(u)
      if (!r.ok) continue
      const d = (await r.json()) as { date?: string; sar?: Record<string, number> }
      if (d.sar?.inr && d.sar?.aed) return { date: d.date ?? (date === 'latest' ? isoDay(new Date()) : date), inrPerSar: d.sar.inr, aedPerSar: d.sar.aed }
    } catch {
      /* try the mirror */
    }
  }
  return null
}

/** One rate per day for the last `days` days. Past days never change, so they're kept in this browser. */
export async function loadHistory(days: number): Promise<DayRate[]> {
  let store: Record<string, [number, number]> = {}
  try {
    store = JSON.parse(localStorage.getItem(HIST) ?? '{}')
  } catch {
    /* start fresh */
  }
  const today = isoDay(new Date())
  const dates: string[] = []
  for (let i = days - 1; i >= 1; i--) dates.push(isoDay(new Date(Date.now() - i * 86_400_000)))
  const missing = dates.filter((d) => !store[d])
  const got = await Promise.all(missing.map((d) => fetchDay(d)))
  got.forEach((x, i) => x && (store[missing[i]] = [x.inrPerSar, x.aedPerSar]))
  // today's rate may not be published yet: use the newest one there is
  const latest = await fetchDay('latest')
  if (latest) store[latest.date] = [latest.inrPerSar, latest.aedPerSar]
  try {
    // keep about three months
    const keep = Object.keys(store).sort().slice(-95)
    localStorage.setItem(HIST, JSON.stringify(Object.fromEntries(keep.map((k) => [k, store[k]]))))
  } catch {
    /* fine */
  }
  const from = dates[0] ?? today
  return Object.keys(store)
    .filter((d) => d >= from)
    .sort()
    .map((d) => ({ date: d, inrPerSar: store[d][0], aedPerSar: store[d][1] }))
}

export function useRateHistory(days: number) {
  const [data, setData] = useState<{ days: number; rows: DayRate[] } | null>(null)
  const [state, setState] = useState<'loading' | 'idle' | 'error'>('loading')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      setState('loading')
      loadHistory(days).then(
        (rows) => {
          if (!live) return
          setData({ days, rows })
          setState(rows.length ? 'idle' : 'error')
        },
        () => live && setState('error'),
      )
    }, 0)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [days, tick])
  return { rows: data?.rows ?? [], state, refresh: () => setTick((n) => n + 1) }
}
