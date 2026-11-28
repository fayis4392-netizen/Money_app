import { ArrowLeftRight, Banknote, HandCoins, Handshake, Send } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { VoidDialog } from '@/components/VoidDialog'
import { useData } from '@/data/store'
import { balances } from '@/domain/derive'
import { dmy, drcr, fdt, money, rate } from '@/domain/format'
import { achievedRates } from '@/domain/transfers'
import { TRANSFER_HELP, TRANSFER_LABEL, type Currency, type Transfer, type TransferKind } from '@/domain/types'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, CardHeader, Empty, Select } from '@/components/ui'
import { ReceiptDialog } from '@/components/receipt/ReceiptDialog'
import { TransferDialog } from '@/components/transfer/TransferDialog'

const ICON: Record<TransferKind, ReactNode> = { send: <Send />, exchange: <ArrowLeftRight />, settle: <Handshake />, payout: <HandCoins /> }
const KINDS: TransferKind[] = ['send', 'exchange', 'settle', 'payout']

export default function Transfers() {
  const data = useData()
  const [open, setOpen] = useState<{ kind: TransferKind; edit?: Transfer } | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [voiding, setVoiding] = useState<Transfer | null>(null)
  const [kind, setKind] = useState<TransferKind | ''>('')
  const bal = useMemo(() => balances(data), [data])
  const ach = achievedRates(data.transfers)
  const name = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? '—'
  const plink = (id?: string) => (id ? <Link className="text-accent" to={'/parties/' + id}>{name(id)}</Link> : '—')
  const holders = data.parties.filter((p) => p.active && ['saudi_collector', 'dubai_collector', 'dubai_agent'].includes(p.type))
  const list = [...data.transfers].filter((t) => !kind || t.kind === kind).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))

  const describe = (t: Transfer) => {
    switch (t.kind) {
      case 'send': return <>{plink(t.fromId)} → {plink(t.toId)} · <b>{money(t.sar, 'SAR')}</b></>
      case 'exchange': return <>{plink(t.fromId)} · <b>{money(t.sar, 'SAR')}</b> → <b>{money(t.aed, 'AED')}</b> @ {rate(t.rate)} SAR per AED</>
      case 'settle': return <>{plink(t.fromId)} → {plink(t.toId)} · <b>{money(t.aed, 'AED')}</b></>
      case 'payout': return <>{plink(t.fromId)} → {plink(t.toId)} · <b>{money(t.inr, 'INR')}</b> @ {rate(t.rate)} per ₹1,000 = <b>{money(t.aed, 'AED')}</b>{t.marketRate ? <span className="text-muted"> · market {rate(t.marketRate)}</span> : null}</>
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">Record each step as it happens, in any order and any amount. Ledgers and balances update from these entries.</p>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <button onClick={() => setReceiptOpen(true)} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-sm hover:border-accent hover:bg-accent-soft [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-accent">
          <Banknote />
          <span><span className="block text-sm font-bold">Cash received</span><span className="block text-xs text-muted max-sm:hidden">Customer → Saudi collector, SAR</span></span>
        </button>
        {KINDS.map((k) => (
          <button key={k} onClick={() => setOpen({ kind: k })} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-sm hover:border-accent hover:bg-accent-soft [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-accent">
            {ICON[k]}
            <span><span className="block text-sm font-bold">{TRANSFER_LABEL[k]}</span><span className="block text-xs text-muted max-sm:hidden">{TRANSFER_HELP[k]}</span></span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Who's holding what" sub="Right now, from the ledgers" />
        {holders.length ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {holders.map((p) => {
              const b = bal[p.id] ?? { SAR: 0, AED: 0, INR: 0 }
              const curs = (['SAR', 'AED', 'INR'] as Currency[]).filter((c) => Math.abs(b[c]) > 0.0005)
              return (
                <Link key={p.id} to={'/parties/' + p.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm tabular-nums hover:ring-1 hover:ring-accent">
                  <div className="truncate font-semibold">{p.name}</div>
                  {curs.length ? curs.map((c) => <div key={c} className={b[c] < 0 ? 'text-neg' : ''}>{c} {drcr(b[c])}</div>) : <div className="text-muted">nothing</div>}
                </Link>
              )
            })}
          </div>
        ) : (
          <Empty>Add your collectors and Dubai agent under Parties first.</Empty>
        )}
        {ach.inrPerSar && <p className="mt-3 text-xs text-muted">Achieved so far: {rate(ach.sarPerAed)} SAR per AED · Dubai agent {rate(ach.quote)} AED per ₹1,000 · <b className="text-fg">₹{rate(Math.round(ach.inrPerSar * 1e4) / 1e4)} per SAR</b></p>}
      </Card>

      <Card className="p-0 md:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-5">
          <h3 className="font-bold">Entries</h3>
          <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value as TransferKind | '')}>
            <option value="">All types</option>
            {KINDS.map((k) => <option key={k} value={k}>{TRANSFER_LABEL[k]}</option>)}
          </Select>
        </div>
        {list.length ? (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {list.map((t) => (
              <li key={t.id} className={cn('grid gap-1 px-4 py-3 text-sm tabular-nums md:grid-cols-[150px_1fr_auto] md:items-center md:gap-3 md:px-5', t.voided && 'text-muted')}>
                <div className="flex items-center gap-2 md:block">
                  <span className="text-xs text-muted">{dmy(t.date)} · {t.no}</span>
                  <Badge className="md:mt-1">{TRANSFER_LABEL[t.kind]}</Badge>
                </div>
                <div className={cn(t.voided && 'line-through')}>
                  {describe(t)}
                  {t.note && <span className="text-muted"> · {t.note}</span>}
                  {t.edits.length > 0 && !t.voided && <Badge className="ml-1" title={t.edits.map((e) => `${fdt(e.at)}: ${e.changes.join(', ')} — ${e.reason}`).join('\n')}>edited</Badge>}
                </div>
                <div className="flex gap-1 md:justify-end">
                  {t.voided ? <span className="text-xs">voided: {t.voided.reason}</span> : (
                    <>
                      <Button size="sm" onClick={() => setOpen({ kind: t.kind, edit: t })}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setVoiding(t)}>Void</Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No entries yet. Use the buttons above as money moves.</Empty>
        )}
      </Card>

      <ReceiptDialog open={receiptOpen} onClose={() => setReceiptOpen(false)} />
      <TransferDialog open={!!open} kind={open?.kind ?? 'send'} edit={open?.edit} onClose={() => setOpen(null)} />
      <VoidDialog target={voiding && { kind: 'transfer', id: voiding.id }} no={voiding?.no} onClose={() => setVoiding(null)} />
    </div>
  )
}
