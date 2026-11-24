import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '@/data/store'
import { balances } from '@/domain/derive'
import { drcr, money } from '@/domain/format'
import { PARTY_TYPE_LABEL, type Currency } from '@/domain/types'
import { Card, CardHeader, Empty, Stat } from '@/components/ui'
import { useToInr } from '@/lib/useToInr'
import { BooksCheck } from '@/components/BooksCheck'

/** Who owes the operator (Dr) and whom the operator owes (Cr), right now, from the ledgers. */
export default function Balances() {
  const data = useData()
  const toInr = useToInr()
  const rows = useMemo(() => {
    const bal = balances(data)
    return data.parties
      .filter((p) => p.type !== 'operator')
      .flatMap((p) => (['SAR', 'AED', 'INR'] as Currency[]).map((c) => ({ p, c, amount: bal[p.id]?.[c] ?? 0 })))
      .filter((r) => Math.abs(r.amount) > 0.0005)
      .map((r) => ({ ...r, inr: toInr(r.amount, r.c) }))
      .sort((a, b) => Math.abs(b.inr) - Math.abs(a.inr))
  }, [data, toInr])
  const debtors = rows.filter((r) => r.amount > 0)
  const creditors = rows.filter((r) => r.amount < 0)
  const sum = (l: typeof rows) => l.reduce((t, r) => t + r.inr, 0)

  const list = (l: typeof rows) =>
    l.length ? (
      <ul className="divide-y divide-border border-t border-border">
        {l.map((r) => (
          <li key={r.p.id + r.c} className="flex items-center gap-3 px-4 py-3 text-sm tabular-nums md:px-5">
            <div className="min-w-0 flex-1">
              <Link className="font-semibold text-accent" to={'/parties/' + r.p.id}>{r.p.name}</Link>
              <div className="text-xs text-muted">{PARTY_TYPE_LABEL[r.p.type]}</div>
            </div>
            <div className="text-right">
              <b>{r.c} {drcr(r.amount)}</b>
              {r.c !== 'INR' && <div className="text-xs text-muted">≈ {money(Math.abs(r.inr), 'INR')}</div>}
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <Empty>Nobody</Empty>
    )

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">Built from the ledgers. SAR and AED are valued at today's rates.</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 [&>*:last-child]:max-md:col-span-2">
        <Stat label="Owed to you (Dr)" value={<span className="text-pos">{money(sum(debtors), 'INR')}</span>} sub={`${debtors.length} balances`} />
        <Stat label="You owe (Cr)" value={<span className="text-neg">{money(Math.abs(sum(creditors)), 'INR')}</span>} sub={`${creditors.length} balances`} />
        <Stat label="Net" value={money(sum(rows), 'INR')} />
      </div>
      <BooksCheck />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0 md:p-0"><div className="px-4 pt-4 md:px-5"><CardHeader title="Debtors · owe you or hold your money" sub="Customers who haven't paid; collectors and agents holding cash for you" /></div>{list(debtors)}</Card>
        <Card className="p-0 md:p-0"><div className="px-4 pt-4 md:px-5"><CardHeader title="Creditors · you owe them" sub="E.g. a distributor who paid recipients before the Dubai agent paid them" /></div>{list(creditors)}</Card>
      </div>
    </div>
  )
}
