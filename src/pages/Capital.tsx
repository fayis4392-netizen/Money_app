import { ArrowLeftRight, FileDown, HandCoins, Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { capitalEntry } from '@/data/actions'
import { useData } from '@/data/store'
import { dmy, money, todayStr } from '@/domain/format'
import { ownerAccount } from '@/domain/owner'
import type { CapitalKind, Currency } from '@/domain/types'
import { exportLedgerPdf } from '@/lib/export'
import { attempt, cn } from '@/lib/utils'
import { Button, Card, CardHeader, Dialog, Empty, Field, Input, Select, Stat } from '@/components/ui'

const KIND: Record<CapitalKind, string> = { add: 'Capital put in', withdraw: 'Capital taken back', drawings: 'Profit taken', transfer: 'Moved' }
const inr = (n: number) => money(n, 'INR')

/** The owner's account: capital in, profit earned, profit taken, and what's left in the business. */
export default function Capital() {
  const data = useData()
  const today = todayStr()
  const o = useMemo(() => ownerAccount(data, today), [data, today])
  const [open, setOpen] = useState<CapitalKind | null>(null)
  const name = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? '—'
  const rows = o.statement.rows as (typeof o.statement.rows[number] & { sub?: string })[]

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Profit the owner doesn't take stays in the business and keeps working. When he takes it, record it here as <b className="text-fg">Profit taken</b>: "profit left" goes down to zero, and what remains is his capital.
      </p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Owner's total in the business" value={inr(o.balance)} sub="capital + profit not taken" />
        <Stat label="Capital" value={inr(o.openings + o.capitalIn - o.capitalOut)} sub={o.openings ? `incl. ${inr(o.openings)} from the old books` : 'put in − taken back'} />
        <Stat label="Profit earned" value={<span className={o.profit >= 0 ? 'text-pos' : 'text-neg'}>{inr(o.profit)}</span>} sub={<>after expenses · <Link className="text-accent" to="/profit-loss">P&amp;L</Link></>} />
        <Stat label="Profit left to take" value={<span className={o.profitLeft >= 0 ? 'text-pos' : 'text-neg'}>{inr(o.profitLeft)}</span>} sub={`${inr(o.taken)} taken so far`} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setOpen('drawings')}><HandCoins /> Take profit</Button>
        <Button onClick={() => setOpen('add')}><Plus /> Put in capital</Button>
        <Button onClick={() => setOpen('withdraw')}><Minus /> Take back capital</Button>
        <Button onClick={() => setOpen('transfer')}><ArrowLeftRight /> Move money between holders</Button>
      </div>

      <Card className="p-0 md:p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 md:px-5">
          <CardHeader title="Owner's ledger" sub="In ₹, at the rates achieved through Dubai. Cr = the business owes the owner." />
          <Button size="sm" onClick={() => exportLedgerPdf(`Owner's account  ·  as on ${dmy(today)}`, o.statement, `owner_account_${today}`).catch((e) => toast.error('PDF failed: ' + (e as Error).message))}><FileDown /> PDF</Button>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm tabular-nums">
              <thead className="border-y border-border bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold md:px-5">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Particulars</th>
                  <th className="px-3 py-2 text-right font-semibold">Out to owner</th>
                  <th className="px-3 py-2 text-right font-semibold">In for owner</th>
                  <th className="px-4 py-2 text-right font-semibold md:px-5">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border">
                    <td className="px-4 py-2 whitespace-nowrap md:px-5">{dmy(r.date.slice(0, 10))}</td>
                    <td className="px-3 py-2">{r.particulars}{r.sub && <div className="text-xs text-muted">{r.sub}</div>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.amount > 0 ? inr(r.amount) : ''}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.amount < 0 ? inr(-r.amount) : ''}</td>
                    <td className="px-4 py-2 text-right font-semibold whitespace-nowrap md:px-5">{inr(Math.abs(r.balance))} {r.balance < -0.005 ? 'Cr' : r.balance > 0.005 ? 'Dr' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing yet. Put in capital, or the first month's profit will appear here.</Empty>
        )}
      </Card>

      <Card className="p-0 md:p-0">
        <div className="px-4 pt-4 md:px-5"><CardHeader title="Capital register" sub="Each entry, in its own currency, and who held the money" /></div>
        {data.capital.length ? (
          <ul className="divide-y divide-border border-t border-border">
            {[...data.capital].reverse().map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm tabular-nums md:px-5">
                <span className="w-24 text-xs text-muted">{dmy(c.date)} · {c.entryNo}</span>
                <span className="min-w-0 flex-1">{KIND[c.kind]} · <Link className="text-accent" to={'/parties/' + c.partyId}>{name(c.partyId)}</Link>{c.toPartyId && <> → <Link className="text-accent" to={'/parties/' + c.toPartyId}>{name(c.toPartyId)}</Link></>}{c.note && <span className="text-muted"> · {c.note}</span>}</span>
                <b className={cn(c.kind === 'add' && 'text-pos', (c.kind === 'withdraw' || c.kind === 'drawings') && 'text-neg')}>{c.kind === 'withdraw' || c.kind === 'drawings' ? '− ' : ''}{money(c.amount, c.currency)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No entries yet.</Empty>
        )}
      </Card>
      <CapitalDialog open={!!open} kind={open ?? undefined} profitLeft={o.profitLeft} onClose={() => setOpen(null)} />
    </div>
  )
}

const TITLE: Record<CapitalKind, string> = { add: 'Put in capital', withdraw: 'Take back capital', drawings: 'Take profit', transfer: 'Move money between holders' }

/** Capital / profit entry form; `partyId` preselects who holds the money (e.g. from their ledger). */
export function CapitalDialog({ open, partyId, kind, profitLeft, onClose }: { open: boolean; partyId?: string; kind?: CapitalKind; profitLeft?: number; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={kind ? TITLE[kind] : 'Capital entry'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="capital-form">Save</Button></>}>
      {open && <CapitalForm key={kind} partyId={partyId} kind={kind} profitLeft={profitLeft} onDone={onClose} />}
    </Dialog>
  )
}

function CapitalForm({ partyId, kind, profitLeft, onDone }: { partyId?: string; kind?: CapitalKind; profitLeft?: number; onDone: () => void }) {
  const data = useData()
  const holders = data.parties.filter((p) => p.active && p.type !== 'saudi_customer')
  const [f, setF] = useState({ kind: kind ?? ('add' as CapitalKind), amount: '', currency: 'INR' as Currency, partyId: partyId ?? holders.find((p) => p.type === 'operator')?.id ?? '', toPartyId: '', date: todayStr(), note: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value } as typeof f)
  const out = f.kind === 'withdraw' || f.kind === 'drawings'
  return (
    <form id="capital-form" className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (attempt(() => capitalEntry(f), f.kind === 'drawings' ? 'Profit taken recorded' : 'Entry saved')) onDone() }}>
      <Field label="Type">
        <Select value={f.kind} onChange={set('kind')}>
          <option value="drawings">Take profit</option>
          <option value="add">Put in capital</option>
          <option value="withdraw">Take back capital</option>
          <option value="transfer">Move between holders</option>
        </Select>
      </Field>
      <Field label="Date"><Input type="date" value={f.date} onChange={set('date')} required /></Field>
      <Field label="Amount"><Input type="number" step="any" min={0} inputMode="decimal" value={f.amount} onChange={set('amount')} required autoFocus /></Field>
      <Field label="Currency"><Select value={f.currency} onChange={set('currency')}><option>INR</option><option>SAR</option><option>AED</option></Select></Field>
      <Field label={f.kind === 'add' ? 'Held by' : out ? 'Paid out of (who gives it to the owner)' : 'From'} className={f.kind === 'transfer' ? '' : 'col-span-2'}>
        <Select value={f.partyId} onChange={set('partyId')} required><option value="">Choose</option>{holders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      </Field>
      {f.kind === 'transfer' && <Field label="To"><Select value={f.toPartyId} onChange={set('toPartyId')} required><option value="">Choose</option>{holders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
      {f.kind === 'drawings' && profitLeft != null && (
        <p className="col-span-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          Profit left to take: <b className="text-fg">{money(profitLeft, 'INR')}</b>. Taking more than this eats into the capital.
        </p>
      )}
      <Field label="Note" className="col-span-2"><Input value={f.note} onChange={set('note')} placeholder={f.kind === 'drawings' ? 'optional, e.g. November profit' : 'optional, e.g. float for Kerala payouts'} /></Field>
    </form>
  )
}
