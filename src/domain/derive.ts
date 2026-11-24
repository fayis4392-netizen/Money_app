import type { AppData } from '@/data/store'
import { buildStatement, type LedgerLine } from './ledger'
import { round2, round3 } from './pricing'
import { achievedRates } from './transfers'

import { OPENING_CURRENCY, type Currency, type Deal } from './types'

export type RefKind = 'opening' | 'deal' | 'receipt' | 'transfer' | 'capital' | 'expense'

export interface PartyLine extends LedgerLine {
  partyId: string
  currency: Currency
  ref: { kind: RefKind; id: string; no: string }
  /** small line under the particulars, e.g. "D-0012 · Nisha J" */
  sub?: string
  /** particulars were reworded by a user */
  reworded?: boolean
  /** Dubai agent's AED lines: the ₹ it relates to (estimated at his rate when receiving AED) and the SAR it is worth */
  inr?: number
  inrEstimated?: boolean
  sarEq?: number
}

/**
 * Every ledger line, derived from deals, receipts and opening balances.
 * Balances are always computed from these lines, never typed in.
 */
export function deriveLines(d: AppData): PartyLine[] {
  const L: PartyLine[] = []
  const name = (id?: string) => d.parties.find((p) => p.id === id)?.name ?? '—'
  const add = (l: Omit<PartyLine, 'key'>) => {
    if (l.partyId && Math.abs(l.amount) > 0.0001) L.push({ ...l, amount: round3(l.amount), key: '' })
  }
  const st = d.settings

  for (const p of d.parties)
    if (p.opening)
      add({ partyId: p.id, currency: OPENING_CURRENCY[p.type], date: p.opening.date + 'T00:00:00.000Z', particulars: 'Opening', amount: p.opening.amount, opening: true, ref: { kind: 'opening', id: p.id, no: 'Opening' } })

  for (const r of d.receipts) {
    const ref = { kind: 'receipt' as const, id: r.id, no: r.receiptNo }
    // same-day entries keep the order they were typed in
    const at = r.date + r.createdAt.slice(10)
    add({ partyId: r.customerId, currency: 'SAR', date: at, particulars: r.narration || st.receiptNarration, amount: -r.amount, ref, sub: `${r.receiptNo} · received by ${name(r.collectorId)}` })
    add({ partyId: r.collectorId, currency: 'SAR', date: at, particulars: 'Cash received from ' + name(r.customerId), amount: r.amount, ref, sub: r.receiptNo })
    if (r.voided) {
      const why = `Voided ${r.receiptNo}: ${r.voided.reason}`
      add({ partyId: r.customerId, currency: 'SAR', date: r.voided.at, particulars: why, amount: r.amount, ref, reversal: true })
      add({ partyId: r.collectorId, currency: 'SAR', date: r.voided.at, particulars: why, amount: -r.amount, ref, reversal: true })
    }
  }

  for (const x of d.deals) {
    const ref = { kind: 'deal' as const, id: x.id, no: x.dealNo }
    const qty = round3(x.inrPayout / 1000)
    add({ partyId: x.customerId, currency: 'SAR', date: x.dealDate + x.createdAt.slice(10), particulars: st.saleNarration, amount: x.sarAmount, qty, rate: x.customerRate, ref, sub: `${x.dealNo} · ${x.recipientName}` })
    if (x.status === 'cancelled') {
      const at = x.history.at(-1)!.at
      add({ partyId: x.customerId, currency: 'SAR', date: at, particulars: 'Reversal: ' + (x.cancelReason ?? ''), amount: -x.sarAmount, qty: -qty, rate: x.customerRate, ref, sub: x.dealNo + ' cancelled', reversal: true })
    }
    if (x.status === 'completed' && x.distributorId) {
      // the distributor paid the recipient out of cash they hold for the operator
      const at = x.history.findLast((h) => h.status === 'completed')!.at
      add({ partyId: x.distributorId, currency: 'INR', date: at, particulars: 'Paid to recipient ' + x.recipientName, amount: -x.inrPayout, ref, sub: x.dealNo })
      add({ partyId: x.distributorId, currency: 'INR', date: at, particulars: 'Delivery charge', amount: -x.distributorFeeInr, ref, sub: x.dealNo })
    }
  }

  // for the ₹ / SAR shown beside the Dubai agent's AED lines
  const ach = achievedRates(d.transfers)
  const agentQuote = ach.quote ?? st.dubaiQuote
  const aedPerSar = ach.aedPerSar ?? 1 / st.sarPerAed
  for (const t of d.transfers) {
    const ref = { kind: 'transfer' as const, id: t.id, no: t.no }
    const at = t.date + t.createdAt.slice(10)
    const sub = t.no + (t.note ? ' · ' + t.note : '')
    const lines = (sign: number, date: string, why?: string) => {
      const rev = sign < 0
      const x = (l: Omit<PartyLine, 'key' | 'ref' | 'date'>) => add({ ...l, particulars: why ?? l.particulars, ref, date, sub, reversal: rev, qty: rev ? undefined : l.qty, rate: rev ? undefined : l.rate })
      if (t.kind === 'send') {
        x({ partyId: t.fromId, currency: 'SAR', particulars: 'Sent to ' + name(t.toId), amount: -sign * t.sar! })
        x({ partyId: t.toId!, currency: 'SAR', particulars: 'Received from ' + name(t.fromId), amount: sign * t.sar! })
      }
      if (t.kind === 'exchange') {
        x({ partyId: t.fromId, currency: 'SAR', particulars: `Exchanged to AED @ ${t.rate} SAR per AED`, amount: -sign * t.sar! })
        x({ partyId: t.fromId, currency: 'AED', particulars: `From SAR ${t.sar} @ ${t.rate} SAR per AED`, amount: sign * t.aed! })
      }
      // the Dubai agent's account is kept in AED; ₹ and SAR are shown beside each line
      if (t.kind === 'settle') {
        x({ partyId: t.fromId, currency: 'AED', particulars: 'Handed to ' + name(t.toId), amount: -sign * t.aed! })
        x({ partyId: t.toId!, currency: 'AED', particulars: 'Received from ' + name(t.fromId), amount: sign * t.aed!, inr: rev ? undefined : round2((t.aed! * 1000) / agentQuote), inrEstimated: true, sarEq: rev ? undefined : round3(t.aed! / aedPerSar) })
      }
      if (t.kind === 'payout') {
        x({ partyId: t.fromId, currency: 'AED', particulars: `Paid ${name(t.toId)} @ ${t.rate} per ₹1,000`, amount: -sign * t.aed!, inr: rev ? undefined : t.inr, sarEq: rev ? undefined : round3(t.aed! / aedPerSar) })
        x({ partyId: t.toId!, currency: 'INR', particulars: 'Received from ' + name(t.fromId), amount: sign * t.inr! })
      }
    }
    lines(1, at)
    if (t.voided) lines(-1, t.voided.at, `Voided ${t.no}: ${t.voided.reason}`)
  }

  for (const e of d.expenses) {
    const ref = { kind: 'expense' as const, id: e.id, no: e.no }
    const at = e.date + e.createdAt.slice(10)
    const what = `Expense: ${e.category}${e.note ? ' · ' + e.note : ''}`
    // spent out of the operator's money the payer holds (or owed back to them if they used their own)
    add({ partyId: e.paidById, currency: e.currency, date: at, particulars: what, amount: -e.amount, ref, sub: e.no })
    if (e.voided) add({ partyId: e.paidById, currency: e.currency, date: e.voided.at, particulars: `Voided ${e.no}: ${e.voided.reason}`, amount: e.amount, ref, sub: e.no, reversal: true })
  }

  for (const c of d.capital) {
    const ref = { kind: 'capital' as const, id: c.id, no: c.entryNo }
    const at = c.date + 'T08:00:00.000Z'
    const note = c.note ? ' · ' + c.note : ''
    if (c.kind === 'add') add({ partyId: c.partyId, currency: c.currency, date: at, particulars: 'Capital added' + note, amount: c.amount, ref, sub: c.entryNo })
    if (c.kind === 'withdraw') add({ partyId: c.partyId, currency: c.currency, date: at, particulars: 'Capital withdrawn' + note, amount: -c.amount, ref, sub: c.entryNo })
    if (c.kind === 'transfer') {
      add({ partyId: c.partyId, currency: c.currency, date: at, particulars: 'Moved to ' + name(c.toPartyId!) + note, amount: -c.amount, ref, sub: c.entryNo })
      add({ partyId: c.toPartyId!, currency: c.currency, date: at, particulars: 'Funds from ' + name(c.partyId) + note, amount: c.amount, ref, sub: c.entryNo })
    }
  }

  L.sort((a, b) => a.date.localeCompare(b.date))
  // stable key per line, so its particulars can be reworded
  const seen: Record<string, number> = {}
  for (const l of L) {
    const k = `${l.ref.kind}:${l.ref.id}:${l.partyId}:${l.currency}`
    seen[k] = (seen[k] ?? 0) + 1
    l.key = `${k}:${seen[k]}`
    const n = d.narrations[l.key]
    if (n) {
      l.particulars = n.text
      l.reworded = true
    }
  }
  return L
}

export function partyStatement(d: AppData, partyId: string, currency: Currency, from?: string, to?: string) {
  const lines = deriveLines(d).filter((l) => l.partyId === partyId && l.currency === currency)
  return buildStatement(lines, from, to) as { rows: (PartyLine & { balance: number; carriedForward?: boolean })[]; totals: ReturnType<typeof buildStatement>['totals'] }
}

export type Balances = Record<string, Record<Currency, number>>

export function balances(d: AppData): Balances {
  const m: Balances = {}
  for (const l of deriveLines(d)) {
    m[l.partyId] ??= { SAR: 0, AED: 0, INR: 0 }
    m[l.partyId][l.currency] = round3(m[l.partyId][l.currency] + l.amount)
  }
  return m
}

/** A deal's estimated profit, at the rates frozen on it. */
export function dealProfit(x: Deal, defaultFee: number) {
  const fee = x.distributorId ? x.distributorFeeInr : defaultFee
  const k = x.inrPayout / 1000
  const sar = round2(x.sarAmount - k * x.dubaiQuote * x.sarPerAed - ((fee * x.dubaiQuote) / 1000) * x.sarPerAed)
  return { sar, inr: round2((sar * 1000) / (x.sarPerAed * x.dubaiQuote)) }
}

export const dealProfitSar = (x: Deal, defaultFee: number) => dealProfit(x, defaultFee).sar

/** Only a deal not yet out for delivery can be corrected or cancelled. */
export const canCorrect = (x: Deal) => x.status === 'pending_allocation' || x.status === 'assigned'


