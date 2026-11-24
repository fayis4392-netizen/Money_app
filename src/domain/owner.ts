import type { AppData } from '@/data/store'
import { converter, valuationRates } from './books'
import { buildStatement, type LedgerLine } from './ledger'
import { profitAndLoss, monthsIn } from './pnl'
import { round2 } from './pricing'
import { achievedRates } from './transfers'
import { OPENING_CURRENCY } from './types'

const MONTH = (ym: string) => new Date(ym + '-15').toLocaleString('en-GB', { month: 'long', year: 'numeric' })

/**
 * The owner's account, in ₹: what the business owes the owner.
 *   + balances brought from the old books  + capital put in  + profit earned each month
 *   − capital taken back  − profit taken
 * Profit not taken stays in the business and keeps working (circulating); taking all of it
 * brings "profit left" to zero, while the capital stays until it too is withdrawn.
 * Valued at the rates achieved through Dubai, so the balance equals what the books say the
 * business is worth (the books check).
 */
export function ownerAccount(d: AppData, today: string) {
  const toInr = converter(valuationRates(d))
  const rate = achievedRates(d.transfers).inrPerSar
  const lines: (LedgerLine & { sub?: string })[] = []
  // ledger sign: Cr (negative) = the business owes the owner more
  const owed = (date: string, particulars: string, inr: number, key: string, sub?: string) => lines.push({ key, date, particulars, amount: round2(-inr), sub })

  const openings = d.parties.filter((p) => p.opening)
  if (openings.length) {
    const date = openings.map((p) => p.opening!.date).sort()[0]
    owed(date + 'T00:00:00.000Z', 'Brought forward from the old books', openings.reduce((t, p) => t + toInr(p.opening!.amount, OPENING_CURRENCY[p.type]), 0), 'openings', `${openings.length} opening balances`)
  }
  let capitalIn = 0, capitalOut = 0, taken = 0
  for (const c of d.capital) {
    const v = toInr(c.amount, c.currency)
    const at = c.date + 'T08:00:00.000Z', note = c.note ? ' · ' + c.note : ''
    const what = `${c.entryNo} · ${c.currency} ${c.amount.toLocaleString('en-IN')}`
    if (c.kind === 'add') { capitalIn += v; owed(at, 'Capital put in' + note, v, c.id, what) }
    if (c.kind === 'withdraw') { capitalOut += v; owed(at, 'Capital taken back' + note, -v, c.id, what) }
    if (c.kind === 'drawings') { taken += v; owed(at, 'Profit taken' + note, -v, c.id, what) }
  }
  let profit = 0
  for (const ym of monthsIn(d)) {
    const p = profitAndLoss(d, toInr, ym + '-01', ym + '-31', rate)
    profit += p.netProfit
    const end = ym + '-31' < today ? lastDay(ym) : today
    owed(end + 'T23:59:00.000Z', `${p.netProfit >= 0 ? 'Profit' : 'Loss'} for ${MONTH(ym)}${end === today ? ' (so far)' : ''}`, p.netProfit, 'pnl:' + ym, `${p.deals} deals · after delivery charges and expenses`)
  }
  const s = buildStatement(lines)
  return {
    statement: s,
    openings: round2(-(lines.find((l) => l.key === 'openings')?.amount ?? 0)),
    capitalIn: round2(capitalIn),
    capitalOut: round2(capitalOut),
    profit: round2(profit),
    taken: round2(taken),
    /** profit earned and not yet taken */
    profitLeft: round2(profit - taken),
    /** everything the business owes the owner (Cr balance shown as a positive number) */
    balance: round2(-s.totals.balance),
  }
}

function lastDay(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
