import { useMemo, useState } from 'react'
import { useData } from '@/data/store'
import { booksCheck } from '@/domain/books'
import { money, rate } from '@/domain/format'
import { cn } from '@/lib/utils'
import { Card, CardHeader } from '@/components/ui'

function Row({ label, sub, value, sign, strong }: { label: string; sub?: string; value: number; sign?: '+' | '−'; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', strong && 'border-t border-border pt-2 font-bold')}>
      <span className={cn(!strong && 'text-muted')}>{label}{sub && <span className="block text-xs">{sub}</span>}</span>
      <span className="tabular-nums whitespace-nowrap">{sign && <span className="text-muted">{sign} </span>}{money(value, 'INR')}</span>
    </div>
  )
}

/** Profit worked out the accountant's way (owed − owe − capital) next to the deal-by-deal way. */
export function BooksCheck() {
  const data = useData()
  const [mode, setMode] = useState<'achieved' | 'today'>('achieved')
  const b = useMemo(() => booksCheck(data, mode), [data, mode])
  const agrees = Math.abs(b.difference) < 1
  return (
    <Card>
      <CardHeader
        title="Books check"
        sub="Profit worked out two ways. If every entry is recorded, they agree."
        action={
          <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
            {(['achieved', 'today'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn('rounded-md px-2.5 py-1 text-muted', mode === m && 'bg-surface text-fg shadow-sm')}>{m === 'achieved' ? 'Achieved rates' : "Today's rates"}</button>
            ))}
          </div>
        }
      />
      <div className="grid gap-4 text-sm lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Books method · കിട്ടാനുള്ളത് − കൊടുക്കാനുള്ളത് − capital</div>
          <Row label="Owed to you or held for you" sub="customers, collectors, Dubai agent, distributors" value={b.owedToYou} />
          <Row label="Operator's own cash" value={b.operatorCash} sign="+" />
          <Row label="You owe" value={b.youOwe} sign="−" />
          <Row label="Still to deliver in India" sub={`${b.openDeals} open deals, with fees`} value={b.toDeliver} sign="−" />
          <Row label="Capital put in" value={b.capital} sign="−" />
          <Row label="Opening balances from the old books" value={b.openings} sign="−" />
          <Row label="Profit by the books" value={b.booksProfit} strong />
        </div>
        <div className="grid content-start gap-3">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Deal method</div>
            <Row label="Profit on deals" value={b.dealsProfit} />
            <Row label="Expenses" value={b.expenses} sign="−" />
            <Row label="Net profit" value={b.dealMethod} strong />
          </div>
          <div className={cn('rounded-xl p-3', mode === 'achieved' ? (agrees ? 'bg-emerald-500/10' : 'bg-red-500/10') : 'bg-amber-500/10')}>
            <div className="flex items-baseline justify-between gap-3 font-bold">
              <span>Difference</span>
              <span className={cn('tabular-nums', mode === 'achieved' ? (agrees ? 'text-pos' : 'text-neg') : 'text-warn')}>{money(Math.abs(b.difference) < 0.005 ? 0 : b.difference, 'INR')}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {mode === 'achieved'
                ? agrees
                  ? `The books balance. SAR and AED are valued at the rates achieved so far (₹${rate(Math.round(b.rates.sar * 1e4) / 1e4)} per SAR).`
                  : 'The two methods should agree at achieved rates. Check for entries recorded with the wrong amount or party.'
                : `SAR and AED still held are valued at today's rate (₹${rate(Math.round(b.rates.sar * 100) / 100)} per SAR). The difference is what you'd gain or lose if it were all exchanged today.`}
            </p>
          </div>
          <p className="text-xs text-muted">This checks the entries against each other. To catch cash that went missing, count what each person really holds and compare it with <b className="text-fg">Transfers → Who's holding what</b>.</p>
        </div>
      </div>
    </Card>
  )
}
