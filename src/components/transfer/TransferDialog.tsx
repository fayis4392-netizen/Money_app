import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { addTransfer, editTransfer } from '@/data/actions'
import { useData } from '@/data/store'
import { balances } from '@/domain/derive'
import { f3, money, todayStr } from '@/domain/format'
import { aedFor } from '@/domain/transfers'
import { TRANSFER_HELP, TRANSFER_LABEL, type Currency, type PartyType, type Transfer, type TransferKind } from '@/domain/types'
import { attempt, cn } from '@/lib/utils'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'

const FROM: Record<TransferKind, [PartyType, string]> = { send: ['saudi_collector', 'From (Saudi collector)'], exchange: ['dubai_collector', 'Dubai collector'], settle: ['dubai_collector', 'From (Dubai collector)'], payout: ['dubai_agent', 'Dubai agent'] }
const TO: Partial<Record<TransferKind, [PartyType, string]>> = { send: ['dubai_collector', 'To (Dubai collector)'], settle: ['dubai_agent', 'To (Dubai agent)'], payout: ['distributor', 'Distributor'] }
/** currency the sender holds and gives up */
const OUT_CUR: Record<TransferKind, Currency> = { send: 'SAR', exchange: 'SAR', settle: 'AED', payout: 'AED' }
/** currency the amount box is typed in */
const AMOUNT_CUR: Record<TransferKind, Currency> = { send: 'SAR', exchange: 'SAR', settle: 'AED', payout: 'INR' }

/** One of the four transfer forms. `preset` fills in who it's from / to, e.g. when opened from a ledger. */
export function TransferDialog({ open, kind, edit, preset, onClose }: { open: boolean; kind: TransferKind; edit?: Transfer; preset?: { fromId?: string; toId?: string }; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={(edit ? `Edit ${edit.no} · ` : '') + TRANSFER_LABEL[kind]}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="transfer-form">{edit ? 'Save changes' : 'Save'}</Button></>}
    >
      {open && <TransferForm key={kind + (edit?.id ?? '') + (preset?.fromId ?? '') + (preset?.toId ?? '')} kind={kind} edit={edit} preset={preset} onDone={onClose} />}
    </Dialog>
  )
}

function TransferForm({ kind, edit, preset, onDone }: { kind: TransferKind; edit?: Transfer; preset?: { fromId?: string; toId?: string }; onDone: () => void }) {
  const data = useData()
  const bal = balances(data)
  const of = (t: PartyType) => data.parties.filter((p) => p.type === t && p.active)
  const froms = of(FROM[kind][0])
  const tos = TO[kind] ? of(TO[kind]![0]) : []
  const held = (id: string) => bal[id]?.[OUT_CUR[kind]] ?? 0
  const firstFrom = edit?.fromId ?? preset?.fromId ?? froms.find((p) => held(p.id) > 0.0005)?.id ?? froms[0]?.id ?? ''
  // ₹ a distributor has paid out to recipients beyond what he holds for you. His delivery fees are left out:
  // they're settled with him separately, never sent through the Dubai agent.
  const fees = (id: string) => data.deals.reduce((s, x) => s + (x.distributorId === id && x.status === 'completed' ? x.distributorFeeInr : 0), 0)
  const owed = (id: string) => Math.max(0, Math.round(-((bal[id]?.INR ?? 0) + fees(id)) * 100) / 100)
  const firstTo = edit?.toId ?? preset?.toId ?? (kind === 'payout' ? tos.find((p) => owed(p.id) > 0)?.id : undefined) ?? tos[0]?.id ?? ''
  const suggest = (from: string, to: string) => {
    if (kind === 'payout') return owed(to) > 0 ? String(owed(to)) : ''
    const h = held(from)
    return h > 0.0005 ? String(Math.round(h * 1000) / 1000) : ''
  }
  const [f, setF] = useState(() => ({
    date: edit?.date ?? todayStr(),
    fromId: firstFrom,
    toId: firstTo,
    amount: edit ? String(kind === 'send' || kind === 'exchange' ? edit.sar : kind === 'settle' ? edit.aed : edit.inr) : suggest(firstFrom, firstTo),
    rate: edit?.rate != null ? String(edit.rate) : kind === 'exchange' ? String(data.settings.sarPerAed) : kind === 'payout' ? String(data.settings.dubaiQuote) : '',
    marketRate: edit?.marketRate != null ? String(edit.marketRate) : '',
    result: edit ? String(kind === 'exchange' || kind === 'payout' ? edit.aed : '') : '',
    note: edit?.note ?? '',
    reason: '',
  }))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const amt = Number(f.amount), r = Number(f.rate)
  // the AED received (exchange) / AED it costs (payout) follows the rate until it is typed over (e.g. 88 instead of 88.11)
  const [resultAuto, setResultAuto] = useState(() => !edit)
  const calc = kind === 'exchange' && amt > 0 && r > 0 ? Math.round((amt / r) * 1000) / 1000 : kind === 'payout' && amt > 0 && r > 0 ? aedFor(amt, r) : null
  const resultValue = resultAuto ? (calc != null ? String(calc) : '') : f.result
  const resultCur = 'AED'
  const cur = AMOUNT_CUR[kind]
  const aedOut = kind === 'payout' ? Number(resultValue) || 0 : amt

  return (
    <form
      id="transfer-form"
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const input = { ...f, kind, result: resultAuto ? '' : f.result }
        if (edit ? attempt(() => editTransfer(edit.id, input, f.reason), 'Entry updated · change logged') : attempt(() => addTransfer(input), TRANSFER_LABEL[kind] + ' recorded')) onDone()
      }}
    >
      <p className="col-span-2 text-sm text-muted">{TRANSFER_HELP[kind]}</p>
      <Field label="Date"><Input type="date" value={f.date} onChange={set('date')} required /></Field>
      <Field label={FROM[kind][1]}>
        <Select value={f.fromId} onChange={(e) => setF({ ...f, fromId: e.target.value, amount: edit ? f.amount : suggest(e.target.value, f.toId) })} required>
          <option value="">Choose</option>
          {froms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      {TO[kind] && (
        <Field label={TO[kind]![1]} className="col-span-2 sm:col-span-1">
          <Select value={f.toId} onChange={(e) => setF({ ...f, toId: e.target.value, amount: edit || kind !== 'payout' ? f.amount : suggest(f.fromId, e.target.value) })} required>
            <option value="">Choose</option>
            {tos.map((p) => <option key={p.id} value={p.id}>{p.name}{kind === 'payout' && owed(p.id) > 0 ? ` · short ${money(owed(p.id), 'INR')}` : ''}</option>)}
          </Select>
        </Field>
      )}
      <Field
        label={`${cur === 'INR' ? '₹' : cur} amount`}
        className={TO[kind] ? 'col-span-2 sm:col-span-1' : ''}
        hint={f.fromId ? `${data.parties.find((p) => p.id === f.fromId)?.name} holds ${OUT_CUR[kind]} ${f3(Math.max(0, held(f.fromId)))}${kind === 'payout' && r > 0 ? ` (≈ ${money((Math.max(0, held(f.fromId)) * 1000) / r, 'INR')} at this rate)` : ''}` : undefined}
      >
        <Input type="number" step="any" min={0} inputMode="decimal" value={f.amount} onChange={set('amount')} required autoFocus />
      </Field>
      {kind === 'exchange' && <Field label="SAR per 1 AED"><Input type="number" step="any" min={0} inputMode="decimal" value={f.rate} onChange={set('rate')} required /></Field>}
      {kind === 'payout' && (
        <>
          <Field label="Agent's rate (AED per ₹1,000)"><Input type="number" step="any" min={0} inputMode="decimal" value={f.rate} onChange={set('rate')} required /></Field>
          <Field label="Market rate (optional)" hint="to see the agent's margin"><Input type="number" step="any" min={0} inputMode="decimal" value={f.marketRate} onChange={set('marketRate')} /></Field>
        </>
      )}
      {(kind === 'exchange' || kind === 'payout') && (
        <Field
          className="col-span-2"
          label={<>{kind === 'exchange' ? 'AED received' : 'AED it costs (comes off his AED)'} <span className={cn('font-medium', !resultAuto && calc != null && Number(f.result) !== calc && 'text-warn')}>· {resultAuto ? 'from the rate' : calc != null && Number(f.result) !== calc ? `typed (rate gives ${resultCur} ${calc})` : 'typed'}</span></>}
          hint={kind === 'exchange' ? 'Round it or change it to what was really received before saving.' : 'Change it if the agent charged a different AED amount.'}
        >
          <div className="flex gap-2">
            <Input type="number" step="any" min={0} inputMode="decimal" value={resultValue} onChange={(e) => { setResultAuto(false); setF({ ...f, result: e.target.value }) }} required />
            <Button onClick={() => setResultAuto(true)} title="Work it out from the rate again"><RotateCcw /></Button>
          </div>
        </Field>
      )}
      {kind === 'payout' && f.fromId && aedOut > Math.max(0, held(f.fromId)) + 0.0005 && (
        <p className="col-span-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-warn">This needs more AED than the agent holds for you. The difference (AED {f3(aedOut - Math.max(0, held(f.fromId)))}) will show as owed to him until you settle more AED.</p>
      )}
      <Field label="Note" className="col-span-2"><Input value={f.note} onChange={set('note')} placeholder="optional" /></Field>
      {edit && <Field label="Reason for change" className="col-span-2"><Input value={f.reason} onChange={set('reason')} required placeholder="Kept in the edit history" /></Field>}
    </form>
  )
}
