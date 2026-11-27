import { Plus, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '@/data/store'
import { balances } from '@/domain/derive'
import { drcr } from '@/domain/format'
import { OPENING_CURRENCY, PARTY_TYPES, PARTY_TYPE_LABEL, type Party, type PartyType } from '@/domain/types'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, Empty } from '@/components/ui'
import { ImportPartiesDialog } from '@/components/party/ImportPartiesDialog'
import { PartyDialog } from '@/components/party/PartyDialog'

const TAB_LABEL: Record<PartyType, string> = {
  saudi_customer: 'Saudi Customers',
  saudi_collector: 'Saudi Collectors',
  dubai_collector: 'Dubai Collectors',
  dubai_agent: 'Dubai Agents',
  distributor: 'Distributors',
  operator: 'Operator Cash',
}

export default function Parties() {
  const data = useData()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as PartyType) || 'saudi_customer'
  const [dialog, setDialog] = useState<{ party?: Party } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const bal = useMemo(() => balances(data), [data])
  const list = data.parties.filter((p) => p.type === tab).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  const cur = OPENING_CURRENCY[tab]
  const region = (id?: string) => data.regions.find((r) => r.id === id)?.name ?? '—'

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Everyone in the chain, with their running balance. Open one to see the ledger.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setImportOpen(true)}><Upload /> Import PDF / CSV</Button>
          <Button variant="primary" onClick={() => setDialog({})}><Plus /> Add {PARTY_TYPE_LABEL[tab]}</Button>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex w-max gap-1 rounded-xl bg-surface-2 p-1">
          {PARTY_TYPES.map((t) => (
            <button key={t} onClick={() => setParams({ tab: t })} className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-muted', t === tab && 'bg-surface text-fg shadow-sm')}>
              {TAB_LABEL[t]} <span className="text-muted">{data.parties.filter((p) => p.type === t).length}</span>
            </button>
          ))}
        </div>
      </div>
      <Card className="p-0 md:p-0">
        {list.length ? (
          <ul className="divide-y divide-border">
            {list.map((p) => {
              const b = bal[p.id]?.[cur] ?? 0
              return (
                <li key={p.id} className={cn('flex items-center gap-3 px-4 py-3', !p.active && 'opacity-60')}>
                  <Link to={'/parties/' + p.id} className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-accent">{p.name} {!p.active && <Badge>inactive</Badge>}</div>
                    <div className="truncate text-xs text-muted">{[p.phone, p.type === 'distributor' && region(p.regionId)].filter(Boolean).join(' · ') || '—'}</div>
                  </Link>
                  <div className="text-right">
                    <div className={cn('font-semibold tabular-nums', b > 0.0005 ? 'text-pos' : b < -0.0005 ? 'text-neg' : '')}>{cur} {drcr(b)}</div>
                    {(['SAR', 'AED', 'INR'] as const).filter((c) => c !== cur && Math.abs(bal[p.id]?.[c] ?? 0) > 0.0005).map((c) => <div key={c} className="text-xs text-muted tabular-nums">{c} {drcr(bal[p.id][c])}</div>)}
                  </div>
                  <Button size="sm" onClick={() => setDialog({ party: p })}>Edit</Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty>No {TAB_LABEL[tab].toLowerCase()} yet. Add the first one or import from PDF / CSV.</Empty>
        )}
      </Card>
      <PartyDialog open={!!dialog} type={tab} party={dialog?.party} onClose={() => setDialog(null)} />
      <ImportPartiesDialog open={importOpen} type={tab} onClose={() => setImportOpen(false)} />
    </div>
  )
}
