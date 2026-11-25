import { RotateCcw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDeal, reverseAndReenter } from '@/data/actions'
import { useData } from '@/data/store'
import { lakh, money, rate, todayStr } from '@/domain/format'
import { priceDeal, slabFor, suggestCustomerRate } from '@/domain/pricing'
import type { Deal } from '@/domain/types'
import { attempt, cn } from '@/lib/utils'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'
import { DealDialogContext } from './context'

type Open = { mode: 'new'; customerId?: string } | { mode: 'correct'; deal: Deal } | null

export function DealDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  return (
    <DealDialogContext.Provider value={{ newDeal: (preset) => setOpen({ mode: 'new', customerId: preset?.customerId }), correctDeal: (deal) => setOpen({ mode: 'correct', deal }) }}>
      {children}
      <Dialog
        open={!!open}
        onClose={close}
        wide
        title={open?.mode === 'correct' ? `Correct ${open.deal.dealNo}` : 'New deal'}
        footer={
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" type="submit" form="deal-form">{open?.mode === 'correct' ? 'Reverse & save corrected deal' : 'Save deal'}</Button>
          </>
        }
      >
        {open && <DealForm key={open.mode === 'correct' ? open.deal.id : 'new'} original={open.mode === 'correct' ? open.deal : undefined} customerId={open.mode === 'new' ? open.customerId : undefined} onDone={close} />}
      </Dialog>
    </DealDialogContext.Provider>
  )
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="border-border not-first:mt-4 not-first:border-t not-first:pt-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <span className="grid size-5 place-items-center rounded-full bg-accent-soft text-[11px] text-accent">{n}</span>
        {title}
        {sub && <span className="text-xs font-medium text-muted">{sub}</span>}
      </h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">{children}</div>
    </section>
  )
}

function DealForm({ original, customerId, onDone }: { original?: Deal; customerId?: string; onDone: () => void }) {
  const data = useData()
  const nav = useNavigate()
  const st = data.settings
  const customers = data.parties.filter((p) => p.type === 'saudi_customer' && p.active)
  const [f, setF] = useState(() => ({
    dealDate: original?.dealDate ?? todayStr(),
    customerId: original?.customerId ?? customerId ?? '',
    inrK: original ? String(original.inrPayout / 1000) : '',
    dubaiQuote: String(original?.dubaiQuote ?? st.dubaiQuote),
    sarPerAed: String(original?.sarPerAed ?? st.sarPerAed),
    customerRate: original ? String(original.customerRate) : '',
    recipientName: original?.recipientName ?? '',
    recipientPhone: original?.recipientPhone ?? '',
    recipientAddress: original?.recipientAddress ?? '',
    regionId: original?.regionId ?? '',
    distributorId: original?.distributorId ?? '',
    fee: original ? String(original.distributorFeeInr) : '',
  }))
  const [auto, setAuto] = useState(!original)

  const inr = Number(f.inrK) * 1000
  const q = Number(f.dubaiQuote)
  const c = Number(f.sarPerAed)
  // the distributor's charge is entered once a day as an expense, not on each deal (older deals keep theirs)
  const fee = Number(f.fee) || 0
  const slab = inr > 0 ? slabFor(inr, st.slabs) : undefined
  const suggested = inr > 0 && q > 0 ? suggestCustomerRate(inr, q, st.slabs) : NaN
  const custRate = auto && suggested > 0 ? suggested : Number(f.customerRate)
  const dists = data.parties.filter((p) => p.type === 'distributor' && p.active && p.regionId === f.regionId)

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const setRegion = (regionId: string) => {
    const l = data.parties.filter((p) => p.type === 'distributor' && p.active && p.regionId === regionId)
    setF({ ...f, regionId, distributorId: l.some((p) => p.id === f.distributorId) ? f.distributorId : l.length === 1 ? l[0].id : '' })
  }
  const ready = inr > 0 && q > 0 && c > 0 && custRate > 0
  const p = ready ? priceDeal(inr, q, custRate, c, fee) : null

  return (
    <form
      id="deal-form"
      className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px] md:items-start"
      onSubmit={(e) => {
        e.preventDefault()
        const input = { ...f, customerRate: custRate, fee }
        let saved: Deal | undefined
        const ok = attempt(() => {
          saved = original ? reverseAndReenter(original.id, input) : addDeal(input)
        }, original ? `${original.dealNo} reversed · corrected deal saved` : 'Deal saved · paid by the distributor')
        if (ok && saved) {
          onDone()
          nav('/deals/' + saved.id)
        }
      }}
    >
      {original && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-warn md:col-span-2">{original.dealNo} will be cancelled with a reversal on the customer's ledger, and this corrected deal saved in its place.</p>}
      <div>
        <Section n={1} title="Deal">
          <Field label="Deal date"><Input type="date" value={f.dealDate} onChange={set('dealDate')} required /></Field>
          <Field label="Saudi customer">
            <Select value={f.customerId} onChange={set('customerId')} required>
              <option value="">Choose</option>
              {customers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field className="col-span-2" label={<>Amount to deliver in India (₹ in thousands) {inr > 0 && <b className="text-fg">= {money(inr, 'INR')}</b>}</>}>
            <Input type="number" step="any" min={0} inputMode="decimal" value={f.inrK} onChange={set('inrK')} placeholder="e.g. 25 = ₹25,000" required autoFocus />
          </Field>
        </Section>
        <Section n={2} title="Rate" sub="per ₹1,000">
          <Field label="Dubai quote (AED)"><Input type="number" step="any" min={0} inputMode="decimal" value={f.dubaiQuote} onChange={set('dubaiQuote')} required /></Field>
          <Field label="SAR per AED"><Input type="number" step="any" min={0} inputMode="decimal" value={f.sarPerAed} onChange={set('sarPerAed')} required /></Field>
          <Field className="col-span-2" label={<>Customer rate (SAR) <span className={cn('font-medium', !auto && custRate !== suggested && 'text-warn')}>· {auto ? 'slab premium' : custRate !== suggested ? 'manual premium' : 'manual'}</span></>}>
            <div className="flex gap-2">
              <Input type="number" step="any" min={0} inputMode="decimal" value={auto ? (suggested > 0 ? String(suggested) : '') : f.customerRate} onChange={(e) => { setAuto(false); setF({ ...f, customerRate: e.target.value }) }} required />
              <Button onClick={() => setAuto(true)} title="Dubai quote + slab premium"><RotateCcw /> Slab</Button>
            </div>
          </Field>
        </Section>
        <Section n={3} title="Recipient & delivery">
          <Field label="Recipient name"><Input value={f.recipientName} onChange={set('recipientName')} required /></Field>
          <Field label="Recipient phone"><Input type="tel" value={f.recipientPhone} onChange={set('recipientPhone')} /></Field>
          <Field label="Delivery region">
            <Select value={f.regionId} onChange={(e) => setRegion(e.target.value)} required>
              <option value="">Choose</option>
              {data.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Distributor">
            <Select value={f.distributorId} onChange={set('distributorId')} required>
              <option value="">{!f.regionId ? 'Pick region' : dists.length ? 'Choose' : 'None in region'}</option>
              {dists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Delivery address"><Input value={f.recipientAddress} onChange={set('recipientAddress')} placeholder="optional" /></Field>
        </Section>
      </div>

      <aside className="rounded-xl bg-surface-2 p-4 text-sm md:sticky md:top-0">
        {p ? (
          <>
            <div className="mb-3 text-xs text-muted">
              Slab <b className="text-fg">{slab ? '₹' + lakh(slab.minInr) + '+' : '—'}</b> · Dubai {rate(q)} + premium {rate(Math.round((custRate - q) * 1e4) / 1e4)} = <b className="text-fg">{rate(custRate)}</b>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
              <dt className="text-muted">Deliver in India</dt><dd className="text-right font-semibold tabular-nums">{money(inr, 'INR')}</dd>
              <dt className="text-muted">SAR to collect ({Number(f.inrK)} × {rate(custRate)})</dt><dd className="text-right font-semibold tabular-nums">{money(p.sar, 'SAR')}</dd>
              <dt className="text-muted">Dubai cost ({Number(f.inrK)} × {rate(q)} AED)</dt><dd className="text-right tabular-nums">{money(p.aedCost, 'AED')}</dd>
              <dt className="text-muted">…in SAR (× {rate(c)})</dt><dd className="text-right tabular-nums">{money(p.sarCost, 'SAR')}</dd>
              {fee > 0 && <><dt className="text-muted">Delivery charge {money(fee, 'INR')}</dt><dd className="text-right tabular-nums">{money(p.feeSar, 'SAR')}</dd></>}
              <dt className="text-muted">Profit per ₹1,000</dt><dd className="text-right tabular-nums">{money(p.profitPerThousand, 'SAR')}</dd>
              <dt className="font-semibold">Est. profit</dt>
              <dd className={cn('text-right font-bold tabular-nums', p.profitSar >= 0 ? 'text-pos' : 'text-neg')}>{money(p.profitSar, 'SAR')}<div className="text-xs font-normal text-muted">≈ {money(p.profitInr, 'INR')}</div></dd>
            </dl>
            {(custRate > q * 1.3 || custRate < q * 0.9) && <p className="mt-3 text-xs text-neg">Customer rate is far from the Dubai quote. Check for a typo.</p>}
            {p.profitSar < 0 && <p className="mt-3 text-xs text-neg">This deal loses money at this Dubai quote.</p>}
          </>
        ) : (
          <p className="text-muted">Enter the ₹ amount and rates to see the SAR to collect and the profit.</p>
        )}
      </aside>
    </form>
  )
}
