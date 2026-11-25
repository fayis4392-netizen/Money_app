import { addDeal, addExpense, addReceipt, addRegion, addTransfer, capitalEntry, saveParty, setRates } from './actions'
import { emptyData, getState, setState } from './store'
import { deliveryFee } from '@/domain/pricing'
import { DISTRIBUTOR_CHARGE } from '@/domain/types'

/** Move a just-saved deal's timestamps to the day it really happened. */
function backdate(id: string, date: string, steps: string[] = []) {
  setState((s) => ({
    ...s,
    deals: s.deals.map((d) =>
      d.id !== id ? d : { ...d, createdAt: date + 'T10:00:00.000Z', history: d.history.map((h, i) => ({ ...h, at: (i < 2 ? date : steps[i - 2] ?? date) + `T${String(10 + i).padStart(2, '0')}:00:00.000Z` })) },
    ),
  }))
}

/**
 * Sample books: a few customers, collectors and distributors, plus Rayees' real
 * account (opening balance, cash received and sales) from the operator's ledger.
 * Replaces all current data; settings are kept.
 */
export function loadSample() {
  const settings = getState().settings
  setState(() => ({ ...emptyData(), settings }))
  setRates({ dubaiQuote: 36.39, sarPerAed: 1.02145, note: 'Sample data' })

  const ker = addRegion('Kerala'), mum = addRegion('Mumbai'), che = addRegion('Chennai')
  const P = (type: string, name: string, phone: string, extra: object = {}) => saveParty({ type, name, phone, ...extra })
  const rayees = P('saudi_customer', 'Rayees', '+966 50 000 0106', { openingAmount: 14595.395, openingSide: 'Dr', openingDate: '2026-10-30' })
  const abdul = P('saudi_customer', 'Abdul Rahman (Riyadh)', '+966 50 000 0101')
  const yusuf = P('saudi_customer', 'Yusuf (Jeddah)', '+966 50 000 0102')
  const faisal = P('saudi_collector', 'Faisal – Saudi Collector', '+966 55 000 0201')
  const ashraf = P('dubai_collector', 'Ashraf – Dubai Collector', '+971 50 000 0301')
  const rashid = P('dubai_agent', 'Rashid – Dubai Settlement Agent', '+971 50 000 0401')
  const op = P('operator', 'Operator – Own Cash', '')
  const kdist = P('distributor', 'Kozhikode Distributor', '+91 90000 00501', { regionId: ker.id })
  capitalEntry({ kind: 'add', amount: 2_500_000, currency: 'INR', partyId: op.id, date: '2026-11-01', note: 'Opening capital' })
  capitalEntry({ kind: 'transfer', amount: 500_000, currency: 'INR', partyId: op.id, toPartyId: kdist.id, date: '2026-11-01', note: 'Float for Kerala payouts' })
  const mdist = P('distributor', 'Mumbai Distributor', '+91 90000 00502', { regionId: mum.id })
  P('distributor', 'Chennai Distributor', '+91 90000 00503', { regionId: che.id })

  const deal = (date: string, customerId: string, k: number, quote: number, recipient: string, regionId: string, distributorId: string, done?: string[]) => {
    const d = addDeal({ dealDate: date, customerId, inrK: k, dubaiQuote: quote, sarPerAed: 1.02145, customerRate: quote + (k * 1000 >= 2_000_000 ? 1.5 : k * 1000 >= 500_000 ? 1.8 : 2), recipientName: recipient, regionId, distributorId, fee: 0 })
    backdate(d.id, date, done)
    return d
  }
  const cash = (customerId: string, date: string, amount: number) => addReceipt({ customerId, collectorId: faisal.id, date, amount })

  cash(rayees.id, '2026-10-31', 7500)
  cash(rayees.id, '2026-11-02', 3500)
  const names = ['Ashraf M', 'Basheer K', 'Chamila T', 'Dilshad P', 'Ebrahim V', 'Faisal N', 'Ganesh R', 'Hamza C', 'Irfan K', 'Jabir T', 'Kabeer A', 'Latheef P', 'Mansoor V', 'Noufal K']
  ;[25, 32, 22, 55, 44, 55, 7, 67, 15.5, 10, 25, 38, 25, 15].forEach((k, i) => deal('2026-11-03', rayees.id, k, 36.39, names[i], ker.id, kdist.id, ['2026-11-04', '2026-11-04']))
  cash(rayees.id, '2026-11-04', 8000)
  cash(rayees.id, '2026-11-05', 3000)
  cash(rayees.id, '2026-11-07', 3000)
  ;[[21, 'Rasheed P'], [75, 'Sameer K'], [5, 'Thahir M']].forEach(([k, n]) => deal('2026-11-11', rayees.id, k as number, 36.6, n as string, ker.id, kdist.id))

  deal('2026-11-12', abdul.id, 610, 36.52, 'Rakesh S', mum.id, mdist.id, ['2026-11-13', '2026-11-13'])
  deal('2026-11-15', abdul.id, 2500, 36.48, 'Shameer V (bulk)', ker.id, kdist.id)
  cash(abdul.id, '2026-11-16', 20000)
  deal('2026-11-16', yusuf.id, 60, 36.5, 'Fathima P', ker.id, kdist.id)
  deal('2026-11-17', yusuf.id, 48, 36.46, 'Jaseela M', ker.id, kdist.id)

  // money moving down the chain, one entry per step as it really happened
  const T = (kind: string, date: string, fromId: string, toId: string | undefined, amount: number, rate?: number, note = '', marketRate?: number) =>
    addTransfer({ kind, date, fromId, toId, amount, rate, marketRate, note })
  T('send', '2026-11-06', faisal.id, ashraf.id, 18000, undefined, 'Cash from Rayees')
  T('exchange', '2026-11-06', ashraf.id, undefined, 10000, 1.02145, 'Morning exchange')
  T('settle', '2026-11-07', ashraf.id, rashid.id, 9790)
  T('exchange', '2026-11-07', ashraf.id, undefined, 8000, 1.021972, 'Rate dipped')
  T('settle', '2026-11-08', ashraf.id, rashid.id, 7828)
  T('payout', '2026-11-08', rashid.id, kdist.id, 436806.5, 36.4, "Rayees' 3 Nov deals", 36.2)
  T('payout', '2026-11-13', rashid.id, mdist.id, 300000, 36.45, 'Part payment', 36.3)
  T('send', '2026-11-16', faisal.id, ashraf.id, 20000, undefined, 'Cash from Abdul')
  T('exchange', '2026-11-17', ashraf.id, undefined, 15000, 1.021242)

  // running costs, paid by whoever holds the money
  const X = (date: string, paidById: string, currency: string, amount: number, category: string, note: string) => addExpense({ date, paidById, currency, amount, category, note })
  X('2026-11-06', faisal.id, 'SAR', 50, 'Transport', 'Taxi to the Dubai handover')
  X('2026-11-07', ashraf.id, 'AED', 25, 'Bank / exchange charge', 'Exchange house fee')
  X('2026-11-10', op.id, 'INR', 1500, 'Phone', 'Monthly recharge, 3 phones')
  X('2026-11-16', faisal.id, 'SAR', 40, 'Transport', '')
  // each distributor's charge, entered once a day (₹300 per lakh of that day's deliveries)
  const days = new Map<string, { date: string; dist: string; inr: number; n: number }>()
  for (const d of getState().deals) {
    const k = d.dealDate + d.distributorId
    const e = days.get(k) ?? { date: d.dealDate, dist: d.distributorId!, inr: 0, n: 0 }
    e.inr += d.inrPayout
    e.n++
    days.set(k, e)
  }
  for (const e of days.values()) X(e.date, e.dist, 'INR', deliveryFee(e.inr, 300), DISTRIBUTOR_CHARGE, `${e.n} deal${e.n === 1 ? '' : 's'}`)
  T('settle', '2026-11-18', ashraf.id, rashid.id, 10000, undefined, 'First part')
}

/** Remove every party, deal and entry; settings and rates stay. */
export function clearAll() {
  const settings = getState().settings
  setState(() => ({ ...emptyData(), settings }))
}
