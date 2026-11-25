import { FileSpreadsheet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '@/data/store'
import { dealProfit } from '@/domain/derive'
import { achievedRates, actualProfit } from '@/domain/transfers'
import { money, todayStr } from '@/domain/format'
import type { Deal } from '@/domain/types'
import { downloadCsv } from '@/lib/export'
import { cn } from '@/lib/utils'
import { Button, Card, Empty, Field, Input, Select, Stat } from '@/components/ui'
import { expenseTotals } from '@/domain/expenses'
import { inrPerSar } from '@/domain/pricing'
import { useToInr } from '@/lib/useToInr'
import { DISTRIBUTOR_CHARGE } from '@/domain/types'

const GROUPS = { customer: 'Customer', distributor: 'Distributor', region: 'Region', month: 'Month', day: 'Day' } as const
type Group = keyof typeof GROUPS

interface Row { key: string; n: number; inr: number; sar: number; fees: number; feesSar: number; netSar: number; netInr: number; estSar: number }
const ZERO = { n: 0, inr: 0, sar: 0, fees: 0, feesSar: 0, netSar: 0, netInr: 0, estSar: 0 }

export default function Reports() {
  const data = useData()
  const toInr = useToInr()
  const [f, setF] = useState(() => ({ from: todayStr().slice(0, 8) + '01', to: '', group: 'customer' as Group }))
  // ₹ per SAR achieved through Dubai in this period (or ever, if nothing was settled in it)
  const rateNow = achievedRates(data.transfers, f.from, f.to || undefined).inrPerSar ?? achievedRates(data.transfers).inrPerSar
  // the ₹ per SAR profits are measured at: achieved through Dubai, or today's rates before any transfers
  const basis = rateNow ?? inrPerSar(data.settings.dubaiQuote, data.settings.sarPerAed)
  const rows = useMemo(() => {
  const name = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? 'Unassigned'
  const keyOf: Record<Group, (d: Deal) => string> = {
    customer: (d) => name(d.customerId),
    distributor: (d) => name(d.distributorId),
    region: (d) => data.regions.find((r) => r.id === d.regionId)?.name ?? '—',
    month: (d) => d.dealDate.slice(0, 7),
    day: (d) => d.dealDate,
  }
    const m = new Map<string, Row>()
    for (const d of data.deals) {
      if (d.status === 'cancelled' || (f.from && d.dealDate < f.from) || (f.to && d.dealDate > f.to)) continue
      const k = keyOf[f.group](d)
      const r = m.get(k) ?? { key: k, ...ZERO }
      const p = dealProfit(d, 0)
      const a = actualProfit([d], rateNow, 0)
      const fee = d.distributorId ? d.distributorFeeInr : 0
      r.n++; r.inr += d.inrPayout; r.sar += d.sarAmount; r.fees += fee; r.feesSar += fee / basis
      r.estSar += p.sar
      r.netSar += a ? a.sar : p.sar
      r.netInr += a ? a.inr : p.sar * basis
      m.set(k, r)
    }
    return [...m.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [data, f, rateNow, basis])
  const tot = rows.reduce((t, r) => ({ ...t, ...Object.fromEntries(Object.keys(ZERO).map((k) => [k, t[k as keyof typeof ZERO] + r[k as keyof typeof ZERO]])) }), { key: 'Total', ...ZERO } as Row)
  const cols: [string, (r: Row) => string][] = [
    ['Deals', (r) => String(r.n)],
    ['₹ delivered', (r) => money(r.inr, 'INR')],
    ['SAR collected', (r) => money(r.sar, 'SAR')],
    ['Avg rate /₹1000', (r) => (r.inr ? ((r.sar / r.inr) * 1000).toFixed(4) : '—')],
    ['Gross profit', (r) => money(r.netSar + r.feesSar, 'SAR')],
    ['Delivery charge', (r) => `− ${money(r.feesSar, 'SAR')}`],
    ['Net profit', (r) => money(r.netSar, 'SAR')],
    ['Net · at deal rates', (r) => money(r.estSar, 'SAR')],
  ]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" className="flex-1 sm:max-w-44"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" className="flex-1 sm:max-w-44"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Group by" className="flex-1 sm:max-w-44"><Select value={f.group} onChange={(e) => setF({ ...f, group: e.target.value as Group })}>{Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <span className="flex-1" />
        <Button onClick={() => downloadCsv(`report_by_${f.group}_${f.from || 'start'}_${f.to || 'today'}`, [[GROUPS[f.group], ...cols.map((c) => c[0])], ...[...rows, tot].map((r) => [r.key, String(r.n), r.inr.toFixed(2), r.sar.toFixed(3), r.inr ? ((r.sar / r.inr) * 1000).toFixed(4) : '', (r.netSar + r.feesSar).toFixed(2), r.feesSar.toFixed(2), r.netSar.toFixed(2), r.estSar.toFixed(2)])])}><FileSpreadsheet /> Excel (CSV)</Button>
      </div>
      {(() => {
        const exp = expenseTotals(data.expenses, toInr, f.from || undefined, f.to || undefined)
        const net = tot.netInr - exp.inr
        // the distributors' daily charge entries count as delivery charges, not other expenses
        const daily = exp.byCategory.get(DISTRIBUTOR_CHARGE) ?? 0
        return (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Gross profit" value={money(tot.netInr + tot.fees, 'INR')} sub={`${tot.n} deals · ${rateNow ? 'at achieved rate' : 'at deal rates'}`} />
            <Stat label="Delivery charge" value={<span className="text-neg">− {money(tot.fees + daily, 'INR')}</span>} sub="paid to distributors" />
            <Stat label="Other expenses" value={<span className="text-neg">− {money(exp.inr - daily, 'INR')}</span>} sub={`${exp.list.filter((e) => e.category !== DISTRIBUTOR_CHARGE).length} in this period`} />
            <Stat label="Net profit" value={<span className={net >= 0 ? 'text-pos' : 'text-neg'}>{money(net, 'INR')}</span>} sub="after all costs" />
          </div>
        )
      })()}
      <p className="text-sm text-muted">Gross profit is what customers paid minus what Dubai charged. The table's Net profit is after delivery charges (other expenses aren't per customer, so they're only in the cards above). Profits use the ₹ per SAR actually got through Dubai{rateNow ? <> (<b className="text-fg">₹{rateNow.toFixed(4)}</b>)</> : ''}. Cancelled deals are left out.</p>
      <Card className="p-0 md:p-0">
        {rows.length ? (
          <>
            <div className="overflow-x-auto max-md:hidden">
              <table className="w-full text-sm tabular-nums">
                <thead className="border-b border-border bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-2 text-left font-semibold">{GROUPS[f.group]}</th>{cols.map((c) => <th key={c[0]} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{c[0]}</th>)}</tr></thead>
                <tbody>{rows.map((r) => <tr key={r.key} className="border-b border-border"><td className="px-3 py-2">{r.key}</td>{cols.map((c, i) => <td key={c[0]} className={cn('px-3 py-2 text-right whitespace-nowrap', i === 6 && 'text-pos', i === 5 && 'text-neg', i === 7 && 'text-muted')}>{c[1](r)}</td>)}</tr>)}</tbody>
                <tfoot className="font-bold"><tr><td className="px-3 py-2">Total</td>{cols.map((c, i) => <td key={c[0]} className={cn('px-3 py-2 text-right whitespace-nowrap', i === 6 && 'text-pos', i === 5 && 'text-neg', i === 7 && 'text-muted')}>{c[1](tot)}</td>)}</tr></tfoot>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {[...rows, tot].map((r) => (
                <li key={r.key} className={cn('grid gap-1 px-4 py-3 text-sm tabular-nums', r === tot && 'bg-surface-2 font-bold')}>
                  <div className="flex justify-between"><b>{r.key}</b><span className="text-muted">{r.n} deals</span></div>
                  <div className="flex justify-between"><span>{money(r.inr, 'INR')}</span><span>{money(r.sar, 'SAR')}</span></div>
                  <div className="flex justify-between text-xs"><span>Gross {money(r.netSar + r.feesSar, 'SAR')}</span><span className="text-neg">Delivery − {money(r.feesSar, 'SAR')}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted">₹{r.fees.toFixed(2)} delivery charge</span><span className="font-semibold text-pos">Net {money(r.netSar, 'SAR')}</span></div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty>No deals in this period</Empty>
        )}
      </Card>
    </div>
  )
}
