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
