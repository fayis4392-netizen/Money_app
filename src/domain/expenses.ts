import { round2 } from './pricing'
import type { Currency, Expense } from './types'

/** Expenses (not voided) in a date range, totalled in ₹ with the given converter. */
export function expenseTotals(expenses: Expense[], toInr: (amount: number, c: Currency) => number, from?: string, to?: string) {
  const list = expenses.filter((e) => !e.voided && (!from || e.date >= from) && (!to || e.date <= to))
  const byCategory = new Map<string, number>()
  for (const e of list) byCategory.set(e.category, round2((byCategory.get(e.category) ?? 0) + toInr(e.amount, e.currency)))
  return { list, inr: round2(list.reduce((t, e) => t + toInr(e.amount, e.currency), 0)), byCategory }
}
