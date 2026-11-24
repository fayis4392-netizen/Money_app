import { ArrowDownRight, ArrowUpRight, Plus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/data/store'
import { insights, SPAN_LABEL, type Span } from '@/domain/insights'
import { money, rate, todayStr } from '@/domain/format'
import { deliveryFee, inrPerSar, priceDeal, suggestCustomerRate } from '@/domain/pricing'
import { useToInr } from '@/lib/useToInr'
import { cn } from '@/lib/utils'
import { BarList, ColumnChart, SplitBar, StepLine } from '@/components/charts'
import { Button, Card, CardHeader, Empty, Select, Stat } from '@/components/ui'
import { useDealDialog } from '@/components/deal/context'
import { DealTable } from './Deals'

const SPAN_KEY = 'exchange-ledger:dashboard-span'
const inr0 = (n: number) => money(Math.round(n), 'INR').replace(/\.00$/, '')
const MON = (ym: string) => new Date(ym + '-15').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
const DAY = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** "+12% vs previous" with an arrow, so the direction never relies on colour alone. */
function Delta({ now, prev, label }: { now: number; prev?: number; label: string }) {
  if (prev == null) return null
  if (prev === 0) return <span className="text-muted">{now ? `new vs ${label}` : `same as ${label}`}</span>
  const pct = ((now - prev) / Math.abs(prev)) * 100
  const up = pct >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5', up ? 'text-pos' : 'text-neg')}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(pct) >= 999 ? '999+' : Math.abs(pct).toFixed(0)}% <span className="text-muted">vs {label}</span>
    </span>
  )
}

function Panel({ title, sub, action, children, className }: { title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader title={title} sub={sub} action={action} />
      {children}
    </Card>
  )
}

export default function Dashboard() {
  const data = useData()
  const s = data.settings
  const { newDeal } = useDealDialog()
  const toInr = useToInr()
  const [span, setSpan] = useState<Span>(() => {
    try {
      return (localStorage.getItem(SPAN_KEY) as Span) || '30d'
    } catch {
      return '30d'
    }
  })
  const pick = (v: Span) => {
    setSpan(v)
    try {
      localStorage.setItem(SPAN_KEY, v)
    } catch {
      /* fine */
    }
  }
  const today = todayStr()
  const k = useMemo(() => insights(data, span, today, toInr), [data, span, today, toInr])
  const recent = [...data.deals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
  const sample = priceDeal(100_000, s.dubaiQuote, suggestCustomerRate(100_000, s.dubaiQuote, s.slabs), s.sarPerAed, deliveryFee(100_000, s.distributorFeePerLakh))
  const label = (key: string) => (span === '30d' || span === '90d' ? DAY(key) : MON(key))
  const prevLabel = span === '30d' ? 'previous 30 days' : span === '90d' ? 'previous 3 months' : 'previous 12 months'
  const perLakh = (t: { volume: number; profit: number }) => (t.volume ? (t.profit / t.volume) * 100_000 : 0)
  const owed = k.money[0].inr

  if (!data.deals.length)
    return (
      <Card>
        <Empty>
          <div className="grid justify-items-center gap-3">
            No deals yet. Charts appear here as soon as the first deals are in.
            <Button variant="primary" onClick={() => newDeal()}><Plus /> New deal</Button>
            <span className="text-xs">or load sample data in <Link className="text-accent" to="/settings">Settings</Link></span>
          </div>
        </Empty>
      </Card>
    )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Profit is after delivery charges, at ₹{k.rate ? rate(Math.round(k.rate * 1e4) / 1e4) : '—'} per SAR achieved through Dubai. Other expenses are on <Link className="text-accent" to="/profit-loss">Profit &amp; Loss</Link>.</p>
        <Select className="w-auto" value={span} onChange={(e) => pick(e.target.value as Span)} aria-label="Period">
          {Object.entries(SPAN_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="₹ delivered" value={inr0(k.now.volume)} sub={<Delta now={k.now.volume} prev={k.prev?.volume} label={prevLabel} />} />
        <Stat label="Deals" value={k.now.deals} sub={<Delta now={k.now.deals} prev={k.prev?.deals} label={prevLabel} />} />
        <Stat label="Profit" value={<span className={k.now.profit >= 0 ? 'text-pos' : 'text-neg'}>{inr0(k.now.profit)}</span>} sub={<Delta now={k.now.profit} prev={k.prev?.profit} label={prevLabel} />} />
        <Stat label="Profit per ₹1 lakh" value={inr0(perLakh(k.now))} sub={k.prev ? <Delta now={perLakh(k.now)} prev={perLakh(k.prev)} label={prevLabel} /> : 'average margin'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="₹ delivered" sub={span === '30d' ? 'per day' : span === '90d' ? 'per week' : 'per month'}>
          <ColumnChart name="Rupees delivered" points={k.buckets.map((b) => ({ key: b.key, label: label(b.key), value: b.volume, detail: `${b.deals} deal${b.deals === 1 ? '' : 's'}` }))} format={inr0} />
        </Panel>
        <Panel title="Profit" sub={span === '30d' ? 'per day, after delivery charges' : span === '90d' ? 'per week, after delivery charges' : 'per month, after delivery charges'}>
          <ColumnChart name="Profit" points={k.buckets.map((b) => ({ key: b.key, label: label(b.key), value: Math.round(b.profit), detail: b.volume ? `${inr0((b.profit / b.volume) * 100_000)} per lakh` : undefined }))} format={inr0} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Where the money is" sub="Right now, in ₹ at today's rates">
          <BarList
            format={inr0}
            rows={k.money.map((m) => ({ key: m.label, label: m.label, value: Math.round(m.inr), sub: m.inr < -0.5 ? 'you owe them (Cr)' : undefined }))}
          />
          <p className="mt-3 text-xs text-muted">{owed > 0 ? <>Customers owe {inr0(owed)}. </> : null}<Link className="text-accent" to="/balances">Debtors &amp; creditors →</Link></p>
        </Panel>
        <Panel title="Deals in progress" sub={`Right now · paid: ${SPAN_LABEL[span].toLowerCase()}`}>
          <SplitBar parts={[
            { label: 'Assigned to distributor', value: k.status.assigned, color: 'var(--series-1)' },
            { label: 'Out for delivery', value: k.status.out, color: 'var(--series-2)' },
            { label: 'Paid to recipient', value: k.status.paid, color: 'var(--series-3)' },
          ]} />
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 text-xs font-semibold text-muted">Still to deliver, by distributor</div>
            <BarList format={inr0} empty="Nothing waiting" rows={k.pending.slice(0, 5).map((p) => ({ key: p.name, label: p.name, value: p.inr, sub: `${p.deals} deal${p.deals === 1 ? '' : 's'}` }))} />
          </div>
        </Panel>
        <Panel title="Top customers" sub={`By profit, ${SPAN_LABEL[span].toLowerCase()}`}>
          <BarList
            format={inr0}
            empty="No deals in this period"
            rows={k.customers.slice(0, 6).map((c) => ({ key: c.id, label: <Link className="hover:text-accent" to={'/parties/' + c.id}>{c.name}</Link>, value: Math.round(c.profit), sub: `${c.deals} deal${c.deals === 1 ? '' : 's'} · ${inr0(c.volume)} delivered` }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Dubai quote" sub={`AED per ₹1,000 · now ${rate(s.dubaiQuote)} (₹${rate(Math.round(inrPerSar(s.dubaiQuote, s.sarPerAed) * 100) / 100)} per SAR)`}>
          <StepLine name="Dubai quote" points={k.quotes.map((q) => ({ at: q.at, value: q.quote }))} format={(n) => n.toFixed(2)} until={today + 'T23:59:59'} />
        </Panel>
        <Panel title="₹1 lakh at today's rates" sub="How a small deal is priced right now">
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm tabular-nums">
            <dt className="text-muted">Customer pays (100 × {rate(sample.customerRate)})</dt><dd className="text-right font-semibold">{money(sample.sar, 'SAR')}</dd>
            <dt className="text-muted">Dubai cost (100 × {rate(s.dubaiQuote)} AED)</dt><dd className="text-right">{money(sample.aedCost, 'AED')}</dd>
            <dt className="text-muted">…in SAR (× {rate(s.sarPerAed)})</dt><dd className="text-right">{money(sample.sarCost, 'SAR')}</dd>
            <dt className="text-muted">Delivery charge {money(deliveryFee(100_000, s.distributorFeePerLakh), 'INR')}</dt><dd className="text-right">{money(sample.feeSar, 'SAR')}</dd>
            <dt className="font-semibold">Profit</dt><dd className="text-right font-bold text-pos">{money(sample.profitSar, 'SAR')}</dd>
          </dl>
        </Panel>
      </div>

      <Card className="p-0 md:p-0">
        <div className="px-4 pt-4 md:px-5"><CardHeader title="Recent deals" action={<Link className="text-sm font-semibold text-accent" to="/deals">View all</Link>} /></div>
        {recent.length ? <DealTable deals={recent} /> : <Empty>No deals yet</Empty>}
      </Card>
    </div>
  )
}
