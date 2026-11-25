import { FileSpreadsheet, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { voidExpense } from '@/data/actions'
import { useData } from '@/data/store'
import { expenseTotals } from '@/domain/expenses'
import { dmy, fdt, money, todayStr } from '@/domain/format'
import type { Expense } from '@/domain/types'
import { downloadCsv } from '@/lib/export'
import { useToInr } from '@/lib/useToInr'
import { attempt, cn } from '@/lib/utils'
import { Badge, Button, Card, CardHeader, Empty, Field, Input, ReasonDialog, Select, Stat } from '@/components/ui'
import { DISTRIBUTOR_CHARGE } from '@/domain/types'
import { ExpenseDialog } from '@/components/expense/ExpenseDialog'

export default function Expenses() {
  const data = useData()
  const toInr = useToInr()
  const [f, setF] = useState(() => ({ from: todayStr().slice(0, 8) + '01', to: '', category: '', paidBy: '' }))
  const [dialog, setDialog] = useState<{ edit?: Expense; category?: string } | null>(null)
  const [voiding, setVoiding] = useState<Expense | null>(null)
  const name = (id: string) => data.parties.find((p) => p.id === id)?.name ?? '—'
  const totals = expenseTotals(data.expenses, toInr, f.from || undefined, f.to || undefined)
  const list = data.expenses
    .filter((e) => (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to) && (!f.category || e.category === f.category) && (!f.paidBy || e.paidById === f.paidBy))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))
  const categories = [...new Set(data.expenses.map((e) => e.category))].sort()
  const payers = [...new Set(data.expenses.map((e) => e.paidById))]
  const top = [...totals.byCategory.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <Field label="From" className="flex-1 sm:max-w-40"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" className="flex-1 sm:max-w-40"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Category" className="flex-1 sm:max-w-44"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Paid by" className="flex-1 sm:max-w-48"><Select value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })}><option value="">Everyone</option>{payers.map((id) => <option key={id} value={id}>{name(id)}</option>)}</Select></Field>
        <span className="flex-1 max-sm:hidden" />
        <Button className="max-sm:col-span-2" onClick={() => setDialog({ category: DISTRIBUTOR_CHARGE })}><Plus /> Distributor charge</Button>
        <Button variant="primary" className="max-sm:col-span-2" onClick={() => setDialog({})}><Plus /> Expense</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Expenses in period" value={<span className="text-neg">{money(totals.inr, 'INR')}</span>} sub={`${totals.list.length} entries · SAR/AED at today's rates`} />
        {top.slice(0, 3).map(([c, v]) => <Stat key={c} label={c} value={money(v, 'INR')} sub={totals.inr ? Math.round((v / totals.inr) * 100) + '% of expenses' : ''} />)}
      </div>

      <Card className="p-0 md:p-0">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5">
          <CardHeader title="Expenses" sub="Each comes out of what the payer holds for you" />
          <Button size="sm" onClick={() => downloadCsv(`expenses_${f.from || 'start'}_${f.to || 'today'}`, [['No', 'Date', 'Paid by', 'Category', 'Currency', 'Amount', '₹ value', 'Note', 'Voided'], ...list.map((e) => [e.no, e.date, name(e.paidById), e.category, e.currency, e.amount.toFixed(3), toInr(e.amount, e.currency).toFixed(2), e.note, e.voided ? e.voided.reason : ''])])}><FileSpreadsheet /> Excel (CSV)</Button>
        </div>
        {list.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {list.map((e) => (
              <li key={e.id} className={cn('grid gap-1 px-4 py-3 text-sm tabular-nums md:grid-cols-[120px_1fr_auto_auto] md:items-center md:gap-4 md:px-5', e.voided && 'text-muted')}>
                <span className="text-xs text-muted">{dmy(e.date)} · {e.no}</span>
                <span className={cn(e.voided && 'line-through')}>
                  <Badge>{e.category}</Badge> <Link className="text-accent" to={'/parties/' + e.paidById}>{name(e.paidById)}</Link>{e.note && <span className="text-muted"> · {e.note}</span>}
                  {e.edits.length > 0 && !e.voided && <Badge className="ml-1" title={e.edits.map((x) => `${fdt(x.at)}: ${x.changes.join(', ')} — ${x.reason}`).join('\n')}>edited</Badge>}
                </span>
                <b className={cn('md:text-right', e.voided && 'line-through')}>{money(e.amount, e.currency)}{e.currency !== 'INR' && <span className="block text-xs font-normal text-muted">≈ {money(toInr(e.amount, e.currency), 'INR')}</span>}</b>
                <span className="flex gap-1 md:justify-end">
                  {e.voided ? <span className="text-xs">voided: {e.voided.reason}</span> : <><Button size="sm" onClick={() => setDialog({ edit: e })}>Edit</Button><Button size="sm" variant="danger" onClick={() => setVoiding(e)}>Void</Button></>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No expenses in this period.</Empty>
        )}
      </Card>

      <ExpenseDialog open={!!dialog} edit={dialog?.edit} category={dialog?.category} onClose={() => setDialog(null)} />
      <ReasonDialog open={!!voiding} title={`Void ${voiding?.no ?? ''}`} message="The expense stays in the list, struck out, and the payer's ledger is put back." confirm="Void expense" danger onClose={() => setVoiding(null)} onConfirm={(r) => attempt(() => voidExpense(voiding!.id, r), 'Expense voided')} />
    </div>
  )
}
