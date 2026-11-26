import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAppState } from '@/data/store'
import { useRateHistory, type DayRate } from '@/lib/marketRates'
import { cn } from '@/lib/utils'
import { AreaLine, Sparkline } from '@/components/charts'
import { Card } from '@/components/ui'

type Pair = 'sar' | 'aed' | 'sarAed'
const PAIRS: { id: Pair; label: string; long: string; of: (r: DayRate) => number; digits: number; prefix: string }[] = [
  { id: 'sar', label: 'SAR → ₹', long: '1 Saudi riyal in rupees', of: (r) => r.inrPerSar, digits: 3, prefix: '₹' },
  { id: 'aed', label: 'AED → ₹', long: '1 UAE dirham in rupees', of: (r) => r.inrPerSar / r.aedPerSar, digits: 3, prefix: '₹' },
  { id: 'sarAed', label: 'SAR per AED', long: 'Riyals for 1 dirham', of: (r) => 1 / r.aedPerSar, digits: 4, prefix: '' },
]
const RANGES = [{ days: 7, label: '7D' }, { days: 30, label: '30D' }] as const
const PAIR_KEY = 'exchange-ledger:fx-pair'
const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Market SAR / AED / INR rates over the last week or month, to watch only: nothing is calculated from them. */
export function MarketRatesCard() {
  const s = useAppState((x) => x.settings)
  const [pair, setPair] = useState<Pair>(() => {
    try {
      return (localStorage.getItem(PAIR_KEY) as Pair) || 'sar'
    } catch {
      return 'sar'
    }
  })
  const [days, setDays] = useState<7 | 30>(7)
  const { rows, state, refresh } = useRateHistory(days)
  const pick = (p: Pair) => {
    setPair(p)
    try {
      localStorage.setItem(PAIR_KEY, p)
    } catch {
      /* fine */
    }
  }
  const P = PAIRS.find((x) => x.id === pair)!
  const fmt = (n: number, d = P.digits, pre = P.prefix) => pre + n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
  const series = rows.map((r) => ({ label: day(r.date), value: P.of(r) }))
  const now = series.at(-1)?.value, first = series[0]?.value
  const change = now != null && first != null ? now - first : 0
  const pct = first ? (change / first) * 100 : 0
  const flat = Math.abs(pct) < 0.005
  const yours = pair === 'sarAed' ? `yours ${s.sarPerAed.toFixed(4)}` : pair === 'aed' ? `Dubai quote ≈ ₹${(1000 / s.dubaiQuote).toFixed(3)} per AED` : ''
  const updated = rows.at(-1)?.date

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              {state !== 'error' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
              <span className={cn('relative inline-flex size-2.5 rounded-full', state === 'error' ? 'bg-red-500' : 'bg-emerald-500')} />
            </span>
            <h3 className="font-bold">Market rates</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted">For watching only, not used in any calculation{updated ? ` · latest ${day(updated)}` : ''} · updated daily</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-sm" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button key={r.days} onClick={() => setDays(r.days)} aria-pressed={days === r.days} className={cn('rounded-md px-2.5 py-1 font-medium text-muted', days === r.days && 'bg-surface text-fg shadow-sm')}>{r.label}</button>
            ))}
          </div>
          <button onClick={refresh} disabled={state === 'loading'} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50" aria-label="Refresh" title="Refresh">
            <RefreshCw className={cn('size-4', state === 'loading' && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* currency toggle, each with today's value and a sparkline */}
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Currency">
        {PAIRS.map((x) => {
          const vals = rows.map(x.of)
          const v = vals.at(-1)
          const up = vals.length > 1 && v! - vals[0] > 0
          return (
            <button key={x.id} onClick={() => pick(x.id)} aria-pressed={pair === x.id} className={cn('rounded-xl border px-3 py-2 text-left transition-colors', pair === x.id ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2 hover:border-accent/50')}>
              <div className="text-xs font-semibold text-muted">{x.label}</div>
              <div className="flex items-end justify-between gap-2">
                <span className="font-bold tabular-nums">{v != null ? fmt(v, x.digits, x.prefix) : '—'}</span>
                <span className="max-sm:hidden"><Sparkline values={vals} width={72} height={24} color={vals.length > 1 ? (up ? 'var(--pos)' : 'var(--neg)') : 'var(--series-1)'} /></span>
              </div>
            </button>
          )
        })}
      </div>

      {/* the selected currency: value, change and chart */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs text-muted">{P.long}</div>
          <div className="text-3xl font-bold tabular-nums">{now != null ? fmt(now) : '—'}</div>
        </div>
        {now != null && series.length > 1 && (
          <div className={cn('flex items-center gap-1 text-sm font-semibold tabular-nums', flat ? 'text-muted' : change > 0 ? 'text-pos' : 'text-neg')}>
            {flat ? <Minus className="size-4" /> : change > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
            {change >= 0 ? '+' : '−'}{fmt(Math.abs(change))} ({pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)
            <span className="font-normal text-muted">in {days} days</span>
          </div>
        )}
      </div>
      {yours && <p className="text-xs text-muted">{yours}</p>}
      <div className="mt-2">
        {state === 'error' && !rows.length ? (
          <p className="py-10 text-center text-sm text-muted">Couldn't load market rates. Check the internet connection and press refresh.</p>
        ) : state === 'loading' && !rows.length ? (
          <p className="py-10 text-center text-sm text-muted">Loading the last {days} days…</p>
        ) : (
          <AreaLine name={P.label} points={series} format={(n) => fmt(n)} height={190} color={flat ? 'var(--series-1)' : change > 0 ? 'var(--pos)' : 'var(--neg)'} />
        )}
      </div>
    </Card>
  )
}
