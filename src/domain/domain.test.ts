import { describe, expect, it } from 'vitest'
import { buildStatement, type LedgerLine } from './ledger'
import { deliveryFee, priceDeal, slabFor, suggestCustomerRate } from './pricing'
import { DEFAULT_SETTINGS } from './types'

const slabs = DEFAULT_SETTINGS.slabs

describe('premium pricing per ₹1,000', () => {
  it('₹1 lakh at Dubai 39.52 AED + 2.00 premium', () => {
    const d = priceDeal(100_000, 39.52, 41.52, 1.02145, 50)
    expect(d.sar).toBe(4152)
    expect(d.aedCost).toBe(3952)
    expect(d.sarCost).toBe(4036.77)
    expect(d.feeSar).toBe(2.02)
    expect(d.profitSar).toBe(113.21)
    expect(d.profitPerThousand).toBe(1.1523)
  })
  it("client's example: 34 AED quoted, 36 SAR charged → about 1.27 SAR per ₹1,000", () => {
    expect(priceDeal(1000, 34, 36, 1.02145, 0).profitSar).toBe(1.27)
  })
  it('keeps 3 decimals on the SAR debit, like the books', () => {
    expect(priceDeal(15_500, 36.39, 38.39, 1.02145, 0).sar).toBe(595.045)
  })
  it('picks the premium slab by deal size', () => {
    expect(slabFor(499_999, slabs)!.premium).toBe(2)
    expect(slabFor(500_000, slabs)!.premium).toBe(1.8)
    expect(suggestCustomerRate(2_500_000, 36.5, slabs)).toBe(38)
  })
})

describe('statement', () => {
  // Rayees' real account (opening, receipts and sales) from the operator's books
  const L = (date: string, amount: number, extra: Partial<LedgerLine> = {}): LedgerLine => ({ key: date + amount, date: date + 'T09:00:00Z', particulars: '', amount, ...extra })
  const sale = (date: string, k: number, r: number) => L(date, Math.round(k * r * 1000) / 1000, { qty: k, rate: r })
  const lines: LedgerLine[] = [
    L('2026-10-30', 14595.395, { opening: true }),
    L('2026-10-31', -7500), L('2026-11-02', -3500),
    ...[25, 32, 22, 55, 44, 55, 7, 67, 15.5, 10, 25, 38, 25, 15].map((k) => sale('2026-11-03', k, 38.39)),
    L('2026-11-04', -8000), L('2026-11-05', -3000), L('2026-11-07', -3000),
    ...[21, 75, 5].map((k) => sale('2026-11-11', k, 38.6)),
  ]
  it('matches the totals in the books', () => {
    const s = buildStatement(lines)
    expect(s.totals).toEqual({ qty: 536.5, credit: 25000, debit: 35212.84, balance: 10212.84 })
    expect(s.rows[3].balance).toBe(4555.145)
  })
  it('carries everything before the start date into an Opening row', () => {
    const s = buildStatement(lines, '2026-11-04')
    expect(s.rows[0]).toMatchObject({ particulars: 'Opening', amount: 20314.24, carriedForward: true })
    expect(s.totals.balance).toBe(10212.84)
  })
})

describe('delivery fee per lakh', () => {
  it('₹300 per ₹1,00,000 scales with the amount', () => {
    expect(deliveryFee(100_000, 300)).toBe(300)
    expect(deliveryFee(25_000, 300)).toBe(75)
    expect(deliveryFee(15_500, 300)).toBe(46.5)
    expect(deliveryFee(2_500_000, 250)).toBe(6250)
  })
})

describe('profit and loss', () => {
  it('sales − paid out = gross; − delivery − expenses = net; months add up to the period', async () => {
    const { loadSample } = await import('@/data/sample')
    const { getState } = await import('@/data/store')
    const { profitAndLoss, pnlRate, monthsIn } = await import('./pnl')
    const { actualProfit } = await import('./transfers')
    loadSample()
    const d = getState()
    const toInr = (n: number, c: string) => (c === 'INR' ? n : c === 'SAR' ? n * 26.9 : n * 27.5)
    const rate = pnlRate(d)!
    const p = profitAndLoss(d, toInr, undefined, undefined, rate)
    expect(p.grossProfit).toBeCloseTo(p.sales - p.costOfSales, 2)
    expect(p.netProfit).toBeCloseTo(p.grossProfit - p.deliveryCharges - p.totalExpenses, 2)
    // same profit on deals as Reports (achieved rate)
    const live = d.deals.filter((x) => x.status !== 'cancelled')
    // delivery charges = the distributors' daily charge entries (+ any older per-deal charges)
    const daily = d.expenses.filter((e) => !e.voided && e.category === 'Distributor charge').reduce((t, e) => t + e.amount, 0)
    expect(daily).toBeGreaterThan(0)
    expect(p.grossProfit - p.deliveryCharges + daily).toBeCloseTo(actualProfit(live, rate, 0)!.inr, 0)
    expect(p.expenses.some((e) => e.category === 'Distributor charge')).toBe(false)
    const months = monthsIn(d).map((ym) => profitAndLoss(d, toInr, ym + '-01', ym + '-31', rate))
    expect(months.reduce((t, m) => t + m.netProfit, 0)).toBeCloseTo(p.netProfit, 1)
  })
})
