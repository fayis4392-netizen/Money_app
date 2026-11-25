import { beforeEach, describe, expect, it } from 'vitest'
import { addExpense, addReceipt, addTransfer, editExpense, voidExpense, cancelDeal, editTransfer, voidTransfer, editReceipt, reverseAndReenter, setNarration, voidReceipt, voidPlan, saveParty, setRates, setConfirmer, undoDealStep, capitalEntry, UserError } from './actions'
import { clearAll, loadSample } from './sample'
import { getState } from './store'
import { booksCheck } from '@/domain/books'
import { balances, partyStatement } from '@/domain/derive'
import { achievedRates, actualProfit } from '@/domain/transfers'
import { expenseTotals } from '@/domain/expenses'
import { DISTRIBUTOR_CHARGE } from '@/domain/types'

const rayees = () => getState().parties.find((p) => p.name === 'Rayees')!

describe('sample books', () => {
  beforeEach(() => loadSample())

  it("Rayees' ledger matches his account in the operator's books", () => {
    const s = partyStatement(getState(), rayees().id, 'SAR')
    expect(s.totals).toEqual({ qty: 536.5, credit: 25000, debit: 35212.84, balance: 10212.84 })
    expect(s.rows.map((r) => r.balance).slice(0, 5)).toEqual([14595.395, 7095.395, 3595.395, 4555.145, 5783.625])
    expect(s.rows[3]).toMatchObject({ particulars: 'By SALES A/C BANK ADD PASS', qty: 25, rate: 38.39, amount: 959.75 })
  })

  it('the collector holds the cash the customers paid', () => {
    const faisal = getState().parties.find((p) => p.type === 'saudi_collector')!
    expect(balances(getState())[faisal.id].SAR).toBeGreaterThan(0)
  })

  it('editing cash received needs a reason and is logged', () => {
    const r = getState().receipts.find((x) => x.customerId === rayees().id)!
    expect(() => editReceipt(r.id, { ...r, amount: 7600 }, '')).toThrow(UserError)
    editReceipt(r.id, { ...r, amount: 7600 }, 'typo')
    expect(getState().receipts.find((x) => x.id === r.id)!.edits[0].changes[0]).toBe('amount 7,500.000 → 7,600.000')
    expect(partyStatement(getState(), rayees().id, 'SAR').totals.balance).toBe(10112.84)
  })

  it('voiding keeps the entry and adds a reversing line', () => {
    const before = partyStatement(getState(), rayees().id, 'SAR').rows.length
    const r = addReceipt({ customerId: rayees().id, collectorId: getState().parties.find((p) => p.type === 'saudi_collector')!.id, date: '2026-11-20', amount: 1000 })
    voidReceipt(r.id, 'duplicate')
    const s = partyStatement(getState(), rayees().id, 'SAR')
    expect(s.rows.length).toBe(before + 2)
    expect(s.totals.balance).toBe(10212.84)
  })

  it('rewording changes the particulars only', () => {
    const row = partyStatement(getState(), rayees().id, 'SAR').rows[3]
    setNarration(row.key, 'By SALES A/C')
    const after = partyStatement(getState(), rayees().id, 'SAR')
    expect(after.rows[3]).toMatchObject({ particulars: 'By SALES A/C', amount: 959.75, reworded: true })
    expect(after.totals.balance).toBe(10212.84)
  })

  it('correcting a deal reverses the original and books the new one', () => {
    const d = getState().deals.find((x) => x.status === 'completed')!
    const fixed = reverseAndReenter(d.id, { ...d, inrK: 20, customerRate: d.customerRate, fee: d.distributorFeeInr })
    expect(getState().deals.find((x) => x.id === d.id)!.status).toBe('cancelled')
    expect(fixed.replacesDealId).toBe(d.id)
    const cust = d.customerId
    expect(fixed.sarAmount).toBe(Math.round(20 * d.customerRate * 1000) / 1000)
    expect(getState().deals.filter((x) => x.customerId === cust && x.status !== 'cancelled').some((x) => x.id === fixed.id)).toBe(true)
  })

  it('a new deal is paid at once; cancelling it later reverses both the customer and the distributor', () => {
    const d = getState().deals.find((x) => x.status === 'completed')!
    const s0 = getState()
    const cust0 = balances(s0)[d.customerId].SAR, dist0 = balances(s0)[d.distributorId!].INR
    expect(() => cancelDeal(d.id, '')).toThrow(UserError)
    cancelDeal(d.id, 'recipient not reachable')
    const s1 = getState()
    expect(balances(s1)[d.customerId].SAR).toBeCloseTo(cust0 - d.sarAmount, 3)
    expect(balances(s1)[d.distributorId!].INR).toBeCloseTo(dist0 + d.inrPayout + d.distributorFeeInr, 2)
    const lines = partyStatement(s1, d.distributorId!, 'INR').rows.filter((r) => r.ref.id === d.id)
    expect(lines.some((r) => r.reversal && /recipient not reachable/.test(r.particulars))).toBe(true)
    expect(() => cancelDeal(d.id, 'again')).toThrow(/already cancelled/)
  })

  it('transfers move money between holders and the chain balances', () => {
    const s = getState(), bal = balances(s)
    const who = (n: string) => s.parties.find((p) => p.name.startsWith(n))!.id
    expect(bal[who('Faisal')].SAR).toBe(45000 - 18000 - 20000 - 50 - 40)
    expect(bal[who('Ashraf')].SAR).toBe(38000 - 10000 - 8000 - 15000)
    expect(bal[who('Ashraf')].AED).toBe(Math.round((9790.005 + 7828 + 14688 - 9790 - 7828 - 10000 - 25) * 1000) / 1000)
    // the agent keeps your AED; each ₹ payout comes off it at his rate
    const aedCost = Math.round(((436806.5 / 1000) * 36.4) * 1000) / 1000 + Math.round(((300000 / 1000) * 36.45) * 1000) / 1000
    expect(bal[who('Rashid')].AED).toBeCloseTo(9790 + 7828 + 10000 - aedCost, 2)
    expect(bal[who('Rashid')].INR).toBe(0)
  })

  it('the AED received on an exchange can be typed over (e.g. rounded)', () => {
    const ashraf = getState().parties.find((p) => p.name.startsWith('Ashraf'))!.id
    const before = balances(getState())[ashraf]
    const t = addTransfer({ kind: 'exchange', date: '2026-11-20', fromId: ashraf, amount: 90, rate: 1.02145, result: 88 })
    expect(t.aed).toBe(88)
    expect(balances(getState())[ashraf].AED).toBe(Math.round((before.AED + 88) * 1000) / 1000)
    const auto = addTransfer({ kind: 'exchange', date: '2026-11-20', fromId: ashraf, amount: 90, rate: 1.02145, result: '' })
    expect(auto.aed).toBe(88.11)
  })

  it('a collector cannot pass on more than they hold', () => {
    const s = getState(), who = (n: string) => s.parties.find((p) => p.name.startsWith(n))!.id
    expect(() => addTransfer({ kind: 'send', date: '2026-11-20', fromId: who('Faisal'), toId: who('Ashraf'), amount: 999999 })).toThrow(/holds only SAR/)
    expect(() => addTransfer({ kind: 'settle', date: '2026-11-20', fromId: who('Ashraf'), toId: who('Rashid'), amount: 999999 })).toThrow(/holds only AED/)
  })

  it('editing a transfer needs a reason; voiding reverses it', () => {
    const t = getState().transfers.find((x) => x.kind === 'send')!
    expect(() => editTransfer(t.id, { ...t, amount: 17000 }, '')).toThrow(UserError)
    editTransfer(t.id, { ...t, amount: 17000 }, 'counted again')
    expect(getState().transfers.find((x) => x.id === t.id)!.edits[0].changes).toContain('SAR 18000 → 17000')
    const faisal = t.fromId
    const before = balances(getState())[faisal].SAR
    // the Dubai collector already exchanged and settled that SAR: a plain void is refused…
    expect(() => voidTransfer(t.id, 'wrong day')).toThrow(/already passed on/)
    // …and rolling back voids the later entries with it, all at once
    const deps = voidPlan({ kind: 'transfer', id: t.id })
    expect(deps.length).toBeGreaterThan(0)
    voidTransfer(t.id, 'wrong day', true)
    expect(balances(getState())[faisal].SAR).toBe(before + 17000)
    for (const d of deps) expect(getState().transfers.find((x) => x.id === d.id)!.voided?.reason).toMatch(/rolled back with T-/)
    const b = balances(getState())
    for (const p of getState().parties.filter((x) => x.type === 'saudi_collector' || x.type === 'dubai_collector'))
      for (const c of ['SAR', 'AED'] as const) expect(b[p.id]?.[c] ?? 0).toBeGreaterThanOrEqual(-0.0005)
  })

  it('edits and voids never leave a collector holding less than nothing', () => {
    const send = getState().transfers.find((x) => x.kind === 'send' && !x.voided)!
    expect(() => editTransfer(send.id, { ...send, amount: send.sar! * 10 }, 'typo')).toThrow(/doesn't hold that much/)
    const r = getState().receipts.find((x) => x.collectorId === send.fromId)!
    const all = getState().receipts.filter((x) => x.collectorId === send.fromId)
    // voiding all the cash he received, after he sent it on, cannot leave him negative
    expect(() => { for (const x of all) voidReceipt(x.id, 'test') }).toThrow(/already passed on/)
    expect(r).toBeTruthy()
  })

  it('catches typos in rates, dates, collectors and names', () => {
    const P = (t: string) => getState().parties.filter((p) => p.type === t)
    const dc = getState().transfers.find((t) => t.kind === 'exchange')!.fromId
    const sc = getState().transfers.find((t) => t.kind === 'send')!.fromId
    const cust = P('saudi_customer')[0]
    expect(() => addTransfer({ kind: 'exchange', date: '2026-11-20', fromId: dc, amount: 100, rate: 0.979 })).toThrow(/looks wrong/)
    expect(() => addTransfer({ kind: 'exchange', date: '2026-11-20', fromId: dc, amount: 100, rate: 1.02145, result: 120 })).toThrow(/far from what the rate gives/)
    expect(() => addTransfer({ kind: 'payout', date: '2026-11-20', fromId: P('dubai_agent')[0].id, toId: P('distributor')[0].id, amount: 1000, rate: 3.64 })).toThrow(/far from today's Dubai quote/)
    expect(() => addReceipt({ customerId: cust.id, collectorId: P('dubai_agent')[0].id, amount: 100, date: '2026-11-20' })).toThrow(/Saudi collector/)
    expect(() => addReceipt({ customerId: cust.id, collectorId: sc, amount: 100, date: '2036-11-20' })).toThrow(/future/)
    expect(() => saveParty({ type: 'saudi_customer', name: ' ' + cust.name.toUpperCase() })).toThrow(/already/)
    expect(() => setRates({ dubaiQuote: 3.64, sarPerAed: 1.02 })).toThrow(/typo/)
    expect(addReceipt({ customerId: cust.id, collectorId: sc, amount: 100, date: '2026-11-20' }).receiptNo).toMatch(/^R-/)
  })

  it('profit at achieved rates uses the ₹ per SAR actually got through Dubai', () => {
    const r = achievedRates(getState().transfers)
    expect(r.inrPerSar).toBeGreaterThan(26.5)
    const p = actualProfit(getState().deals.filter((d) => d.status !== 'cancelled'), r.inrPerSar, 50)!
    expect(p.sar).toBeGreaterThan(0)
  })

  it('money is never created or lost', () => {
    const s = getState(), bal = balances(s)
    const sum = (c: 'SAR' | 'AED' | 'INR') => Math.round(Object.values(bal).reduce((t, b) => t + b[c], 0) * 100) / 100
    const T = s.transfers.filter((x) => !x.voided)
    const r2 = (n: number) => Math.round(n * 100) / 100
    // ₹ enters the books when the agent pays distributors; the AED it cost leaves at the same moment
    const settled = r2(T.filter((x) => x.kind === 'payout').reduce((t, x) => t + x.inr!, 0))
    const paidOut = r2(s.deals.filter((d) => d.status === 'completed').reduce((t, d) => t + d.inrPayout + d.distributorFeeInr, 0))
    const spent = (c: string) => s.expenses.filter((e) => !e.voided && e.currency === c).reduce((t, e) => t + e.amount, 0)
    expect(sum('INR')).toBe(r2(2_500_000 + settled - paidOut - spent('INR')))
    const aedIn = T.filter((x) => x.kind === 'exchange').reduce((t, x) => t + x.aed!, 0), aedOut = T.filter((x) => x.kind === 'payout').reduce((t, x) => t + x.aed!, 0)
    expect(sum('AED')).toBe(r2(aedIn - aedOut - spent('AED')))
  })

  it('an expense comes out of what the payer holds, and voiding puts it back', () => {
    const faisal = getState().parties.find((p) => p.name.startsWith('Faisal'))!.id
    const before = balances(getState())[faisal].SAR
    const e = addExpense({ date: '2026-11-20', paidById: faisal, currency: 'SAR', amount: 30, category: 'Transport', note: 'taxi' })
    expect(balances(getState())[faisal].SAR).toBe(before - 30)
    expect(() => editExpense(e.id, { ...e, amount: 35 }, '')).toThrow(UserError)
    editExpense(e.id, { ...e, amount: 35 }, 'receipt said 35')
    expect(balances(getState())[faisal].SAR).toBe(before - 35)
    voidExpense(e.id, 'duplicate')
    expect(balances(getState())[faisal].SAR).toBe(before)
    expect(() => addExpense({ date: '2026-11-20', paidById: getState().parties.find((p) => p.type === 'saudi_customer')!.id, currency: 'SAR', amount: 5, category: 'Other' })).toThrow(/Choose who paid/)
  })

  it('expenses add up in ₹ by category', () => {
    const t = expenseTotals(getState().expenses, (a, c) => (c === 'INR' ? a : c === 'SAR' ? a * 26.9 : a * 27.4))
    expect(t.byCategory.get('Transport')).toBe(Math.round(90 * 26.9 * 100) / 100)
    const daily = getState().expenses.filter((e) => e.category === DISTRIBUTOR_CHARGE).reduce((a, e) => a + e.amount, 0)
    expect(daily).toBeGreaterThan(0)
    expect(t.inr).toBeCloseTo(90 * 26.9 + 25 * 27.4 + 1500 + daily, 1)
  })

  it('books check: owed − owe − capital − openings agrees with the deal method', () => {
    const b = booksCheck(getState())
    expect(b.rates.achieved).toBe(true)
    expect(Math.abs(b.difference)).toBeLessThan(1)
    expect(b.booksProfit).toBeGreaterThan(0)
  })

  it("books check at today's rates shows the gain or loss on SAR/AED not yet exchanged", () => {
    const achieved = booksCheck(getState())
    const today = booksCheck(getState(), 'today')
    expect(today.rates.achieved).toBe(false)
    expect(today.dealMethod).toBe(achieved.dealMethod)
    expect(Math.abs(today.difference)).toBeGreaterThan(1)
  })

  it('clear all keeps settings', () => {
    clearAll()
    expect(getState().deals).toHaveLength(0)
    expect(getState().settings.dubaiQuote).toBe(36.39)
  })

  it('a deal marked paid by mistake can be stepped back, and its distributor lines go with it', () => {
    const d = getState().deals.find((x) => x.status === 'completed')!
    const before = balances(getState())[d.distributorId!].INR
    expect(() => undoDealStep(d.id, '')).toThrow(UserError)
    undoDealStep(d.id, 'recipient not paid yet')
    const after = getState().deals.find((x) => x.id === d.id)!
    expect(after.status).toBe('out_for_delivery')
    expect(after.history.at(-1)!.note).toMatch(/Delivery undone: recipient not paid yet/)
    expect(balances(getState())[d.distributorId!].INR).toBeCloseTo(before + d.inrPayout + d.distributorFeeInr, 2)
  })

  it('asks before saving unusual entries, and saves only on yes', () => {
    const cust = getState().parties.find((p) => p.type === 'saudi_customer')!
    const sc = getState().transfers.find((t) => t.kind === 'send')!.fromId
    const asked: string[] = []
    setConfirmer((m) => (asked.push(m), false))
    try {
      expect(() => addReceipt({ customerId: cust.id, collectorId: sc, amount: 5_000_000, date: '2026-11-20' })).toThrow(/Not saved/)
      expect(() => addExpense({ date: '2026-11-20', paidById: sc, currency: 'INR', amount: 1000, category: 'Salary' })).toThrow(/Not saved/)
      expect(() => saveParty({ ...cust, active: false })).toThrow(/Not saved/)
      expect(asked[0]).toMatch(/extra zero/)
      expect(asked[1]).toMatch(/doesn't normally hold INR/)
      expect(asked[2]).toMatch(/still has a balance/)
      setConfirmer(() => true)
      expect(addReceipt({ customerId: cust.id, collectorId: sc, amount: 5_000_000, date: '2026-11-20' }).amount).toBe(5_000_000)
    } finally {
      setConfirmer(() => true)
    }
  })

  it("owner's account: profit left circulates until taken; taking it all leaves just the capital", async () => {
    const { ownerAccount } = await import('@/domain/owner')
    const today = '2026-11-24'
    const before = ownerAccount(getState(), today)
    const b0 = booksCheck(getState())
    // the owner's total equals what the books say the business is worth
    expect(before.balance).toBeCloseTo(b0.booksProfit + b0.capital + b0.openings, 0)
    expect(before.profitLeft).toBeCloseTo(before.profit, 2)

    // the owner takes all the profit, paid out of operator cash (₹)
    const cash = getState().parties.find((p) => p.type === 'operator')!
    const left = Math.round(before.profitLeft)
    capitalEntry({ kind: 'drawings', amount: left, currency: 'INR', partyId: cash.id, date: '2026-11-20', note: 'November profit' })
    const after = ownerAccount(getState(), today)
    expect(after.taken).toBe(left)
    expect(Math.abs(after.profitLeft)).toBeLessThan(1)
    expect(after.balance).toBeCloseTo(after.openings + after.capitalIn - after.capitalOut, 0)

    // the books still balance, and agree with the owner's account
    const b1 = booksCheck(getState())
    expect(Math.abs(b1.difference)).toBeLessThan(1)
    expect(b1.taken).toBe(left)
    expect(after.balance).toBeCloseTo(b1.booksProfit + b1.capital + b1.openings, 0)
  })
})
