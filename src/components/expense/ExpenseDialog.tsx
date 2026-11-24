import { useState } from 'react'
import { addExpense, editExpense } from '@/data/actions'
import { useData } from '@/data/store'
import { todayStr } from '@/domain/format'
import { DEFAULT_EXPENSE_CATEGORIES, OPENING_CURRENCY, PARTY_TYPE_LABEL, type Currency, type Expense } from '@/domain/types'
import { attempt } from '@/lib/utils'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'

/** Add or edit an expense. `paidById` preselects who paid (e.g. from their ledger page). */
export function ExpenseDialog({ open, edit, paidById, onClose }: { open: boolean; edit?: Expense; paidById?: string; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={edit ? `Edit ${edit.no}` : 'Expense'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="expense-form">{edit ? 'Save changes' : 'Save'}</Button></>}
    >
      {open && <ExpenseForm edit={edit} paidById={paidById} onDone={onClose} />}
    </Dialog>
  )
}

function ExpenseForm({ edit, paidById, onDone }: { edit?: Expense; paidById?: string; onDone: () => void }) {
  const data = useData()
  const payers = data.parties.filter((p) => p.active && p.type !== 'saudi_customer')
  const curOf = (id: string) => OPENING_CURRENCY[data.parties.find((p) => p.id === id)?.type ?? 'operator']
  const first = edit?.paidById ?? paidById ?? payers.find((p) => p.type === 'saudi_collector')?.id ?? payers[0]?.id ?? ''
  const [f, setF] = useState({
    date: edit?.date ?? todayStr(),
    paidById: first,
    currency: (edit?.currency ?? (first ? curOf(first) : 'SAR')) as Currency,
    amount: edit ? String(edit.amount) : '',
    category: edit?.category ?? '',
    note: edit?.note ?? '',
    reason: '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value } as typeof f)
  // categories: the defaults plus any typed before
  const categories = [...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...data.expenses.map((e) => e.category)])]

  return (
    <form
      id="expense-form"
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (edit ? attempt(() => editExpense(edit.id, f, f.reason), 'Expense updated · change logged') : attempt(() => addExpense(f), 'Expense recorded')) onDone()
      }}
    >
      <Field label="Date"><Input type="date" value={f.date} onChange={set('date')} required /></Field>
      <Field label="Paid by">
        <Select value={f.paidById} onChange={(e) => setF({ ...f, paidById: e.target.value, currency: edit ? f.currency : curOf(e.target.value) })} required>
          <option value="">Choose</option>
          {payers.map((p) => <option key={p.id} value={p.id}>{p.name} · {PARTY_TYPE_LABEL[p.type]}</option>)}
        </Select>
      </Field>
      <Field label="Amount"><Input type="number" step="any" min={0} inputMode="decimal" value={f.amount} onChange={set('amount')} required autoFocus /></Field>
      <Field label="Currency"><Select value={f.currency} onChange={set('currency')}><option>SAR</option><option>AED</option><option value="INR">INR (₹)</option></Select></Field>
      <Field label="Category" className="col-span-2" hint="Pick one or type a new one">
        <Input list="expense-categories" value={f.category} onChange={set('category')} required placeholder="e.g. Transport" />
        <datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <div className="col-span-2 -mt-1 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button type="button" key={c} onClick={() => setF({ ...f, category: c })} className={'rounded-full border px-2.5 py-1 text-xs font-semibold ' + (f.category === c ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-fg')}>{c}</button>
        ))}
      </div>
      <Field label="Note" className="col-span-2"><Input value={f.note} onChange={set('note')} placeholder="optional, e.g. taxi to Dubai collector" /></Field>
      {edit && <Field label="Reason for change" className="col-span-2"><Input value={f.reason} onChange={set('reason')} required placeholder="Kept in the edit history" /></Field>}
      <p className="col-span-2 text-xs text-muted">This comes out of what the payer holds for you. If they paid from their own pocket, their ledger will show you owe it back.</p>
    </form>
  )
}
