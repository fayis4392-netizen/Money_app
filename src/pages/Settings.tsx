import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { saveDefaults, saveSlabs } from '@/data/actions'
import { getState, listRestorePoints, normalize, restorePoint, setState, useAppState, useSyncStatus, type AppData } from '@/data/store'
import { fdt, lakh, money, rate, todayStr } from '@/domain/format'
import { deliveryFee, inrPerSar, round4 } from '@/domain/pricing'
import { supabase } from '@/lib/supabase'
import { attempt } from '@/lib/utils'
import { Button, Card, CardHeader, Dialog, Field, Input, Stat } from '@/components/ui'
import { clearAll } from '@/data/sample'
import { backUpToDrive } from '@/data/backup'
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
      <DistributorChargeCard />
      <LedgerWordingCard />
      <DataCard />
      {supabase && <PasswordCard />}
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

/** The distributor's charge rate: only used to suggest each day's charge entry. */
function DistributorChargeCard() {
  const s = useAppState((x) => x.settings)
  const [rate, setRate] = useState(String(s.distributorFeePerLakh))
  const r = Number(rate) || 0
  return (
    <Card>
      <CardHeader title="Distributor charge" sub="What distributors usually charge, per ₹1,00,000 they deliver. Used to suggest the amount when you enter a distributor's charge for the day." />
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          attempt(() => saveDefaults({ ...s, distributorFeePerLakh: rate }), 'Distributor charge saved')
        }}
      >
        <Field label="₹ per ₹1,00,000"><Input type="number" step="any" min={0} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">₹25,000 → <b className="text-fg">₹{deliveryFee(25_000, r).toLocaleString('en-IN')}</b> · ₹1 lakh → <b className="text-fg">₹{deliveryFee(100_000, r).toLocaleString('en-IN')}</b> · ₹10 lakh → <b className="text-fg">₹{deliveryFee(1_000_000, r).toLocaleString('en-IN')}</b></p>
          <Button variant="primary" type="submit">Save</Button>
        </div>
        <p className="text-xs text-muted sm:col-span-2">A distributor with a different rate: Parties → that distributor → Edit.</p>
      </form>
    </Card>
  )
}

/** The words printed on ledger lines and PDF statements. */
function LedgerWordingCard() {
  const s = useAppState((x) => x.settings)
  const [f, setF] = useState({ saleNarration: s.saleNarration, receiptNarration: s.receiptNarration })
  return (
    <Card>
      <CardHeader title="Ledger wording" sub="The particulars printed on customer ledgers and PDF statements. Changing them updates existing lines too, except any you reworded one by one." />
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          attempt(() => saveDefaults({ ...s, ...f }), 'Ledger wording saved')
        }}
      >
        <Field label="For a deal (sale)" hint={<>Ledger line: <b className="text-fg">{f.saleNarration || '…'}</b> · D-0001 · recipient</>}>
          <Input value={f.saleNarration} onChange={(e) => setF({ ...f, saleNarration: e.target.value })} />
        </Field>
        <Field label="For cash received" hint={<>Ledger line: <b className="text-fg">{f.receiptNarration || '…'}</b> · R-0001</>}>
          <Input value={f.receiptNarration} onChange={(e) => setF({ ...f, receiptNarration: e.target.value })} />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button variant="primary" type="submit">Save</Button>
        </div>
      </form>
    </Card>
  )
}

export function DataCard() {
  const [ask, setAsk] = useState<'clear' | { file: AppData; name: string } | { point: number; at: string } | null>(null)
  const [points, setPoints] = useState<{ id: number; version: number; saved_at: string }[] | null>(null)
  const counts = useAppState((x) => x.deals.length + ' deals · ' + x.parties.length + ' parties · ' + x.receipts.length + ' cash entries')
  const online = useSyncStatus() !== 'local'
  const fileInput = useRef<HTMLInputElement>(null)
  const lastDrive = useAppState((x) => x.settings.lastDriveBackup)
  const [driving, setDriving] = useState(false)
  const toDrive = async () => {
    setDriving(true)
    try {
      const r = await backUpToDrive()
      toast.success(<span>Saved to Google Drive: {r.fileName} · <a className="underline" href={r.folderUrl} target="_blank" rel="noreferrer">open folder</a></span>)
    } catch (e) {
      toast.error('Drive backup failed: ' + (e as Error).message)
    }
    setDriving(false)
  }

  const backup = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `exchange-ledger-backup_${todayStr()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  const pickFile = async (f?: File) => {
    if (!f) return
    try {
      const d = JSON.parse(await f.text())
      if (!d || typeof d !== 'object' || !Array.isArray(d.parties) || !Array.isArray(d.deals)) throw new Error('not a backup')
      setAsk({ file: normalize(d), name: f.name })
    } catch {
      toast.error("That file isn't an Exchange Ledger backup")
    }
    if (fileInput.current) fileInput.current.value = ''
  }
  const showPoints = () => listRestorePoints().then(setPoints, (e) => toast.error("Couldn't load restore points: " + (e as Error).message))

  const who = online ? 'everyone' : 'this browser'
  const title = ask === 'clear' ? 'Clear all data' : ask && 'file' in ask ? 'Restore from backup file' : 'Go back to a restore point'
  const message =
    ask === 'clear' ? `This removes every party, deal and cash entry, for ${who}. Rates and slabs stay.${online ? ' You can go back with a restore point.' : ' It cannot be undone.'}`
    : ask && 'file' in ask ? `Replace the books${online ? ' for everyone' : ''} with ${ask.name} (${ask.file.parties.length} parties · ${ask.file.deals.length} deals · ${ask.file.receipts.length} cash entries)? Download a backup of the current books first if you might need them.`
    : ask ? `Replace the books${online ? ' for everyone' : ''} with how they were on ${ask.at}? Everything entered after that will be gone (download a backup first if unsure).`
    : ''
  const run = async () => {
    if (ask === 'clear') return attempt(() => clearAll(), 'All data cleared')
    if (ask && 'file' in ask) return attempt(() => setState(() => ask.file), 'Books restored from the file')
    if (ask) {
      try {
        await restorePoint(ask.point)
        toast.success('Books restored')
        return true
      } catch (e) {
        toast.error("Couldn't restore: " + (e as Error).message)
      }
    }
    return false
  }

  return (
    <Card>
      <CardHeader title="Data" sub={<>{online ? 'Saved online and shared by everyone who signs in.' : 'Stored in this browser only.'} Now: {counts}.</>} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={toDrive} disabled={driving}>{driving ? 'Backing up…' : 'Back up to Google Drive'}</Button>
        <Button onClick={backup}>Download backup</Button>
        <Button onClick={() => fileInput.current?.click()}>Restore from backup file</Button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        {online && <Button onClick={showPoints}>Restore points</Button>}
        <Button variant="danger" onClick={() => setAsk('clear')}>Clear all data</Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {lastDrive ? <>Last Google Drive backup: <b className="text-fg">{fdt(lastDrive.at)}</b>{lastDrive.by ? ` by ${lastDrive.by}` : ''}{lastDrive.folderUrl && <> · <a className="text-accent underline" href={lastDrive.folderUrl} target="_blank" rel="noreferrer">open folder</a></>}. </> : 'No Google Drive backup yet. '}
        Backups go to the folder "Exchange Ledger Backups" in the Google account you choose; the app can't see anything else in that Drive.{online ? ' Supabase also keeps a restore point every hour while people work, for six months.' : ''}
      </p>
      {points && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border">
          {points.length ? (
            <ul className="divide-y divide-border text-sm">
              {points.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>{fdt(p.saved_at)} <span className="text-xs text-muted">· save #{p.version}</span></span>
                  <Button size="sm" onClick={() => setAsk({ point: p.id, at: fdt(p.saved_at) })}>Restore</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-muted">No restore points yet. The first one is kept with the next save.</p>
          )}
        </div>
      )}
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={title} footer={<><Button onClick={() => setAsk(null)}>Cancel</Button><Button variant="danger" onClick={async () => { if (await run()) setAsk(null) }}>{ask === 'clear' ? 'Clear everything' : 'Restore'}</Button></>}>
        <p className="text-sm text-muted">{message}</p>
      </Dialog>
    </Card>
  )
}

function PasswordCard() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      if (data.user?.email) setEmail(data.user.email)
    })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    const { error: err } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setPassword('')
    setConfirm('')
    toast.success('Password updated')
  }

  return (
    <Card>
      <CardHeader title="Change password" sub={email ? `Signed in as ${email}.` : 'Update the password for your account.'} />
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <Field label="New password">
          <Input type="password" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <p className="text-sm text-neg sm:col-span-2">{error}</p>}
        <div className="flex justify-end sm:col-span-2">
          <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
        </div>
      </form>
    </Card>
  )
}
