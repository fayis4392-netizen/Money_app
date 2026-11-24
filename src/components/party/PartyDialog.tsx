import { useState } from 'react'
import { addRegion, saveParty } from '@/data/actions'
import { useAppState } from '@/data/store'
import { todayStr } from '@/domain/format'
import { OPENING_CURRENCY, PARTY_TYPE_LABEL, type Party, type PartyType } from '@/domain/types'
import { attempt } from '@/lib/utils'
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui'

export function PartyDialog({ open, type, party, onClose }: { open: boolean; type: PartyType; party?: Party; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={(party ? 'Edit ' : 'Add ') + PARTY_TYPE_LABEL[party?.type ?? type]}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="party-form">Save</Button></>}
    >
      {open && <PartyForm key={party?.id ?? type} type={party?.type ?? type} party={party} onDone={onClose} />}
    </Dialog>
  )
}

function PartyForm({ type, party, onDone }: { type: PartyType; party?: Party; onDone: () => void }) {
  const regions = useAppState((s) => s.regions)
  const defaultFee = useAppState((s) => s.settings.distributorFeePerLakh)
  const [f, setF] = useState({
    name: party?.name ?? '',
    phone: party?.phone ?? '',
    regionId: party?.regionId ?? '',
    notes: party?.notes ?? '',
    active: party?.active ?? true,
    openingAmount: party?.opening ? String(Math.abs(party.opening.amount)) : '',
    openingSide: party?.opening && party.opening.amount < 0 ? 'Cr' : 'Dr',
    openingDate: party?.opening?.date ?? todayStr(),
    feePerLakh: party?.feePerLakh != null ? String(party.feePerLakh) : '',
  })
  const [newRegion, setNewRegion] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const cur = OPENING_CURRENCY[type]

  return (
    <form
      id="party-form"
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (attempt(() => saveParty({ ...f, id: party?.id, type }), party ? 'Saved' : PARTY_TYPE_LABEL[type] + ' added')) onDone()
      }}
    >
      <Field label="Name"><Input value={f.name} onChange={set('name')} required autoFocus /></Field>
      <Field label="Phone"><Input type="tel" value={f.phone} onChange={set('phone')} /></Field>
      {type === 'distributor' && (
        <>
          <Field label="Region">
            <Select value={f.regionId} onChange={set('regionId')} required>
              <option value="">Choose</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="…or add a region">
            <div className="flex gap-2">
              <Input value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder="e.g. Bangalore" />
              <Button
                onClick={() => {
                  let id = ''
                  if (attempt(() => (id = addRegion(newRegion).id), 'Region added')) {
                    setF({ ...f, regionId: id })
                    setNewRegion('')
                  }
                }}
              >
                Add
              </Button>
            </div>
          </Field>
        </>
      )}
      {type === 'distributor' && (
        <Field className="col-span-2" label="Delivery charge (₹ per ₹1,00,000)" hint={`Leave empty to use the default of ₹${defaultFee} per lakh from Settings.`}>
          <Input type="number" step="any" min={0} inputMode="decimal" value={f.feePerLakh} onChange={set('feePerLakh')} placeholder={String(defaultFee)} />
        </Field>
      )}
      <Field label={`Opening balance (${cur})`}>
        <Input type="number" step="any" min={0} inputMode="decimal" value={f.openingAmount} onChange={set('openingAmount')} placeholder="0" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Side">
          <Select value={f.openingSide} onChange={set('openingSide')}>
            <option value="Dr">Dr · owes you</option>
            <option value="Cr">Cr · you owe</option>
          </Select>
        </Field>
        <Field label="As on"><Input type="date" value={f.openingDate} onChange={set('openingDate')} /></Field>
      </div>
      <Field className="col-span-2" label="Notes"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      {party && (
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="size-4 accent-accent" /> Active
        </label>
      )}
    </form>
  )
}
