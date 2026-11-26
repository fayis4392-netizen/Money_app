import { RefreshCw } from 'lucide-react'
import { useAppState } from '@/data/store'
import { useMarketRates } from '@/lib/marketRates'
import { cn } from '@/lib/utils'
import { Card, CardHeader } from '@/components/ui'

const f2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f4 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

/** Today's market rates, to watch beside your own. Display only: nothing is calculated from them. */
export function MarketRatesCard() {
  const s = useAppState((x) => x.settings)
  const { rates, state, refresh } = useMarketRates()
  const inrPerAed = rates ? rates.inrPerSar / rates.aedPerSar : 0
  const tiles = rates
    ? [
        { label: '1 SAR', value: `₹${f2(rates.inrPerSar)}`, sub: 'Saudi riyal → rupee' },
        { label: '1 AED', value: `₹${f2(inrPerAed)}`, sub: 'Dirham → rupee' },
        { label: 'SAR per 1 AED', value: f4(1 / rates.aedPerSar), sub: `yours: ${f4(s.sarPerAed)}` },
        { label: 'AED per ₹1,000', value: f2(1000 / inrPerAed), sub: `Dubai quote: ${f2(s.dubaiQuote)}` },
      ]
    : []
  const when = rates ? new Date(rates.updated).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <Card>
      <CardHeader
        title="Market rates"
        sub={rates ? `For reference only, not used in any calculation · updated ${when} · ${rates.source}` : 'For reference only, not used in any calculation'}
        action={
          <button onClick={() => refresh(true)} disabled={state === 'loading'} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50" aria-label="Refresh market rates" title="Refresh">
            <RefreshCw className={cn('size-4', state === 'loading' && 'animate-spin')} />
          </button>
        }
      />
      {rates ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-surface-2 px-3 py-2">
              <div className="text-xs text-muted">{t.label}</div>
              <div className="text-lg font-bold tabular-nums">{t.value}</div>
              <div className="text-xs text-muted">{t.sub}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">{state === 'error' ? "Couldn't load market rates. Check the internet connection and press refresh." : 'Loading market rates…'}</p>
      )}
      {state === 'error' && rates && <p className="mt-2 text-xs text-warn">Couldn't refresh; showing the last rates loaded.</p>}
    </Card>
  )
}
