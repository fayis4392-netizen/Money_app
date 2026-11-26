import { useState } from 'react'
import { setRates } from '@/data/actions'
import { useAppState } from '@/data/store'
import { useMarketRates } from '@/lib/marketRates'
import { inrPerSar } from '@/domain/pricing'
import { rate } from '@/domain/format'
import { attempt } from '@/lib/utils'
import { Button, Dialog, Field, Input } from '@/components/ui'

export function RatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Update today's rates"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rates-form">Save rates</Button>
        </>
      }
    >
      {open && <RatesForm onDone={onClose} />}
    </Dialog>
  )
}

/* mounted each time the dialog opens, so it starts from the current rates */
function RatesForm({ onDone }: { onDone: () => void }) {
  const s = useAppState((x) => x.settings)
  const [form, setForm] = useState({ dubaiQuote: String(s.dubaiQuote), sarPerAed: String(s.sarPerAed), note: '' })
  const q = Number(form.dubaiQuote), c = Number(form.sarPerAed)
  // today's market rates, shown beside the fields for reference only
  const m = useMarketRates().rates
  return (
      <form
        id="rates-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (attempt(() => setRates(form), "Today's rates updated")) onDone()
        }}
      >
        <Field label="Dubai agent's quote (AED per ₹1,000)" hint={<>New deals start from this. Customer rate = this + premium.{m && <> · Market: <b className="text-fg">{(1000 / (m.inrPerSar / m.aedPerSar)).toFixed(2)}</b></>}</>}>
          <Input type="number" step="any" inputMode="decimal" value={form.dubaiQuote} onChange={(e) => setForm({ ...form, dubaiQuote: e.target.value })} required autoFocus />
        </Field>
        <Field label="SAR per 1 AED" hint={<>SAR you give to get 1 AED, e.g. 1.0215{m && <> · Market: <b className="text-fg">{(1 / m.aedPerSar).toFixed(4)}</b></>}</>}>
          <Input type="number" step="any" inputMode="decimal" value={form.sarPerAed} onChange={(e) => setForm({ ...form, sarPerAed: e.target.value })} required />
        </Field>
        <Field label="Note">
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="optional, e.g. 2pm update" />
        </Field>
        {q > 0 && c > 0 && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
            Works out to <b className="text-fg">₹{rate(inrPerSar(q, c))}</b> per SAR through AED. Saved deals keep the rates they were made with.
          </p>
        )}
      </form>
  )
}
