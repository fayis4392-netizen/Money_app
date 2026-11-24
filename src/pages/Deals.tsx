import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/data/store'
import { dealProfitSar } from '@/domain/derive'
import { dmy, money, rate } from '@/domain/format'
import { DEAL_STATUS_LABEL, type Deal, type DealStatus } from '@/domain/types'
import { cn } from '@/lib/utils'
import { Button, Card, Empty, Field, Input, Select, StatusBadge } from '@/components/ui'
import { useDealDialog } from '@/components/deal/context'

export default function Deals() {
  const data = useData()
  const { newDeal } = useDealDialog()
  const [f, setF] = useState({ q: '', status: '', customer: '' })
  const name = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? '—'
  const q = f.q.trim().toLowerCase()
  const list = [...data.deals]
    .filter((d) => (!f.status || d.status === f.status) && (!f.customer || d.customerId === f.customer))
    .filter((d) => !q || [d.dealNo, d.recipientName, d.recipientPhone, name(d.customerId)].some((x) => x.toLowerCase().includes(q)))
    .sort((a, b) => b.dealDate.localeCompare(a.dealDate) || b.dealNo.localeCompare(a.dealNo))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" className="min-w-48 flex-[2]"><Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Deal no, recipient, phone, customer" /></Field>
        <Field label="Status" className="min-w-36 flex-1">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">All</option>
            {Object.entries(DEAL_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Customer" className="min-w-36 flex-1">
          <Select value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })}>
            <option value="">All</option>
            {data.parties.filter((p) => p.type === 'saudi_customer').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Button variant="primary" onClick={() => newDeal()}><Plus /> New deal</Button>
      </div>
      <Card className="p-0 md:p-0">{list.length ? <DealTable deals={list} /> : <Empty>{data.deals.length ? 'No deals match' : 'No deals yet. Add one with New deal.'}</Empty>}</Card>
    </div>
  )
}

export function DealTable({ deals }: { deals: Deal[] }) {
  const data = useData()
  const name = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? '—'
  const live = deals.filter((d) => d.status !== 'cancelled')
  const profit = (d: Deal) => dealProfitSar(d, 0)
  return (
    <>
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b border-border bg-surface-2 text-xs text-muted">
            <tr>{['Deal', 'Customer', 'Recipient', '₹ to deliver', 'Rate /₹1000', 'SAR to collect', 'Profit', 'Distributor', 'Status'].map((h, i) => <th key={h} className={cn('px-3 py-2 font-semibold whitespace-nowrap', i >= 3 && i <= 6 ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} className={cn('border-b border-border', d.status === 'cancelled' && 'opacity-55')}>
                <td className="px-3 py-2"><Link className="font-semibold text-accent" to={'/deals/' + d.id}>{d.dealNo}</Link><div className="text-xs text-muted">{dmy(d.dealDate)}</div></td>
                <td className="px-3 py-2">{name(d.customerId)}</td>
                <td className="px-3 py-2">{d.recipientName}<div className="text-xs text-muted">{data.regions.find((r) => r.id === d.regionId)?.name}</div></td>
                <td className="px-3 py-2 text-right">{money(d.inrPayout, 'INR')}</td>
                <td className="px-3 py-2 text-right">{rate(d.customerRate)}{d.rateOverride && <span className="text-warn" title="Manual premium"> ●</span>}<div className="text-xs text-muted">{rate(d.dubaiQuote)} + {rate(d.premium)}</div></td>
                <td className="px-3 py-2 text-right">{money(d.sarAmount, 'SAR')}</td>
                <td className={cn('px-3 py-2 text-right', profit(d) >= 0 ? 'text-pos' : 'text-neg')}>{d.status === 'cancelled' ? '—' : money(profit(d), 'SAR')}</td>
                <td className="px-3 py-2">{name(d.distributorId)}</td>
                <td className="px-3 py-2"><StatusBadge status={d.status} label={DEAL_STATUS_LABEL[d.status]} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-bold">
            <tr><td className="px-3 py-2" colSpan={3}>{live.length} active deals</td><td className="px-3 py-2 text-right">{money(live.reduce((s, d) => s + d.inrPayout, 0), 'INR')}</td><td /><td className="px-3 py-2 text-right">{money(live.reduce((s, d) => s + d.sarAmount, 0), 'SAR')}</td><td className="px-3 py-2 text-right text-pos">{money(live.reduce((s, d) => s + profit(d), 0), 'SAR')}</td><td colSpan={2} /></tr>
          </tfoot>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {deals.map((d) => (
          <li key={d.id} className={cn(d.status === 'cancelled' && 'opacity-55')}>
            <Link to={'/deals/' + d.id} className="grid gap-2 px-4 py-3 text-sm tabular-nums">
              <div className="flex items-center justify-between gap-2"><span><b className="text-accent">{d.dealNo}</b> <span className="text-xs text-muted">{dmy(d.dealDate)}</span></span><StatusBadge status={d.status as DealStatus} label={DEAL_STATUS_LABEL[d.status]} /></div>
              <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.1fr)] gap-2">
                <div><div className="text-[11px] text-muted">₹ to deliver</div><b>{money(d.inrPayout, 'INR')}</b></div>
                <div><div className="text-[11px] text-muted">Rate</div>{rate(d.customerRate)}</div>
                <div><div className="text-[11px] text-muted">SAR</div><b>{money(d.sarAmount, 'SAR').replace('SAR ', '')}</b></div>
              </div>
              <div className="flex justify-between gap-2 text-xs text-muted"><span className="min-w-0 truncate">{name(d.customerId)} → {d.recipientName}</span>{d.status !== 'cancelled' && <span className="whitespace-nowrap text-pos">{money(profit(d), 'SAR')}</span>}</div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
