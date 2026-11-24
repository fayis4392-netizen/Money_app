import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { capitalEntry } from '@/data/actions'
import { useData } from '@/data/store'
import { balances, dealProfit } from '@/domain/derive'
import { expenseTotals } from '@/domain/expenses'
import { achievedRates, actualProfit } from '@/domain/transfers'
import { dmy, money, todayStr } from '@/domain/format'
import type { CapitalKind, Currency } from '@/domain/types'
import { attempt, cn } from '@/lib/utils'
import { useToInr } from '@/lib/useToInr'
import { Button, Card, CardHeader, Dialog, Empty, Field, Input, Select, Stat } from '@/components/ui'

const KIND: Record<CapitalKind, string> = { add: 'Capital added', withdraw: 'Capital withdrawn', transfer: 'Moved' }

export default function Capital() {
  const data = useData()
  const toInr = useToInr()
  const [open, setOpen] = useState(false)
  const k = useMemo(() => {
    const inv = data.capital.reduce((t, c) => t + (c.kind === 'add' ? 1 : c.kind === 'withdraw' ? -1 : 0) * toInr(c.amount, c.currency), 0)
    const live = data.deals.filter((d) => d.status !== 'cancelled')
    // delivered deals, valued at the ₹-per-SAR actually achieved through Dubai; the rest estimated at their own rates
    const done = live.filter((d) => d.status === 'completed')
    const realised = actualProfit(done, achievedRates(data.transfers).inrPerSar, 0)?.inr ?? done.reduce((t, d) => t + dealProfit(d, 0).inr, 0)
    const estimated = live.filter((d) => d.status !== 'completed').reduce((t, d) => t + dealProfit(d, 0).inr, 0)
    const bal = balances(data)
    const held = data.parties.filter((p) => p.type === 'operator').reduce((t, p) => t + (['SAR', 'AED', 'INR'] as Currency[]).reduce((u, c) => u + toInr(bal[p.id]?.[c] ?? 0, c), 0), 0)
    const expenses = expenseTotals(data.expenses, toInr).inr
    return { inv, realised, estimated, held, expenses }
  }, [data, toInr])
  const name = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? '—'

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Stat label="Capital invested" value={money(k.inv, 'INR')} sub={`${data.capital.filter((c) => c.kind !== 'transfer').length} entries`} />
        <Stat label="Profit realised" value={<span className="text-pos">{money(k.realised, 'INR')}</span>} sub="delivered deals, at achieved rates" />
        <Stat label="Profit expected" value={money(k.estimated, 'INR')} sub="deals not delivered yet" />
        <Stat label="Expenses" value={<span className="text-neg">{money(k.expenses, 'INR')}</span>} sub={<Link className="text-accent" to="/expenses">see all</Link>} />
        <Stat label="Net profit so far" value={<span className={k.realised - k.expenses >= 0 ? 'text-pos' : 'text-neg'}>{money(k.realised - k.expenses, 'INR')}</span>} sub="realised − expenses" />
        <Stat label="Operator cash in hand" value={money(k.held, 'INR')} sub="SAR/AED at today's rates" />
      </div>
      <Card className="p-0 md:p-0">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5">
          <CardHeader title="Capital register" sub="Money the operator puts in, takes out, or moves between people holding it" />
          <Button variant="primary" onClick={() => setOpen(true)}><Plus /> Entry</Button>
        </div>
        {data.capital.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {[...data.capital].reverse().map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm tabular-nums md:px-5">
                <span className="w-24 text-xs text-muted">{dmy(c.date)} · {c.entryNo}</span>
                <span className="min-w-0 flex-1">{KIND[c.kind]} · <Link className="text-accent" to={'/parties/' + c.partyId}>{name(c.partyId)}</Link>{c.toPartyId && <> → <Link className="text-accent" to={'/parties/' + c.toPartyId}>{name(c.toPartyId)}</Link></>}{c.note && <span className="text-muted"> · {c.note}</span>}</span>
                <b className={cn(c.kind === 'add' && 'text-pos', c.kind === 'withdraw' && 'text-neg')}>{c.kind === 'withdraw' ? '− ' : ''}{money(c.amount, c.currency)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No capital entries yet.</Empty>
        )}
      </Card>
      <CapitalDialog open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

/** Capital entry form; `partyId` preselects who holds the money (e.g. from their ledger). */
export function CapitalDialog({ open, partyId, onClose }: { open: boolean; partyId?: string; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Capital entry" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="capital-form">Save</Button></>}>
      {open && <CapitalForm partyId={partyId} onDone={onClose} />}
    </Dialog>
  )
}

function CapitalForm({ partyId, onDone }: { partyId?: string; onDone: () => void }) {
  const data = useData()
  const holders = data.parties.filter((p) => p.active && p.type !== 'saudi_customer')
  const [f, setF] = useState({ kind: 'add' as CapitalKind, amount: '', currency: 'INR' as Currency, partyId: partyId ?? holders.find((p) => p.type === 'operator')?.id ?? '', toPartyId: '', date: todayStr(), note: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value } as typeof f)
  return (
    <form id="capital-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (attempt(() => capitalEntry(f), 'Capital entry saved')) onDone() }}>
      <Field label="Type">
        <Select value={f.kind} onChange={set('kind')}>
          <option value="add">Add capital</option>
          <option value="withdraw">Withdraw capital</option>
          <option value="transfer">Move between holders</option>
        </Select>
      </Field>
      <Field label="Date"><Input type="date" value={f.date} onChange={set('date')} required /></Field>
      <Field label="Amount"><Input type="number" step="any" min={0} inputMode="decimal" value={f.amount} onChange={set('amount')} required autoFocus /></Field>
      <Field label="Currency"><Select value={f.currency} onChange={set('currency')}><option>INR</option><option>SAR</option><option>AED</option></Select></Field>
      <Field label={f.kind === 'add' ? 'Held by' : 'From'} className={f.kind === 'transfer' ? '' : 'col-span-2'}>
        <Select value={f.partyId} onChange={set('partyId')} required><option value="">Choose</option>{holders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      </Field>
      {f.kind === 'transfer' && <Field label="To"><Select value={f.toPartyId} onChange={set('toPartyId')} required><option value="">Choose</option>{holders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
      <Field label="Note" className="col-span-2"><Input value={f.note} onChange={set('note')} placeholder="optional, e.g. float for Kerala payouts" /></Field>
    </form>
  )
}
