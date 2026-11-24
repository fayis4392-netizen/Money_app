import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/data/store'
import { balances, dealProfit, dealProfitSar } from '@/domain/derive'
import { expenseTotals } from '@/domain/expenses'
import { useToInr } from '@/lib/useToInr'
import { achievedRates, actualProfit } from '@/domain/transfers'
import { money, rate } from '@/domain/format'
import { deliveryFee, inrPerSar, priceDeal, suggestCustomerRate } from '@/domain/pricing'
import { Button, Card, CardHeader, Empty, Stat } from '@/components/ui'
import { useDealDialog } from '@/components/deal/context'
import { DealTable } from './Deals'

export default function Dashboard() {
  const data = useData()
  const s = data.settings
  const { newDeal } = useDealDialog()
  const toInr = useToInr()
  const sample = priceDeal(100_000, s.dubaiQuote, suggestCustomerRate(100_000, s.dubaiQuote, s.slabs), s.sarPerAed, deliveryFee(100_000, s.distributorFeePerLakh))
  const k = useMemo(() => {
    const bal = balances(data)
    const live = data.deals.filter((d) => d.status !== 'cancelled')
    const receivable = data.parties.filter((p) => p.type === 'saudi_customer').reduce((t, p) => t + Math.max(0, bal[p.id]?.SAR ?? 0), 0)
    return {
      receivable,
      debtors: data.parties.filter((p) => p.type === 'saudi_customer' && (bal[p.id]?.SAR ?? 0) > 0.0005).length,
      pending: live.filter((d) => d.status !== 'completed'),
      profit: live.reduce((t, d) => t + dealProfitSar(d, 0), 0),
      actual: actualProfit(live, achievedRates(data.transfers).inrPerSar, 0),
      profitInr: live.reduce((t, d) => t + dealProfit(d, 0).inr, 0),
      expenses: expenseTotals(data.expenses, toInr).inr,
    }
  }, [data, toInr])
  const recent = [...data.deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Customers owe you" value={money(k.receivable, 'SAR')} sub={`${k.debtors} customer${k.debtors === 1 ? '' : 's'} with a balance`} />
        <Stat label="Waiting for delivery" value={k.pending.length} sub={money(k.pending.reduce((t, d) => t + d.inrPayout, 0), 'INR') + ' to pay out'} />
        <Stat label="Net profit, all deals" value={<span className={(k.actual?.inr ?? k.profitInr) - k.expenses >= 0 ? 'text-pos' : 'text-neg'}>{money((k.actual?.inr ?? k.profitInr) - k.expenses, 'INR')}</span>} sub={`deals ${money(k.actual?.inr ?? k.profitInr, 'INR')}${k.actual ? ' at achieved rates' : ''} − expenses ${money(k.expenses, 'INR')}`} />
        <Stat label="Today's Dubai quote" value={rate(s.dubaiQuote)} sub={`AED per ₹1,000 · ₹${rate(Math.round(inrPerSar(s.dubaiQuote, s.sarPerAed) * 100) / 100)} per SAR`} />
      </div>

      <Card className="p-0 md:p-0">
        <div className="px-4 pt-4 md:px-5"><CardHeader title="Recent deals" action={<Link className="text-sm font-semibold text-accent" to="/deals">View all</Link>} /></div>
        {recent.length ? <DealTable deals={recent} /> : <Empty><div className="grid justify-items-center gap-3">No deals yet.<Button variant="primary" onClick={() => newDeal()}><Plus /> New deal</Button><span className="text-xs">or load sample data in <Link className="text-accent" to="/settings">Settings</Link></span></div></Empty>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="₹1 lakh at today's rates" sub="How a small deal is priced right now" />
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm tabular-nums">
            <dt className="text-muted">Customer pays (100 × {rate(sample.customerRate)})</dt><dd className="text-right font-semibold">{money(sample.sar, 'SAR')}</dd>
            <dt className="text-muted">Dubai cost (100 × {rate(s.dubaiQuote)} AED)</dt><dd className="text-right">{money(sample.aedCost, 'AED')}</dd>
            <dt className="text-muted">…in SAR (× {rate(s.sarPerAed)} SAR per AED)</dt><dd className="text-right">{money(sample.sarCost, 'SAR')}</dd>
            <dt className="text-muted">Distributor fee {money(deliveryFee(100_000, s.distributorFeePerLakh), 'INR')}</dt><dd className="text-right">{money(sample.feeSar, 'SAR')}</dd>
            <dt className="font-semibold">Profit</dt><dd className="text-right font-bold text-pos">{money(sample.profitSar, 'SAR')}</dd>
          </dl>
        </Card>
      </div>
    </div>
  )
}
