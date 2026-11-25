import type { AppData } from '@/data/store'
import { balances } from './derive'
import { inrPerSar } from './pricing'
import { achievedRates } from './transfers'
import { DISTRIBUTOR_CHARGE, type Currency, type Deal, type PartyType } from './types'

export type Span = '30d' | '90d' | '12m' | 'all'
export const SPAN_LABEL: Record<Span, string> = { '30d': 'Last 30 days', '90d': 'Last 3 months', '12m': 'Last 12 months', all: 'All time' }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return iso(d)
}
const monday = (s: string) => {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}

/** The span's dates, and the same length just before it (for "vs previous"). */
export function spanRange(span: Span, today: string, firstDate?: string) {
  const days = span === '30d' ? 30 : span === '90d' ? 91 : span === '12m' ? 365 : 0
  if (!days) return { from: firstDate ?? today, to: today, prevFrom: undefined, prevTo: undefined }
  const from = addDays(today, -(days - 1))
  return { from, to: today, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) }
}

/** Bucket key for a date: days for a month, weeks for a quarter, months beyond. */
export const bucketOf = (span: Span) => (date: string) => (span === '30d' ? date : span === '90d' ? monday(date) : date.slice(0, 7))

/** Every bucket key from `from` to `to`, so empty days/weeks/months still show. */
export function bucketKeys(span: Span, from: string, to: string) {
  const keys: string[] = []
  if (span === '30d') for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d)
  else if (span === '90d') for (let d = monday(from); d <= to; d = addDays(d, 7)) keys.push(d)
  else {
    let [y, m] = from.slice(0, 7).split('-').map(Number)
    const end = to.slice(0, 7)
    for (let k = from.slice(0, 7); k <= end; ) {
      keys.push(k)
      m++
      if (m > 12) { m = 1; y++ }
      k = `${y}-${String(m).padStart(2, '0')}`
    }
  }
  return keys
}

/** ₹ profit of one deal after its delivery charge, at `rate` ₹ per SAR (or the deal's own quote). */
const dealNet = (x: Deal, rate?: number) => x.sarAmount * (rate ?? inrPerSar(x.dubaiQuote, x.sarPerAed)) - x.inrPayout - (x.distributorId ? x.distributorFeeInr : 0)

export interface Totals { deals: number; volume: number; sar: number; profit: number }
function totals(deals: Deal[], rate?: number): Totals {
  return deals.reduce((t, x) => ({ deals: t.deals + 1, volume: t.volume + x.inrPayout, sar: t.sar + x.sarAmount, profit: t.profit + dealNet(x, rate) }), { deals: 0, volume: 0, sar: 0, profit: 0 })
}

const live = (d: AppData, from?: string, to?: string) => d.deals.filter((x) => x.status !== 'cancelled' && (!from || x.dealDate >= from) && (!to || x.dealDate <= to))

/** Everything the dashboard shows for one span. */
export function insights(d: AppData, span: Span, today: string, toInr: (n: number, c: Currency) => number) {
  const first = [...d.deals].map((x) => x.dealDate).sort()[0]
  const r = spanRange(span, today, first)
  const rate = achievedRates(d.transfers).inrPerSar
  const now = live(d, r.from, r.to)
  const prev = r.prevFrom ? live(d, r.prevFrom, r.prevTo) : []

  const key = bucketOf(span)
  const byBucket = new Map(bucketKeys(span, r.from, r.to).map((k) => [k, { key: k, volume: 0, deals: 0, profit: 0 }]))
  for (const x of now) {
    const b = byBucket.get(key(x.dealDate))
    if (!b) continue
    b.volume += x.inrPayout
    b.deals++
    b.profit += dealNet(x, rate)
  }
  // the distributors' daily charge is entered as one expense a day: take it off that day's profit
  const charges = (from?: string, to?: string) => d.expenses.filter((e) => !e.voided && e.category === DISTRIBUTOR_CHARGE && (!from || e.date >= from) && (!to || e.date <= to))
  for (const e of charges(r.from, r.to)) {
    const b = byBucket.get(key(e.date))
    if (b) b.profit -= toInr(e.amount, e.currency)
  }
  const less = (t: Totals, from?: string, to?: string) => ({ ...t, profit: t.profit - charges(from, to).reduce((s, e) => s + toInr(e.amount, e.currency), 0) })

  const name = (id?: string) => d.parties.find((p) => p.id === id)?.name ?? '—'
  const per = <K extends string | undefined>(pick: (x: Deal) => K) => {
    const m = new Map<string, { id: string; name: string; volume: number; profit: number; deals: number }>()
    for (const x of now) {
      const id = pick(x) ?? ''
      const e = m.get(id) ?? { id, name: name(id), volume: 0, profit: 0, deals: 0 }
      e.volume += x.inrPayout
      e.profit += dealNet(x, rate)
      e.deals++
      m.set(id, e)
    }
    return [...m.values()]
  }

  // where the money is right now, in ₹ at today's rates (Dr = holds or owes you)
  const bal = balances(d)
  const sumType = (t: PartyType) =>
    d.parties.filter((p) => p.type === t).reduce((s, p) => s + (['SAR', 'AED', 'INR'] as Currency[]).reduce((a, c) => a + toInr(bal[p.id]?.[c] ?? 0, c), 0), 0)
  const money = [
    { label: 'Customers owe you', inr: sumType('saudi_customer') },
    { label: 'With Saudi collectors', inr: sumType('saudi_collector') },
    { label: 'With Dubai collectors', inr: sumType('dubai_collector') },
    { label: 'With the Dubai agent', inr: sumType('dubai_agent') },
    { label: 'With distributors', inr: sumType('distributor') },
  ]

  const open = d.deals.filter((x) => x.status === 'assigned' || x.status === 'out_for_delivery' || x.status === 'pending_allocation')
  const pendingByDist = new Map<string, { name: string; inr: number; deals: number }>()
  for (const x of open) {
    const e = pendingByDist.get(x.distributorId ?? '') ?? { name: name(x.distributorId), inr: 0, deals: 0 }
    e.inr += x.inrPayout
    e.deals++
    pendingByDist.set(x.distributorId ?? '', e)
  }

  return {
    range: r,
    rate,
    now: less(totals(now, rate), r.from, r.to),
    prev: r.prevFrom ? less(totals(prev, rate), r.prevFrom, r.prevTo) : undefined,
    buckets: [...byBucket.values()],
    customers: per((x) => x.customerId).sort((a, b) => b.profit - a.profit),
    status: {
      assigned: d.deals.filter((x) => x.status === 'assigned' || x.status === 'pending_allocation').length,
      out: d.deals.filter((x) => x.status === 'out_for_delivery').length,
      paid: now.filter((x) => x.status === 'completed').length,
    },
    pending: [...pendingByDist.values()].sort((a, b) => b.inr - a.inr),
    money,
    quotes: d.settings.rateLog.filter((x) => x.at.slice(0, 10) >= r.from).map((x) => ({ at: x.at, quote: x.dubaiQuote })),
  }
}
