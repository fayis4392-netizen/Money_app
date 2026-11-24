import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { saveDefaults, saveSlabs } from '@/data/actions'
import { useAppState } from '@/data/store'
import { fdt, lakh, money, rate } from '@/domain/format'
import { deliveryFee, inrPerSar, round4 } from '@/domain/pricing'
import { attempt } from '@/lib/utils'
import { Button, Card, CardHeader, Dialog, Field, Input, Stat } from '@/components/ui'
import { clearAll, loadSample } from '@/data/sample'
import { RatesDialog } from '@/components/layout/RatesDialog'

export default function SettingsPage() {
  const s = useAppState((x) => x.settings)
  const [ratesOpen, setRatesOpen] = useState(false)
  const log = [...s.rateLog].reverse()

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">Rates change through the day. Update the Dubai quote here or from the button in the top bar.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Today's rates" action={<Button variant="primary" size="sm" onClick={() => setRatesOpen(true)}>Update rates</Button>} />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Dubai quote" value={rate(s.dubaiQuote)} sub="AED per ₹1,000" />
            <Stat label="SAR per 1 AED" value={rate(s.sarPerAed)} />
            <Stat label="Works out to" value={rate(Math.round(inrPerSar(s.dubaiQuote, s.sarPerAed) * 100) / 100)} sub="₹ per SAR" />
          </div>
          <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                <tr><th className="px-3 py-2 text-left font-semibold">Updated</th><th className="px-3 py-2 text-right font-semibold">AED / ₹1,000</th><th className="px-3 py-2 text-right font-semibold">SAR per AED</th><th className="px-3 py-2 text-left font-semibold max-sm:hidden">Note</th></tr>
              </thead>
              <tbody>
                {log.map((x) => (
                  <tr key={x.at} className="border-t border-border">
                    <td className="px-3 py-2">{fdt(x.at)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rate(x.dubaiQuote)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rate(x.sarPerAed)}</td>
                    <td className="px-3 py-2 text-muted max-sm:hidden">{x.note || '—'}</td>
                  </tr>
                ))}
                {!log.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">No rate updates yet</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <SlabsCard key={JSON.stringify(s.slabs)} />
      </div>
      <DefaultsCard />
      <DataCard />
      <RatesDialog open={ratesOpen} onClose={() => setRatesOpen(false)} />
    </div>
  )
}

function SlabsCard() {
  const s = useAppState((x) => x.settings)
  const [rows, setRows] = useState(() => s.slabs.map((x) => ({ minInr: String(x.minInr), premium: String(x.premium) })))
  const set = (i: number, k: 'minInr' | 'premium', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  return (
    <Card>
      <CardHeader title="Premium slabs" sub="Customer rate per ₹1,000 = Dubai quote + premium. Bigger deals get a smaller premium; every deal can still be overridden." />
      <form
        onSubmit={(e) => {
          e.preventDefault()
          attempt(() => saveSlabs(rows), 'Premium slabs saved')
        }}
      >
        <div className="grid gap-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-xs font-semibold text-muted sm:grid-cols-[1fr_1fr_1fr_auto]">
            <span>From ₹</span><span>Premium (SAR)</span><span className="max-sm:hidden">Customer rate now</span><span className="w-9" />
          </div>
          {rows.map((r, i) => {
            const p = Number(r.premium), min = Number(r.minInr)
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <div>
                  <Input type="number" step="any" min={0} inputMode="numeric" value={r.minInr} onChange={(e) => set(i, 'minInr', e.target.value)} aria-label="From ₹" />
                  <div className="mt-0.5 px-1 text-[11px] text-muted">{min >= 0 ? '₹' + lakh(min) + '+' : ''}</div>
                </div>
                <div>
                  <Input type="number" step="any" min={0} inputMode="decimal" value={r.premium} onChange={(e) => set(i, 'premium', e.target.value)} aria-label="Premium" />
                  <div className="mt-0.5 px-1 text-[11px] text-muted sm:invisible">= {rate(round4(s.dubaiQuote + (p || 0)))} SAR</div>
                </div>
                <div className="self-start pt-2 text-sm tabular-nums max-sm:hidden">
                  <b>{rate(round4(s.dubaiQuote + (p || 0)))}</b> <span className="text-muted">· {money(100 * (s.dubaiQuote + (p || 0)), 'SAR')} per lakh</span>
                </div>
                <Button variant="ghost" size="icon" className="self-start text-danger" disabled={rows.length < 2} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove slab">
                  <Trash2 />
                </Button>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button size="sm" onClick={() => setRows([...rows, { minInr: String((Math.max(0, ...rows.map((r) => Number(r.minInr) || 0))) + 500_000), premium: '1' }])}>
            <Plus /> Add slab
          </Button>
          <span className="flex-1" />
          <Button variant="primary" type="submit">Save slabs</Button>
        </div>
      </form>
    </Card>
  )
}

function DefaultsCard() {
  const s = useAppState((x) => x.settings)
  const [f, setF] = useState({ distributorFeePerLakh: String(s.distributorFeePerLakh), saleNarration: s.saleNarration, receiptNarration: s.receiptNarration })
  return (
    <Card>
      <CardHeader title="Defaults" sub="Starting values for new entries, and the wording used on ledgers and PDF exports." />
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault()
          attempt(() => saveDefaults(f), 'Defaults saved')
        }}
      >
        <Field label="Distributor delivery charge (₹ per ₹1,00,000)" hint={Number(f.distributorFeePerLakh) >= 0 ? `e.g. ₹25,000 → ₹${deliveryFee(25_000, Number(f.distributorFeePerLakh) || 0)} · ₹1 lakh → ₹${deliveryFee(100_000, Number(f.distributorFeePerLakh) || 0)}. A distributor can have their own rate (Parties → Edit).` : undefined}>
          <Input type="number" step="any" min={0} inputMode="decimal" value={f.distributorFeePerLakh} onChange={(e) => setF({ ...f, distributorFeePerLakh: e.target.value })} />
        </Field>
        <Field label="Particulars for a sale">
          <Input value={f.saleNarration} onChange={(e) => setF({ ...f, saleNarration: e.target.value })} />
        </Field>
        <Field label="Particulars for cash received">
          <Input value={f.receiptNarration} onChange={(e) => setF({ ...f, receiptNarration: e.target.value })} />
        </Field>
        <div className="sm:col-span-3 flex justify-end">
          <Button variant="primary" type="submit">Save defaults</Button>
        </div>
      </form>
    </Card>
  )
}

export function DataCard() {
  const [ask, setAsk] = useState<'sample' | 'clear' | null>(null)
  const counts = useAppState((x) => x.deals.length + ' deals · ' + x.parties.length + ' parties · ' + x.receipts.length + ' cash entries')
  return (
    <Card>
      <CardHeader title="Data" sub={<>Stored in this browser until the Supabase project is connected. Now: {counts}.</>} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAsk('sample')}>Load sample data</Button>
        <Button variant="danger" onClick={() => setAsk('clear')}>Clear all data</Button>
      </div>
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={ask === 'sample' ? 'Load sample data' : 'Clear all data'} footer={<><Button onClick={() => setAsk(null)}>Cancel</Button><Button variant={ask === 'clear' ? 'danger' : 'primary'} onClick={() => { if (attempt(() => (ask === 'sample' ? loadSample() : clearAll()), ask === 'sample' ? 'Sample data loaded' : 'All data cleared')) setAsk(null) }}>{ask === 'sample' ? 'Replace with sample' : 'Clear everything'}</Button></>}>
        <p className="text-sm text-muted">{ask === 'sample' ? "This replaces every party, deal and cash entry with sample books, including Rayees' real account. Rates and slabs stay." : 'This removes every party, deal and cash entry from this browser. Rates and slabs stay. It cannot be undone.'}</p>
      </Dialog>
    </Card>
  )
}
