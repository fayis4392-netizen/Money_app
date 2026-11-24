import { FileDown, FileSpreadsheet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useData } from '@/data/store'
import { dmy, money, todayStr } from '@/domain/format'
import { monthsIn, pnlRate, profitAndLoss, type PnL } from '@/domain/pnl'
import { downloadCsv, exportTablePdf } from '@/lib/export'
import { useToInr } from '@/lib/useToInr'
import { cn } from '@/lib/utils'
import { Button, Card, Field, Input, Select, Stat } from '@/components/ui'

type Preset = 'this-month' | 'last-month' | 'this-year' | 'all' | 'custom'
const PRESETS: Record<Preset, string> = { 'this-month': 'This month', 'last-month': 'Last month', 'this-year': 'This year', all: 'All time', custom: 'Custom dates' }

function rangeOf(p: Preset, custom: { from: string; to: string }) {
  const t = todayStr(), y = t.slice(0, 4), m = Number(t.slice(5, 7))
  if (p === 'this-month') return { from: t.slice(0, 8) + '01', to: t }
  if (p === 'last-month') {
    const ly = m === 1 ? Number(y) - 1 : Number(y), lm = m === 1 ? 12 : m - 1
    const mm = String(lm).padStart(2, '0')
    return { from: `${ly}-${mm}-01`, to: `${ly}-${mm}-31` }
  }
  if (p === 'this-year') return { from: `${y}-01-01`, to: t }
  if (p === 'custom') return custom
  return { from: '', to: '' }
}
const MONTH = (ym: string) => new Date(ym + '-15').toLocaleString('en-GB', { month: 'short', year: 'numeric' })
const signed = (v: number) => (v < 0 ? '− ' + money(-v, 'INR') : money(v, 'INR'))
const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : '—')

/** The statement's lines, shared by the screen, the month table and the exports. */
function lines(p: PnL, categories: string[]): { label: string; value: (x: PnL) => number; kind: 'head' | 'item' | 'less' | 'total' | 'net' }[] {
  return [
    { label: 'Income', value: () => NaN, kind: 'head' },
    { label: 'Sales to customers', value: (x) => x.sales, kind: 'item' },
    { label: 'Less: paid to recipients in India', value: (x) => -x.costOfSales, kind: 'less' },
    { label: 'Gross profit', value: (x) => x.grossProfit, kind: 'total' },
    { label: 'Expenses', value: () => NaN, kind: 'head' },
    { label: 'Delivery charges (distributors)', value: (x) => -x.deliveryCharges, kind: 'less' },
    ...categories.map((c) => ({ label: c, value: (x: PnL) => -(x.expenses.find((e) => e.category === c)?.inr ?? 0), kind: 'less' as const })),
    { label: 'Total expenses', value: (x) => -(x.deliveryCharges + x.totalExpenses), kind: 'total' },
    { label: p.netProfit >= 0 ? 'Net profit' : 'Net loss', value: (x) => x.netProfit, kind: 'net' },
  ]
}

export default function ProfitLoss() {
  const data = useData()
  const toInr = useToInr()
  const [preset, setPreset] = useState<Preset>('this-month')
  const [custom, setCustom] = useState({ from: todayStr().slice(0, 8) + '01', to: todayStr() })
  const [view, setView] = useState<'statement' | 'months'>('statement')
  const { from, to } = rangeOf(preset, custom)
  const f = from || undefined, t = to || undefined

  const rate = pnlRate(data, f, t)
  const p = useMemo(() => profitAndLoss(data, toInr, f, t, rate), [data, toInr, f, t, rate])
  const months = useMemo(() => monthsIn(data, f, t).map((ym) => ({ ym, p: profitAndLoss(data, toInr, f && f > ym + '-01' ? f : ym + '-01', t && t < ym + '-31' ? t : ym + '-31', rate) })), [data, toInr, f, t, rate])
  const categories = [...new Set([...p.expenses.map((e) => e.category), ...months.flatMap((m) => m.p.expenses.map((e) => e.category))])]
  const L = lines(p, categories)
  const period = from || to ? `${dmy(from) || 'start'} to ${dmy(to) || dmy(todayStr())}` : `all time to ${dmy(todayStr())}`
  const basis = rate ? `Sales valued at Rs ${rate.toFixed(4)} per SAR achieved through Dubai` : "Sales valued at each deal's quoted rate (no exchanges yet)"
  const n2 = (n: number) => (Number.isNaN(n) ? '' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  const stamp = `${from || 'start'}_to_${to || todayStr()}`

  const exportRows = () =>
    view === 'months'
      ? { head: ['', ...months.map((m) => MONTH(m.ym)), 'Total'], body: L.map((l) => [l.label, ...months.map((m) => n2(l.value(m.p))), n2(l.value(p))]) }
      : { head: ['', 'Rs'], body: L.map((l) => [l.label, n2(l.value(p))]) }
  const pdf = () => {
    const r = exportRows()
    exportTablePdf(`Profit & Loss  ·  ${period}`, `${p.deals} deals  ·  ${basis}`, r.head, r.body, undefined, `profit_and_loss_${stamp}`, r.head.map((_, i) => i).slice(1)).catch((e) => toast.error('PDF failed: ' + (e as Error).message))
  }
  const csv = () => {
    const r = exportRows()
    downloadCsv(`profit_and_loss_${stamp}`, [[`Profit & Loss · ${period}`], [basis], r.head, ...r.body])
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period" className="flex-1 sm:max-w-48">
          <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>{Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        {preset === 'custom' && (
          <>
            <Field label="From" className="flex-1 sm:max-w-44"><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
            <Field label="To" className="flex-1 sm:max-w-44"><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
          </>
        )}
        <Field label="Show" className="flex-1 sm:max-w-44">
          <Select value={view} onChange={(e) => setView(e.target.value as 'statement' | 'months')}>
            <option value="statement">Statement</option>
            <option value="months">Month by month</option>
          </Select>
        </Field>
        <span className="flex-1" />
        <div className="flex gap-2">
          <Button onClick={csv}><FileSpreadsheet /> Excel</Button>
          <Button variant="primary" onClick={pdf}><FileDown /> PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Sales" value={money(p.sales, 'INR')} sub={`${p.deals} deals · ${money(p.sar, 'SAR')}`} />
        <Stat label="Gross profit" value={money(p.grossProfit, 'INR')} sub={`${pct(p.grossProfit, p.sales)} of sales`} />
        <Stat label="Expenses" value={<span className="text-neg">− {money(p.deliveryCharges + p.totalExpenses, 'INR')}</span>} sub="incl. delivery charges" />
        <Stat label={p.netProfit >= 0 ? 'Net profit' : 'Net loss'} value={<span className={p.netProfit >= 0 ? 'text-pos' : 'text-neg'}>{money(p.netProfit, 'INR')}</span>} sub={`${pct(p.netProfit, p.sales)} of sales`} />
      </div>

      <Card className="p-0 md:p-0">
        <div className="px-4 pt-4 md:px-5">
          <h3 className="font-bold">Profit &amp; Loss · {period}</h3>
          <p className="text-xs text-muted">{basis.replace('Rs ', '₹')}. Cancelled deals are left out; expenses are counted on the date paid.</p>
        </div>
        {view === 'statement' ? (
          <table className="mt-3 w-full text-sm tabular-nums">
            <tbody>
              {L.map((l) => (
                <Line key={l.label} kind={l.kind} label={l.label}>{l.kind === 'head' ? null : signed(l.value(p))}</Line>
              ))}
            </tbody>
          </table>
        ) : months.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="border-y border-border bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="sticky left-0 bg-surface-2 px-4 py-2 text-left font-semibold md:px-5" />
                  {months.map((m) => <th key={m.ym} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{MONTH(m.ym)}</th>)}
                  <th className="px-3 py-2 text-right font-semibold md:pr-5">Total</th>
                </tr>
              </thead>
              <tbody>
                {L.map((l) => (
                  <tr key={l.label} className={rowClass(l.kind)}>
                    <td className={cn('sticky left-0 bg-surface px-4 py-2 whitespace-nowrap md:px-5', l.kind === 'less' && 'pl-8 text-muted md:pl-9')}>{l.label}</td>
                    {[...months.map((m) => m.p), p].map((x, i) => {
                      const v = l.value(x)
                      return <td key={i} className={cn('px-3 py-2 text-right whitespace-nowrap', i === months.length && 'md:pr-5', l.kind === 'net' && (v >= 0 ? 'text-pos' : 'text-neg'))}>{l.kind === 'head' ? '' : v < 0 ? '− ' + n2(-v) : n2(v)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted md:px-5">Nothing in this period</p>
        )}
      </Card>
    </div>
  )
}

const rowClass = (k: string) => cn(k === 'head' && 'text-xs font-semibold tracking-wider text-muted uppercase', k === 'total' && 'border-t border-border font-semibold', k === 'net' && 'border-t-2 border-border text-base font-bold')

function Line({ kind, label, children }: { kind: string; label: string; children: ReactNode }) {
  return (
    <tr className={rowClass(kind)}>
      <td className={cn('px-4 py-2 md:px-5', kind === 'head' && 'pt-4', kind === 'less' && 'pl-8 text-muted md:pl-9')}>{label}</td>
      <td className={cn('px-4 py-2 text-right whitespace-nowrap md:px-5', kind === 'net' && 'text-pos', kind === 'net' && label === 'Net loss' && 'text-neg')}>{children}</td>
    </tr>
  )
}
