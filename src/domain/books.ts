import type { AppData } from '@/data/store'
import { balances, dealProfit } from './derive'
import { expenseTotals } from './expenses'
import { inrPerSar, round2 } from './pricing'
import { achievedRates, actualProfit } from './transfers'
import { OPENING_CURRENCY, type Currency } from './types'

/**
 * ₹ value of SAR and AED for the books check. Uses the rates actually achieved through
 * Dubai, so that when every entry is right the two profit methods agree; falls back to
 * today's rates before anything has been exchanged and settled.
 */
export function valuationRates(d: AppData, mode: 'achieved' | 'today' = 'achieved') {
  const a = achievedRates(d.transfers)
  const today = { sar: inrPerSar(d.settings.dubaiQuote, d.settings.sarPerAed), aed: 1000 / d.settings.dubaiQuote }
  if (mode === 'today') return { ...today, achieved: false }
  const achieved = !!(a.inrPerSar && a.quote)
  return { sar: a.inrPerSar ?? today.sar, aed: a.quote ? 1000 / a.quote : today.aed, achieved }
}

export const converter = (r: { sar: number; aed: number }) => (amount: number, c: Currency) => (c === 'INR' ? amount : c === 'SAR' ? amount * r.sar : amount * r.aed)

/**
 * Profit two ways.
 *
 * Books method (what you're owed − what you owe − capital):
 *   money owed to you or held for you  + operator's own cash
 *   − money you owe  − ₹ still to deliver for open deals (with fees)
 *   − capital put in  − opening balances brought from the old books
 *
 * Deal method: each deal's SAR at the ₹-per-SAR achieved, less payout and fee, less expenses.
 *
 * Valued at the achieved rates the two always agree, which proves every entry balances.
 * Valued at today's rates, the difference is the gain or loss on SAR/AED not yet exchanged.
 */
export function booksCheck(d: AppData, mode: 'achieved' | 'today' = 'achieved') {
  const rates = valuationRates(d, mode)
  const deal = valuationRates(d) // the deal method always uses the rates actually achieved
  const toInr = converter(rates)
  const fee = 0 // every deal carries its own delivery fee
  const bal = balances(d)

  let owedToYou = 0, youOwe = 0, operatorCash = 0
  for (const p of d.parties)
    for (const c of ['SAR', 'AED', 'INR'] as Currency[]) {
      const v = toInr(bal[p.id]?.[c] ?? 0, c)
      if (p.type === 'operator') operatorCash += v
      else if (v > 0) owedToYou += v
      else youOwe -= v
    }
  const open = d.deals.filter((x) => x.status !== 'cancelled' && x.status !== 'completed')
  const toDeliver = open.reduce((t, x) => t + x.inrPayout + (x.distributorId ? x.distributorFeeInr : fee), 0)
  const capital = d.capital.reduce((t, c) => t + (c.kind === 'add' ? 1 : c.kind === 'withdraw' ? -1 : 0) * toInr(c.amount, c.currency), 0)
  const openings = d.parties.reduce((t, p) => t + (p.opening ? toInr(p.opening.amount, OPENING_CURRENCY[p.type]) : 0), 0)
  const booksProfit = owedToYou + operatorCash - youOwe - toDeliver - capital - openings

  const live = d.deals.filter((x) => x.status !== 'cancelled')
  const dealsProfit = actualProfit(live, deal.achieved ? deal.sar : undefined, fee)?.inr ?? live.reduce((t, x) => t + dealProfit(x, fee).inr, 0)
  const expenses = expenseTotals(d.expenses, converter(deal)).inr
  const dealMethod = dealsProfit - expenses

  return {
    rates,
    owedToYou: round2(owedToYou),
    operatorCash: round2(operatorCash),
    youOwe: round2(youOwe),
    toDeliver: round2(toDeliver),
    openDeals: open.length,
    capital: round2(capital),
    openings: round2(openings),
    booksProfit: round2(booksProfit),
    dealsProfit: round2(dealsProfit),
    expenses: round2(expenses),
    dealMethod: round2(dealMethod),
    difference: round2(booksProfit - dealMethod),
  }
}
