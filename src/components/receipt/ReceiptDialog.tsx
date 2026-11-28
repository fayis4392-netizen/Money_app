import { useState } from 'react'
import { addReceipt, editReceipt } from '@/data/actions'
import { useData } from '@/data/store'
import { todayStr } from '@/domain/format'
import type { Party, Receipt } from '@/domain/types'
import { attempt } from '@/lib/utils'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'

export function ReceiptDialog({ open, customer, edit, onClose }: { open: boolean; customer?: Party; edit?: Receipt; onClose: () => void }) {
  const title = edit
    ? `Edit ${edit.receiptNo}${customer ? ' · ' + customer.name : ''}`
    : customer
      ? `Cash received · ${customer.name}`
      : 'Cash received'
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="receipt-form">{edit ? 'Save changes' : 'Save'}</Button></>}
    >
      {open && <ReceiptForm key={edit?.id ?? customer?.id ?? 'new'} customer={customer} edit={edit} onDone={onClose} />}
    </Dialog>
  )
}

function ReceiptForm({ customer, edit, onDone }: { customer?: Party; edit?: Receipt; onDone: () => void }) {
  const data = useData()
  const customers = data.parties.filter((x) => x.type === 'saudi_customer' && x.active).sort((a, b) => a.name.localeCompare(b.name))
  const collectors = data.parties.filter((x) => x.type === 'saudi_collector' && x.active)
  const [f, setF] = useState({
    customerId: edit?.customerId ?? customer?.id ?? '',
    date: edit?.date ?? todayStr(),
    amount: edit ? String(edit.amount) : '',
    collectorId: edit?.collectorId ?? collectors[0]?.id ?? '',
    narration: edit?.narration ?? '',
    note: edit?.note ?? '',
    reason: '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  return (
    <form
      id="receipt-form"
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const ok = edit
          ? attempt(() => editReceipt(edit.id, f, f.reason), 'Entry updated · change logged')
          : attempt(() => addReceipt(f), 'Cash received recorded')
        if (ok) onDone()
      }}
    >
      {!customer && (
        <Field className="col-span-2" label="Customer">
          <Select value={f.customerId} onChange={set('customerId')} required autoFocus>
            <option value="">{customers.length ? 'Choose customer' : 'Add a Saudi customer first'}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Date"><Input type="date" value={f.date} onChange={set('date')} required /></Field>
      <Field label="Amount (SAR)"><Input type="number" step="any" min={0} inputMode="decimal" value={f.amount} onChange={set('amount')} required autoFocus={!!customer} /></Field>
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
