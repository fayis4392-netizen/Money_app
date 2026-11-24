import { round2, round6 } from './pricing'
import type { Deal, Transfer } from './types'

export const live = (t: Transfer[]) => t.filter((x) => !x.voided)

/** AED a ₹ payment costs at the Dubai agent's AED-per-₹1,000 rate. */
export const aedFor = (inr: number, quote: number) => Math.round((inr / 1000) * quote * 1000) / 1000

/**
 * The rates actually achieved over a set of transfers:
 *  AED per SAR from exchanges, ₹ per AED from the Dubai agent's payouts, and so ₹ per SAR.
 * Optionally only transfers dated within [from, to].
 */
export function achievedRates(transfers: Transfer[], from?: string, to?: string) {
  const t = live(transfers).filter((x) => (!from || x.date >= from) && (!to || x.date <= to))
  const ex = t.filter((x) => x.kind === 'exchange'), po = t.filter((x) => x.kind === 'payout')
  const sar = ex.reduce((s, x) => s + (x.sar ?? 0), 0), aedIn = ex.reduce((s, x) => s + (x.aed ?? 0), 0)
  // the Dubai agent's rate is applied on each ₹ payment: AED it cost vs ₹ paid
  const aedOut = po.reduce((s, x) => s + (x.aed ?? 0), 0), inr = po.reduce((s, x) => s + (x.inr ?? 0), 0)
  const aedPerSar = sar > 0 ? aedIn / sar : undefined
  const inrPerAed = aedOut > 0 ? inr / aedOut : undefined
  return {
    aedPerSar: aedPerSar && round6(aedPerSar),
    /** average SAR given for 1 AED */
    sarPerAed: aedPerSar && round6(1 / aedPerSar),
    /** average AED per ₹1,000 the Dubai agent charged */
    quote: inrPerAed && round6(1000 / inrPerAed),
    inrPerSar: aedPerSar && inrPerAed ? round6(aedPerSar * inrPerAed) : undefined,
    sarExchanged: sar,
    inrPaid: round2(inr),
  }
}

/**
 * Profit of deals at the rates actually achieved: each deal's SAR turned into ₹ at the
 * achieved ₹-per-SAR, minus the ₹ delivered and the fee. Undefined until there have
 * been exchanges and settlements to measure the rate.
 */
export function actualProfit(deals: Deal[], inrPerSar: number | undefined, defaultFee: number) {
  if (!inrPerSar) return undefined
  const inr = deals.reduce((s, d) => s + d.sarAmount * inrPerSar - d.inrPayout - (d.distributorId ? d.distributorFeeInr : defaultFee), 0)
  return { inr: round2(inr), sar: round2(inr / inrPerSar) }
}
