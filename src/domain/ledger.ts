import { round3 } from './pricing'

/** One line on a party's ledger. amount: + debit (party owes / holds for operator), − credit. */
export interface LedgerLine {
  key: string
  date: string // ISO
  particulars: string
  amount: number
  qty?: number // ₹ in thousands, on sales
  rate?: number // SAR per ₹1,000, on sales
  opening?: boolean
  reversal?: boolean
}

export interface StatementRow extends LedgerLine {
  balance: number
  carriedForward?: boolean
}

export interface Statement {
  rows: StatementRow[]
  totals: { qty: number; debit: number; credit: number; balance: number }
}

/**
 * Statement for a date range, in the operator's book format:
 * everything before `from` is carried into one Opening row, then a running balance.
 * Totals include the opening row, as the books do.
 */
export function buildStatement(lines: LedgerLine[], from?: string, to?: string): Statement {
  const day = (l: LedgerLine) => l.date.slice(0, 10)
  const sorted = [...lines].sort((a, b) => a.date.localeCompare(b.date))
  let carried = 0
  const inRange: LedgerLine[] = []
  for (const l of sorted) {
    if (from && day(l) < from) carried = round3(carried + l.amount)
    else if (!to || day(l) <= to) inRange.push(l)
  }
  const rows: StatementRow[] = []
  let balance = carried
  if (from && Math.abs(carried) > 0.0005)
    rows.push({ key: 'carried', date: from + 'T00:00:00.000Z', particulars: 'Opening', amount: carried, balance, opening: true, carriedForward: true })
  for (const l of inRange) {
    balance = round3(balance + l.amount)
    rows.push({ ...l, balance })
  }
  return {
    rows,
    totals: {
      qty: round3(rows.reduce((s, r) => s + (r.qty ?? 0), 0)),
      debit: round3(rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0)),
      credit: round3(rows.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0)),
      balance,
    },
  }
}
