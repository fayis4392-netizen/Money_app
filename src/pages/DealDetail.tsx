import { deliveryFee } from '@/domain/pricing'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { advanceDeal, cancelDeal, reassignDistributor } from '@/data/actions'
import { useData } from '@/data/store'
import { canCorrect, dealProfit } from '@/domain/derive'
import { dmy, fdt, lakh, money, rate } from '@/domain/format'
import { DEAL_FLOW, DEAL_STATUS_LABEL } from '@/domain/types'
import { attempt, cn } from '@/lib/utils'
import { Button, Card, CardHeader, Dialog, Empty, Field, Input, ReasonDialog, Select, Stat, StatusBadge } from '@/components/ui'
import { useDealDialog } from '@/components/deal/context'

export default function DealDetail() {
  const { id } = useParams()
  const data = useData()
  const d = data.deals.find((x) => x.id === id)
  const { correctDeal } = useDealDialog()
  const [cancelling, setCancelling] = useState(false)
  const [reassign, setReassign] = useState(false)
  if (!d) return <Card><Empty>Deal not found. <Link className="text-accent" to="/deals">Back to deals</Link></Empty></Card>

  const name = (pid?: string) => data.parties.find((p) => p.id === pid)?.name ?? '—'
  const link = (pid?: string) => (pid ? <Link className="text-accent" to={'/parties/' + pid}>{name(pid)}</Link> : '—')
  const replaced = data.deals.find((x) => x.replacesDealId === d.id)
  const original = data.deals.find((x) => x.id === d.replacesDealId)
  const pr = dealProfit(d, 0)
  const profit = pr.sar
  const step = DEAL_FLOW.indexOf(d.status)
  const next = { assigned: 'Mark out for delivery', out_for_delivery: 'Mark paid to recipient' }[d.status as 'assigned' | 'out_for_delivery']

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted"><Link className="text-accent" to="/deals">Deals</Link> / {d.dealNo}</div>
          <h2 className="mt-1 text-xl font-bold">{d.dealNo} · {d.recipientName}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StatusBadge status={d.status} label={DEAL_STATUS_LABEL[d.status]} />
            {dmy(d.dealDate)}
            {original && <span>· correction of <Link className="text-accent" to={'/deals/' + original.id}>{original.dealNo}</Link></span>}
            {replaced && <span>· corrected by <Link className="text-accent" to={'/deals/' + replaced.id}>{replaced.dealNo}</Link></span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {next && <Button variant="primary" onClick={() => attempt(() => advanceDeal(d.id), DEAL_STATUS_LABEL[d.status === 'assigned' ? 'out_for_delivery' : 'completed'])}>{next}</Button>}
          {d.status === 'assigned' && <Button onClick={() => setReassign(true)}>Change distributor</Button>}
          {canCorrect(d) && <Button onClick={() => correctDeal(d)}>Correct</Button>}
          {canCorrect(d) && <Button variant="danger" onClick={() => setCancelling(true)}>Cancel deal</Button>}
        </div>
      </div>

      {d.status !== 'cancelled' && (
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          {DEAL_FLOW.map((s, i) => (
            <div key={s} className={cn('rounded-lg border-t-[3px] border-border bg-surface-2 px-3 py-2 text-xs font-medium text-muted', i < step && 'border-accent text-fg', i === step && 'border-accent bg-accent-soft font-bold text-accent')}>{i + 1}. {DEAL_STATUS_LABEL[s]}</div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Money" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="₹ to deliver" value={money(d.inrPayout, 'INR')} sub={'to ' + d.recipientName} />
          <Stat label="SAR from customer" value={money(d.sarAmount, 'SAR')} sub={`${d.inrPayout / 1000} × ${rate(d.customerRate)}`} />
          <Stat label="Dubai cost" value={money(Math.round((d.inrPayout / 1000) * d.dubaiQuote * 100) / 100, 'AED')} sub={`≈ ${money(Math.round((d.inrPayout / 1000) * d.dubaiQuote * d.sarPerAed * 100) / 100, 'SAR')}`} />
          <Stat label="Est. profit" value={<span className={profit >= 0 ? 'text-pos' : 'text-neg'}>{d.status === 'cancelled' ? '—' : money(profit, 'SAR')}</span>} sub={d.status === 'cancelled' ? 'cancelled' : `≈ ${money(pr.inr, 'INR')} · after ${money(d.distributorFeeInr, 'INR')} fee`} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Rates on this deal" sub="Frozen when the deal was saved" />
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm tabular-nums">
            <dt className="text-muted">Dubai quote</dt><dd className="text-right">{rate(d.dubaiQuote)} AED per ₹1,000</dd>
            <dt className="text-muted">Premium</dt><dd className="text-right">+ {rate(d.premium)} {d.rateOverride ? <span className="text-warn">(manual{d.slab ? `, slab +${rate(d.slab.premium)}` : ''})</span> : <span className="text-muted">(slab ₹{d.slab ? lakh(d.slab.minInr) : 0}+)</span>}</dd>
            <dt className="text-muted">Customer rate</dt><dd className="text-right font-semibold">{rate(d.customerRate)} SAR per ₹1,000</dd>
            <dt className="text-muted">SAR per 1 AED</dt><dd className="text-right">{rate(d.sarPerAed)}</dd>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Recipient & delivery" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Customer</dt><dd>{link(d.customerId)}</dd>
            <dt className="text-muted">Recipient</dt><dd>{d.recipientName} {d.recipientPhone && <span className="text-muted">· {d.recipientPhone}</span>}</dd>
            <dt className="text-muted">Address</dt><dd>{d.recipientAddress || '—'}</dd>
            <dt className="text-muted">Region</dt><dd>{data.regions.find((r) => r.id === d.regionId)?.name}</dd>
            <dt className="text-muted">Distributor</dt><dd>{link(d.distributorId)} <span className="text-muted">· fee {money(d.distributorFeeInr, 'INR')}</span></dd>
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader title="History" />
        <ol className="grid gap-3">
          {[...d.history].reverse().map((h, i) => (
            <li key={i} className="text-sm">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={h.status} label={DEAL_STATUS_LABEL[h.status]} /><span className="text-xs text-muted">{fdt(h.at)}</span></div>
              {h.note && <div className="mt-1 text-muted">{h.note}</div>}
            </li>
          ))}
        </ol>
      </Card>

      <ReasonDialog open={cancelling} title={`Cancel ${d.dealNo}`} message="The SAR is reversed out of the customer's ledger. This cannot be undone." confirm="Cancel deal" danger onClose={() => setCancelling(false)} onConfirm={(r) => attempt(() => cancelDeal(d.id, r), 'Deal cancelled · reversal posted')} />
      <Dialog open={reassign} onClose={() => setReassign(false)} title={`Change distributor · ${d.dealNo}`} footer={<><Button onClick={() => setReassign(false)}>Cancel</Button><Button variant="primary" type="submit" form="reassign-form">Save</Button></>}>
        {reassign && (
          <form id="reassign-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (attempt(() => reassignDistributor(d.id, String(fd.get('dist')), fd.get('fee')), 'Distributor changed')) setReassign(false) }}>
            <Field label="Distributor">
              <Select name="dist" defaultValue={d.distributorId} onChange={(e) => { const p = data.parties.find((x) => x.id === e.target.value); const fee = e.currentTarget.form?.elements.namedItem('fee') as HTMLInputElement | null; if (fee) fee.value = String(deliveryFee(d.inrPayout, p?.feePerLakh ?? data.settings.distributorFeePerLakh)) }}>
                {data.parties.filter((p) => p.type === 'distributor' && p.active).sort((a, b) => Number(b.regionId === d.regionId) - Number(a.regionId === d.regionId)).map((p) => <option key={p.id} value={p.id}>{p.name} · {data.regions.find((r) => r.id === p.regionId)?.name}</option>)}
              </Select>
            </Field>
            <Field label="Delivery charge (₹)" hint="Set from the chosen distributor's rate; you can change it."><Input name="fee" type="number" step="any" min={0} defaultValue={d.distributorFeeInr} /></Field>
          </form>
        )}
      </Dialog>
    </div>
  )
}
