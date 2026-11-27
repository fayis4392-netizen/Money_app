import { ArrowDown, ArrowUp, ArrowUpDown, FileDown, FileSpreadsheet, Files, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useData } from '@/data/store'
import { partyStatement } from '@/domain/derive'
import { dmy, money, todayStr } from '@/domain/format'
import { downloadCsv, exportLedgersPdf, exportTablePdf } from '@/lib/export'
import { cn } from '@/lib/utils'
import { Button, Card, Empty, Field, Input, Select, Stat } from '@/components/ui'

type Show = 'all' | 'receive' | 'pay' | 'clear'
type SortKey = 'name' | 'name_desc' | 'balance' | 'balance_asc' | 'deals' | 'debit'
const n3 = (n: number) => (Math.abs(n) < 0.0005 ? 0 : n).toFixed(3)
const c3 = (n: number) => (Math.abs(n) < 0.0005 ? 0 : n).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
/** Which way the balance runs: we receive (കിട്ടാനുള്ളത്) or we pay (കൊടുക്കാനുള്ളത്). */
const sideOf = (b: number): Exclude<Show, 'all'> => (b > 0.0005 ? 'receive' : b < -0.0005 ? 'pay' : 'clear')
/** Standard statement wording: the balance carries Dr (the customer owes) or Cr (we owe the customer). */
const drCr = (b: number) => (Math.abs(b) < 0.0005 ? '0.000' : `${c3(Math.abs(b))} ${b > 0 ? 'Dr' : 'Cr'}`)
const drCr3 = (b: number) => (Math.abs(b) < 0.0005 ? '0.000' : `${n3(Math.abs(b))} ${b > 0 ? 'Dr' : 'Cr'}`)

function SortIcon({ col, sort }: { col: SortKey | SortKey[]; sort: SortKey }) {
  const cols = Array.isArray(col) ? col : [col]
  if (!cols.includes(sort)) return <ArrowUpDown className="ml-1 inline size-3 opacity-30" />
  if (sort.endsWith('_asc') || sort === 'name') return <ArrowUp className="ml-1 inline size-3 text-accent" />
  return <ArrowDown className="ml-1 inline size-3 text-accent" />
}

/** Saudi customers' SAR accounts at a glance: pick some and download a summary or their full ledgers. */
export default function Statements() {
  const data = useData()
  const [f, setF] = useState({ from: '', to: '', q: '', show: 'all' as Show, sort: 'balance' as SortKey })
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const from = f.from || undefined, to = f.to || undefined
    const unsorted = data.parties
      .filter((p) => p.type === 'saudi_customer')
      .map((p) => {
        const s = partyStatement(data, p.id, 'SAR', from, to)
        const debit = s.rows.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0)
        const credit = -s.rows.filter((r) => r.amount < 0).reduce((t, r) => t + r.amount, 0)
        const deals = data.deals.filter((x) => x.customerId === p.id && x.status !== 'cancelled' && (!from || x.dealDate >= from) && (!to || x.dealDate <= to)).length
        return { p, s, debit, credit, balance: s.totals.balance, deals }
      })
    const sorters: Record<SortKey, (a: typeof unsorted[0], b: typeof unsorted[0]) => number> = {
      name:         (a, b) => a.p.name.localeCompare(b.p.name),
      name_desc:    (a, b) => b.p.name.localeCompare(a.p.name),
      balance:      (a, b) => b.balance - a.balance || a.p.name.localeCompare(b.p.name),
      balance_asc:  (a, b) => a.balance - b.balance || a.p.name.localeCompare(b.p.name),
      deals:        (a, b) => b.deals - a.deals || a.p.name.localeCompare(b.p.name),
      debit:        (a, b) => b.debit - a.debit || a.p.name.localeCompare(b.p.name),
    }
    return [...unsorted].sort(sorters[f.sort])
  }, [data, f.from, f.to, f.sort])

  const q = f.q.trim().toLowerCase()
  const list = rows.filter((r) => (!q || r.p.name.toLowerCase().includes(q) || r.p.phone?.includes(q)) && (f.show === 'all' || sideOf(r.balance) === f.show))
  const chosen = rows.filter((r) => picked.has(r.p.id))
  const allListed = list.length > 0 && list.every((r) => picked.has(r.p.id))
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleAll = () => setPicked((s) => { const n = new Set(s); list.forEach((r) => (allListed ? n.delete(r.p.id) : n.add(r.p.id))); return n })

  /** Toggle between two sort keys: click once → primary sort, click again → reverse */
  const cycleSort = (asc: SortKey, desc: SortKey) => setF((v) => ({ ...v, sort: v.sort === asc ? desc : asc }))

  const period = f.from || f.to ? `${dmy(f.from) || 'start'} to ${dmy(f.to) || dmy(todayStr())}` : `as on ${dmy(f.to || todayStr())}`
  const stamp = `${f.from || 'start'}_to_${f.to || todayStr()}`
  const total = (l: typeof rows) => l.reduce((t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit, balance: t.balance + r.balance, deals: t.deals + r.deals }), { debit: 0, credit: 0, balance: 0, deals: 0 })
  const HEAD = ['#', 'CUSTOMER', 'DEALS', 'DEBIT (SAR)', 'CREDIT (SAR)', 'BALANCE (SAR)']
  const tableRows = (l: typeof rows) => l.map((r, i) => [String(i + 1), r.p.name, String(r.deals), n3(r.debit), n3(r.credit), drCr3(r.balance)])
  const footRow = (l: typeof rows) => { const t = total(l); return ['', 'Total', String(t.deals), n3(t.debit), n3(t.credit), drCr3(t.balance)] }

  const need = () => (chosen.length ? true : (toast.error('Tick at least one customer'), false))
  const summaryPdf = () => need() && exportTablePdf(`Customer balances  ·  ${period}`, `${chosen.length} customer${chosen.length > 1 ? 's' : ''}  ·  Dr = due from you  ·  Cr = due to you`, HEAD, tableRows(chosen), chosen.length > 1 ? footRow(chosen) : undefined, `customer_balances_${stamp}`, [2, 3, 4, 5]).catch((e) => toast.error('PDF failed: ' + (e as Error).message))
  const summaryCsv = () => need() && downloadCsv(`customer_balances_${stamp}`, [[`Customer balances · ${period}`], HEAD, ...tableRows(chosen), footRow(chosen)])
  const ledgersPdf = () => need() && exportLedgersPdf(chosen.map((r) => ({ title: `${r.p.name}  ·  SAR Ledger  ·  ${period}`, s: r.s })), chosen.length === 1 ? `${chosen[0].p.name.replace(/[^\w]+/g, '_')}_statement_${stamp}` : `customer_statements_${stamp}`).catch((e) => toast.error('PDF failed: ' + (e as Error).message))

  const t = total(list)
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">Tick the customers you want, then download a balance summary or their full ledgers to send them. Leave the dates empty for balances as on today.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" className="flex-1 sm:max-w-44"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" className="flex-1 sm:max-w-44"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Show" className="flex-1 sm:max-w-44">
          <Select value={f.show} onChange={(e) => setF({ ...f, show: e.target.value as Show })}>
            <option value="all">All customers</option>
            <option value="receive">Dr balance (owes us)</option>
            <option value="pay">Cr balance (we owe)</option>
            <option value="clear">Zero balance</option>
          </Select>
        </Field>
        <Field label="Sort" className="flex-1 sm:max-w-44">
          <Select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as SortKey })}>
            <option value="name">Name A → Z</option>
            <option value="name_desc">Name Z → A</option>
            <option value="balance">Balance high → low</option>
            <option value="balance_asc">Balance low → high</option>
            <option value="deals">Most deals</option>
            <option value="debit">Most debit</option>
          </Select>
        </Field>
        <Field label="Search" className="min-w-48 flex-1">
          <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" /><Input className="pl-9" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Name or phone" /></div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Customers" value={String(list.length)} sub={`${t.deals} deals`} />
        <Stat label="Debit" value={money(t.debit, 'SAR')} />
        <Stat label="Credit" value={money(t.credit, 'SAR')} />
        <Stat label="Balance" value={<span className={t.balance > 0.0005 ? 'text-pos' : t.balance < -0.0005 ? 'text-neg' : ''}>SAR {drCr(t.balance)}</span>} sub="Dr = owes us · Cr = we owe" />
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <span className="mr-auto text-sm"><b>{chosen.length}</b> selected{chosen.length > 0 && <button className="ml-2 text-xs text-accent" onClick={() => setPicked(new Set())}>clear</button>}</span>
        <Button size="sm" onClick={summaryCsv}><FileSpreadsheet /> Summary Excel</Button>
        <Button size="sm" variant="primary" onClick={summaryPdf}><FileDown /> Summary PDF</Button>
        <Button size="sm" variant="primary" onClick={ledgersPdf}><Files /> Full ledgers PDF</Button>
      </div>

      <Card className="p-0 md:p-0">
        {list.length ? (
          <>
            <div className="overflow-x-auto max-md:hidden">
              <table className="w-full text-sm tabular-nums">
                <thead className="border-b border-border bg-surface-2 text-xs text-muted">
                  <tr>
                    <th className="w-10 px-3 py-2"><input type="checkbox" className="size-4 accent-accent" checked={allListed} onChange={toggleAll} aria-label="Select all" /></th>
                    <th className="cursor-pointer px-3 py-2 text-left font-semibold hover:text-fg" onClick={() => cycleSort('name', 'name_desc')}>
                      Customer <SortIcon col={['name', 'name_desc']} sort={f.sort} />
                    </th>
                    <th className="cursor-pointer px-3 py-2 text-right font-semibold whitespace-nowrap hover:text-fg" onClick={() => cycleSort('deals', 'deals')}>
                      Deals <SortIcon col="deals" sort={f.sort} />
                    </th>
                    <th className="cursor-pointer px-3 py-2 text-right font-semibold hover:text-fg" onClick={() => cycleSort('debit', 'debit')}>
                      Debit <SortIcon col="debit" sort={f.sort} />
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">Credit</th>
                    <th className="cursor-pointer px-3 py-2 text-right font-semibold hover:text-fg" onClick={() => cycleSort('balance', 'balance_asc')}>
                      Balance <SortIcon col={['balance', 'balance_asc']} sort={f.sort} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.p.id} onClick={() => toggle(r.p.id)} className={cn('cursor-pointer border-b border-border hover:bg-surface-2', picked.has(r.p.id) && 'bg-accent-soft')}>
                      <td className="px-3 py-2"><input type="checkbox" className="size-4 accent-accent" checked={picked.has(r.p.id)} onChange={() => toggle(r.p.id)} onClick={(e) => e.stopPropagation()} aria-label={'Select ' + r.p.name} /></td>
                      <td className="px-3 py-2"><Link className="font-semibold text-accent" to={'/parties/' + r.p.id} onClick={(e) => e.stopPropagation()}>{r.p.name}</Link></td>
                      <td className="px-3 py-2 text-right">{r.deals}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{c3(r.debit)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{c3(r.credit)}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold whitespace-nowrap', sideOf(r.balance) === 'receive' ? 'text-pos' : sideOf(r.balance) === 'pay' && 'text-neg')}>{drCr(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              <li className="flex items-center gap-3 px-4 py-2 text-xs text-muted"><input type="checkbox" className="size-4 accent-accent" checked={allListed} onChange={toggleAll} /> Select all</li>
              {list.map((r) => (
                <li key={r.p.id} onClick={() => toggle(r.p.id)} className={cn('flex items-center gap-3 px-4 py-3 text-sm tabular-nums', picked.has(r.p.id) && 'bg-accent-soft')}>
                  <input type="checkbox" className="size-4 shrink-0 accent-accent" checked={picked.has(r.p.id)} onChange={() => toggle(r.p.id)} onClick={(e) => e.stopPropagation()} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.p.name}</div>
                    <div className="text-xs text-muted">{r.deals} deals · Dr {c3(r.debit)} · Cr {c3(r.credit)}</div>
                  </div>
                  <b className={cn('text-right whitespace-nowrap', sideOf(r.balance) === 'receive' ? 'text-pos' : sideOf(r.balance) === 'pay' && 'text-neg')}>{drCr(r.balance)}</b>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty>No customers match</Empty>
        )}
      </Card>
    </div>
  )
}
