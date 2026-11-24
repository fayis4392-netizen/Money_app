import { ArrowLeftRight, FileDown, FileSpreadsheet, HandCoins, Handshake, Landmark, Plus, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { addReceipt, editReceipt, setNarration, voidExpense } from '@/data/actions'
import { VoidDialog } from '@/components/VoidDialog'
import { TransferDialog } from '@/components/transfer/TransferDialog'
import { CapitalDialog } from '@/pages/Capital'
import { ExpenseDialog } from '@/components/expense/ExpenseDialog'
import { useData } from '@/data/store'
import { canCorrect, deriveLines, partyStatement, type PartyLine } from '@/domain/derive'
import { dmy, drcr, f3, fdt, todayStr } from '@/domain/format'
import { OPENING_CURRENCY, PARTY_TYPE_LABEL, type Currency, type Expense, type Party, type Receipt, type Transfer, type TransferKind } from '@/domain/types'
import { exportLedgerCsv, exportLedgerPdf, fileName, type LedgerStyle } from '@/lib/export'
import { attempt, cn } from '@/lib/utils'
import { Badge, Button, Card, Dialog, Empty, Field, Input, ReasonDialog, Select } from '@/components/ui'
import { PartyDialog } from '@/components/party/PartyDialog'
import { useDealDialog } from '@/components/deal/context'

type Row = PartyLine & { balance: number; carriedForward?: boolean }

export default function PartyLedger() {
  const { id = '' } = useParams()
  const data = useData()
  const p = data.parties.find((x) => x.id === id)
  const [range, setRange] = useState({ from: '', to: '' })
  const [editParty, setEditParty] = useState(false)
  const [receipt, setReceipt] = useState<{ edit?: Receipt } | null>(null)
  const [voiding, setVoiding] = useState<Receipt | null>(null)
  const [reword, setReword] = useState<Row | null>(null)
  const [expense, setExpense] = useState<{ edit?: Expense } | null>(null)
  // shortcuts open the normal two-sided forms with this person filled in
  const [transfer, setTransfer] = useState<{ kind: TransferKind; edit?: Transfer; preset?: { fromId?: string; toId?: string } } | null>(null)
  const [voidingTr, setVoidingTr] = useState<Transfer | null>(null)
  const [capital, setCapital] = useState(false)
  const [voidingExp, setVoidingExp] = useState<Expense | null>(null)
  const { correctDeal, newDeal } = useDealDialog()
  // the Dubai agent's AED account shows ₹ and SAR beside each line instead of qty and rate
  const styleFor = (cur: Currency): LedgerStyle => (p?.type === 'dubai_agent' && cur === 'AED' ? 'agent' : 'books')
  // entries that were voided: the original line is struck out, its reversing line shown plainly
  const voided = new Set([...data.receipts, ...data.transfers, ...data.expenses].filter((x) => x.voided).map((x) => x.id))

  const currencies = useMemo(() => {
    if (!p) return []
    const used = new Set(deriveLines(data).filter((l) => l.partyId === id).map((l) => l.currency))
    return (['SAR', 'AED', 'INR'] as Currency[]).filter((c) => used.has(c) || c === OPENING_CURRENCY[p.type])
  }, [data, id, p])

  if (!p) return <Card><Empty>Party not found. <Link className="text-accent" to="/parties">Back to parties</Link></Empty></Card>

  const rowActions = (r: Row) => {
    if (r.carriedForward || r.reversal) return null
    if (r.opening) return <Button size="sm" onClick={() => setEditParty(true)}>Edit</Button>
    if (r.ref.kind === 'receipt') {
      const rc = data.receipts.find((x) => x.id === r.ref.id)!
      if (rc.voided || rc.customerId !== p.id) return <Button size="sm" onClick={() => setReword(r)}>Edit</Button>
      return (
        <>
          <Button size="sm" onClick={() => setReceipt({ edit: rc })}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => setVoiding(rc)}>Void</Button>
        </>
      )
    }
    if (r.ref.kind === 'transfer') {
      const tr = data.transfers.find((x) => x.id === r.ref.id)!
      return tr.voided ? null : (
        <>
          <Button size="sm" onClick={() => setTransfer({ kind: tr.kind, edit: tr })}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => setVoidingTr(tr)}>Void</Button>
        </>
      )
    }
    if (r.ref.kind === 'expense') {
      const ex = data.expenses.find((x) => x.id === r.ref.id)!
      return ex.voided ? null : (
        <>
          <Button size="sm" onClick={() => setExpense({ edit: ex })}>Edit</Button>
          <Button size="sm" variant="danger" onClick={() => setVoidingExp(ex)}>Void</Button>
        </>
      )
    }
    const deal = r.ref.kind === 'deal' ? data.deals.find((x) => x.id === r.ref.id) : undefined
    return (
      <>
        <Button size="sm" onClick={() => setReword(r)} title="Reword the particulars">Edit</Button>
        {deal && deal.customerId === p.id && canCorrect(deal) && <Button size="sm" onClick={() => correctDeal(deal)} title="Correct qty or rate">Correct</Button>}
      </>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted"><Link className="text-accent" to={'/parties?tab=' + p.type}>Parties</Link> / {p.name}</div>
          <h2 className="mt-1 text-xl font-bold">{p.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge>{PARTY_TYPE_LABEL[p.type]}</Badge>
            {p.phone}
            {p.notes && <span>· {p.notes}</span>}
          </div>
        </div>
        <Button onClick={() => setEditParty(true)}>Edit</Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="From" className="flex-1 sm:max-w-44"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To" className="flex-1 sm:max-w-44"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        {(range.from || range.to) && <Button variant="ghost" onClick={() => setRange({ from: '', to: '' })}>Clear dates</Button>}
        <span className="flex-1" />
        <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>button]:flex-1">
          {p.type === 'saudi_customer' && (
            <>
              <Button onClick={() => newDeal({ customerId: p.id })}><Plus /> New deal</Button>
              <Button variant="primary" onClick={() => setReceipt({})}><Plus /> Cash received</Button>
            </>
          )}
          {p.type === 'saudi_collector' && <Button variant="primary" onClick={() => setTransfer({ kind: 'send', preset: { fromId: p.id } })}><Send /> Send SAR to Dubai</Button>}
          {p.type === 'dubai_collector' && (
            <>
              <Button variant="primary" onClick={() => setTransfer({ kind: 'exchange', preset: { fromId: p.id } })}><ArrowLeftRight /> Exchange SAR → AED</Button>
              <Button variant="primary" onClick={() => setTransfer({ kind: 'settle', preset: { fromId: p.id } })}><Handshake /> Settle with agent</Button>
            </>
          )}
          {p.type === 'dubai_agent' && (
            <>
              <Button variant="primary" onClick={() => setTransfer({ kind: 'settle', preset: { toId: p.id } })}><Handshake /> Receive AED (settle)</Button>
              <Button variant="primary" onClick={() => setTransfer({ kind: 'payout', preset: { fromId: p.id } })}><HandCoins /> Pay distributor</Button>
            </>
          )}
          {p.type === 'distributor' && <Button variant="primary" onClick={() => setTransfer({ kind: 'payout', preset: { toId: p.id } })}><HandCoins /> Received from Dubai agent</Button>}
          {p.type === 'operator' && <Button variant="primary" onClick={() => setCapital(true)}><Landmark /> Capital entry</Button>}
          {p.type !== 'saudi_customer' && <Button onClick={() => setExpense({})}><Plus /> Expense</Button>}
        </div>
      </div>

      {(p.edits ?? []).length > 0 && (
        <div className="text-xs text-muted">{p.edits!.map((e) => <div key={e.at}>{fdt(e.at)} · {e.what}: {e.from} → {e.to}</div>)}</div>
      )}

      {currencies.map((cur) => {
        const s = partyStatement(data, id, cur, range.from || undefined, range.to || undefined)
        const title = `${p.name}  ·  ${cur} Ledger${range.from || range.to ? `  ·  ${dmy(range.from) || 'start'} to ${dmy(range.to) || dmy(todayStr())}` : ''}`
        const name = fileName(p.name, cur, range.from, range.to)
        return (
          <Card key={cur} className="p-0 md:p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 md:px-5">
              <h3 className="font-bold">{cur} ledger</h3>
              <div className="text-sm">Balance <b className={cn('tabular-nums', s.totals.balance > 0.0005 ? 'text-pos' : s.totals.balance < -0.0005 ? 'text-neg' : '')}>{cur} {drcr(s.totals.balance)}</b></div>
            </div>
            {s.rows.length ? <LedgerTable rows={s.rows as Row[]} totals={s.totals} actions={rowActions} receipts={data.receipts} voided={voided} style={styleFor(cur)} /> : <Empty>No entries in this period</Empty>}
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3 md:px-5">
              <Button size="sm" onClick={() => exportLedgerCsv(title, s, name, styleFor(cur))}><FileSpreadsheet /> Excel (CSV)</Button>
              <Button size="sm" variant="primary" onClick={() => exportLedgerPdf(title, s, name, styleFor(cur)).catch((e) => toast.error('PDF failed: ' + (e as Error).message))}><FileDown /> PDF</Button>
            </div>
          </Card>
        )
      })}

      <TransferDialog open={!!transfer} kind={transfer?.kind ?? 'send'} edit={transfer?.edit} preset={transfer?.preset} onClose={() => setTransfer(null)} />
      <VoidDialog target={voidingTr && { kind: 'transfer', id: voidingTr.id }} no={voidingTr?.no} onClose={() => setVoidingTr(null)} />
      <CapitalDialog open={capital} partyId={p.id} onClose={() => setCapital(false)} />
      <ExpenseDialog open={!!expense} edit={expense?.edit} paidById={p.id} onClose={() => setExpense(null)} />
      <ReasonDialog open={!!voidingExp} title={`Void ${voidingExp?.no ?? ''}`} message="The expense stays on the ledger, struck out, with a reversing line." confirm="Void expense" danger onClose={() => setVoidingExp(null)} onConfirm={(r) => attempt(() => voidExpense(voidingExp!.id, r), 'Expense voided')} />
      <PartyDialog open={editParty} type={p.type} party={p} onClose={() => setEditParty(false)} />
      <ReceiptDialog open={!!receipt} customer={p} edit={receipt?.edit} onClose={() => setReceipt(null)} />
      <VoidDialog target={voiding && { kind: 'receipt', id: voiding.id }} no={voiding?.receiptNo} onClose={() => setVoiding(null)} />
      <Dialog open={!!reword} onClose={() => setReword(null)} title="Edit particulars" footer={<><Button onClick={() => setReword(null)}>Cancel</Button><Button variant="primary" type="submit" form="reword-form">Save</Button></>}>
        {reword && (
          <form id="reword-form" className="grid gap-3" onSubmit={(e) => { e.preventDefault(); const t = String(new FormData(e.currentTarget).get('text')); if (attempt(() => setNarration(reword.key, t), 'Particulars updated')) setReword(null) }}>
            <Field label="Particulars"><Input name="text" defaultValue={reword.particulars} required autoFocus /></Field>
            <p className="text-xs text-muted">Only the wording changes. Amounts, qty and rate come from the deal or receipt and stay locked; correct those at the source.</p>
          </form>
        )}
      </Dialog>
    </div>
  )
}

function LedgerTable({ rows, totals, actions, receipts, voided, style }: { rows: Row[]; totals: { qty: number; debit: number; credit: number; balance: number }; actions: (r: Row) => React.ReactNode; receipts: Receipt[]; voided: Set<string>; style: LedgerStyle }) {
  const agent = style === 'agent'
  const col3 = (r: Row) => (agent ? (r.inr != null ? (r.inrEstimated ? '≈ ' : '') + '₹' + r.inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '') : r.qty ? f3(r.qty) : '')
  const col4 = (r: Row) => (agent ? (r.sarEq != null ? f3(r.sarEq) : '') : r.rate ? f3(r.rate) : '')
  const struck = (r: Row) => !r.reversal && voided.has(r.ref.id)
  const sub = (r: Row) => {
    const label = r.sub
    if (!label) return null
    return r.ref.kind === 'deal' ? <Link className="text-accent" to={'/deals/' + r.ref.id}>{label}</Link> : <span>{label}</span>
  }
  const tags = (r: Row) => {
    const rc = r.ref.kind === 'receipt' ? receipts.find((x) => x.id === r.ref.id) : undefined
    const hist = rc?.edits.map((e) => `${fdt(e.at)}: ${e.changes.join(', ')} — ${e.reason}`).join('\n')
    return (
      <>
        {(r.reworded || (rc && rc.edits.length > 0 && !r.reversal)) && <Badge className="ml-1" title={hist || 'Particulars reworded'}>edited</Badge>}
        {struck(r) && <Badge className="ml-1 bg-red-500/15 text-red-600 no-underline dark:text-red-300">voided</Badge>}
      </>
    )
  }
  return (
    <>
      {/* desktop: the book layout */}
      <div className="overflow-x-auto max-md:hidden">
        <table className="mt-3 w-full text-sm tabular-nums">
          <thead className="border-y border-border bg-surface-2 text-xs text-muted">
            <tr>{['Date', 'Particulars', agent ? '₹' : 'Qty', agent ? 'SAR' : 'Rate', 'Credit', 'Debit', 'Balance', ''].map((h, i) => <th key={i} className={cn('px-3 py-2 font-semibold whitespace-nowrap', i > 1 ? 'text-right' : 'text-left')}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={cn('border-b border-border', r.opening && 'bg-surface-2/60', struck(r) && 'text-muted line-through decoration-muted/60', r.reversal && 'text-muted italic')}>
                <td className="px-3 py-2 whitespace-nowrap">{r.opening ? '' : dmy(r.date)}</td>
                <td className="px-3 py-2">{r.particulars}{tags(r)}<div className="text-xs text-muted no-underline">{sub(r)}</div></td>
                <td className="px-3 py-2 text-right whitespace-nowrap" title={r.inrEstimated ? "Estimated at the agent's average rate" : undefined}>{col3(r)}</td>
                <td className="px-3 py-2 text-right">{col4(r)}</td>
                <td className="px-3 py-2 text-right">{r.amount < 0 ? f3(-r.amount) : ''}</td>
                <td className="px-3 py-2 text-right">{r.amount > 0 ? f3(r.amount) : ''}</td>
                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{drcr(r.balance)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap [&>button+button]:ml-1">{actions(r)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-bold">
            <tr><td /><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{!agent && totals.qty ? f3(totals.qty) : ''}</td><td /><td className="px-3 py-2 text-right">{f3(totals.credit)}</td><td className="px-3 py-2 text-right">{f3(totals.debit)}</td><td className="px-3 py-2 text-right whitespace-nowrap">{drcr(totals.balance)}</td><td /></tr>
          </tfoot>
        </table>
      </div>
      {/* phone: one card per line */}
      <ul className="mt-3 divide-y divide-border border-t border-border md:hidden">
        {rows.map((r) => (
          <li key={r.key} className={cn('grid gap-1 px-4 py-3 text-sm tabular-nums', r.opening && 'bg-surface-2/60', (struck(r) || r.reversal) && 'text-muted', struck(r) && 'line-through')}>
            <div className="flex justify-between gap-3"><span className="text-xs text-muted">{r.opening ? 'Opening' : dmy(r.date)}</span><b>{drcr(r.balance)}</b></div>
            {!r.opening && <div>{r.particulars}{tags(r)}</div>}
            {r.sub && <div className="text-xs text-muted">{sub(r)}</div>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted">
                {agent ? (r.inr != null ? `${col3(r)} · SAR ${col4(r)} · ` : '') : r.qty ? `${f3(r.qty)} × ${f3(r.rate ?? 0)} · ` : ''}
                {r.amount < 0 ? <span className="text-pos">Credit {f3(-r.amount)}</span> : <span>Debit {f3(r.amount)}</span>}
              </span>
              <span className="flex gap-1">{actions(r)}</span>
            </div>
          </li>
        ))}
        <li className="flex justify-between bg-surface-2/60 px-4 py-3 text-sm font-bold tabular-nums"><span>Total{totals.qty ? ` · qty ${f3(totals.qty)}` : ''}</span><span>Cr {f3(totals.credit)} · Dr {f3(totals.debit)}</span></li>
      </ul>
    </>
  )
}

function ReceiptDialog({ open, customer, edit, onClose }: { open: boolean; customer: Party; edit?: Receipt; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={(edit ? `Edit ${edit.receiptNo}` : 'Cash received') + ' · ' + customer.name} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="receipt-form">{edit ? 'Save changes' : 'Save'}</Button></>}>
      {open && <ReceiptForm customer={customer} edit={edit} onDone={onClose} />}
    </Dialog>
  )
}

function ReceiptForm({ customer, edit, onDone }: { customer: Party; edit?: Receipt; onDone: () => void }) {
  const data = useData()
  const collectors = data.parties.filter((x) => x.type === 'saudi_collector' && x.active)
  const [f, setF] = useState({ date: edit?.date ?? todayStr(), amount: edit ? String(edit.amount) : '', collectorId: edit?.collectorId ?? collectors[0]?.id ?? '', narration: edit?.narration ?? '', note: edit?.note ?? '', reason: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <form
      id="receipt-form"
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const ok = edit ? attempt(() => editReceipt(edit.id, { ...f, customerId: customer.id }, f.reason), 'Entry updated · change logged') : attempt(() => addReceipt({ ...f, customerId: customer.id }), 'Cash received recorded')
        if (ok) onDone()
      }}
    >
      <Field label="Date"><Input type="date" value={f.date} onChange={set('date')} required /></Field>
      <Field label="Amount (SAR)"><Input type="number" step="any" min={0} inputMode="decimal" value={f.amount} onChange={set('amount')} required autoFocus /></Field>
      <Field label="Received by">
        <Select value={f.collectorId} onChange={set('collectorId')} required>
          <option value="">{collectors.length ? 'Choose' : 'Add a Saudi collector first'}</option>
          {collectors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Particulars"><Input value={f.narration} onChange={set('narration')} placeholder={data.settings.receiptNarration} /></Field>
      <Field className="col-span-2" label="Note"><Input value={f.note} onChange={set('note')} placeholder="optional" /></Field>
      {edit && <Field className="col-span-2" label="Reason for change"><Input value={f.reason} onChange={set('reason')} required placeholder="Kept in the edit history" /></Field>}
    </form>
  )
}
