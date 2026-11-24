import type { AppData } from '@/data/store'
import { expenseTotals } from './expenses'
import { inrPerSar, round2 } from './pricing'
import { achievedRates } from './transfers'
import type { Currency } from './types'

export interface PnL {
  deals: number
  /** SAR billed to customers */
  sar: number
  /** that SAR in ₹ at the rate used */
  sales: number
  /** ₹ paid to recipients in India */
  costOfSales: number
  grossProfit: number
  deliveryCharges: number
  /** other expenses by category, ₹ */
  expenses: { category: string; inr: number }[]
  totalExpenses: number
  netProfit: number
}

/**
 * The ₹ per SAR a period's profit is measured at: what was actually achieved through Dubai in
 * that period, else over all time; before any exchanges, each deal's own quoted rate.
 */
export function pnlRate(d: AppData, from?: string, to?: string) {
  return achievedRates(d.transfers, from, to).inrPerSar ?? achievedRates(d.transfers).inrPerSar
}

/**
 * Profit and loss for deals dated in [from, to] and expenses paid in it.
 * Sales are the SAR billed, valued in ₹; cost of sales is the ₹ delivered to recipients.
 * Cancelled deals are left out. `rate` fixes the ₹ per SAR (so months add up to the period).
 */
export function profitAndLoss(d: AppData, toInr: (amount: number, c: Currency) => number, from?: string, to?: string, rate = pnlRate(d, from, to)): PnL {
  const deals = d.deals.filter((x) => x.status !== 'cancelled' && (!from || x.dealDate >= from) && (!to || x.dealDate <= to))
  let sar = 0, sales = 0, cost = 0, fees = 0
  for (const x of deals) {
    sar += x.sarAmount
    sales += x.sarAmount * (rate ?? inrPerSar(x.dubaiQuote, x.sarPerAed))
    cost += x.inrPayout
    fees += x.distributorId ? x.distributorFeeInr : 0
  }
  const ex = expenseTotals(d.expenses, toInr, from, to)
  const expenses = [...ex.byCategory].map(([category, inr]) => ({ category, inr })).sort((a, b) => b.inr - a.inr)
  const grossProfit = round2(sales - cost)
  return {
    deals: deals.length,
    sar: round2(sar),
    sales: round2(sales),
    costOfSales: round2(cost),
    grossProfit,
    deliveryCharges: round2(fees),
    expenses,
    totalExpenses: ex.inr,
    netProfit: round2(grossProfit - fees - ex.inr),
  }
}

/** yyyy-mm of every month with a deal or expense in [from, to], oldest first. */
export function monthsIn(d: AppData, from?: string, to?: string) {
  const inRange = (x: string) => (!from || x >= from) && (!to || x <= to)
  const s = new Set<string>()
  for (const x of d.deals) if (x.status !== 'cancelled' && inRange(x.dealDate)) s.add(x.dealDate.slice(0, 7))
  for (const e of d.expenses) if (!e.voided && inRange(e.date)) s.add(e.date.slice(0, 7))
  return [...s].sort()
}
