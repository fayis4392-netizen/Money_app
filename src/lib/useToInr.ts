import { useCallback } from 'react'
import { useAppState } from '@/data/store'
import { inrPerSar } from '@/domain/pricing'
import type { Currency } from '@/domain/types'

/** ₹ value of an amount, using today's rates for SAR and AED. */
export function useToInr() {
  const q = useAppState((s) => s.settings.dubaiQuote)
  const c = useAppState((s) => s.settings.sarPerAed)
  return useCallback((amount: number, cur: Currency) => (cur === 'INR' ? amount : cur === 'SAR' ? amount * inrPerSar(q, c) : (amount * 1000) / q), [q, c])
}
