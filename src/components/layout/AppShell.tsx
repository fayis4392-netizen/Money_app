import { Wallet, ChartColumn, FileUser, Ellipsis, Landmark, LayoutDashboard, Menu, Plus, ReceiptText, Scale, Settings, Truck, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { getState, hasUnsaved, useAppState, useSyncStatus, type SyncStatus } from '@/data/store'
import { backUpToDrive, driveBackupDue } from '@/data/backup'
import { driveConnected } from '@/lib/drive'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { rate } from '@/domain/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { RatesDialog } from './RatesDialog'
import { useDealDialog } from '@/components/deal/context'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  short?: string
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Main', items: [
    { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
    { to: '/deals', label: 'Deals', icon: ReceiptText },
    { to: '/transfers', label: 'Transfers', icon: Truck },
    { to: '/parties', label: 'Parties & Ledgers', short: 'Parties', icon: Users },
    { to: '/statements', label: 'Customer statements', short: 'Statements', icon: FileUser },
  ] },
  { group: 'Finance', items: [
    { to: '/capital', label: 'Capital', icon: Landmark },
    { to: '/expenses', label: 'Expenses', icon: Wallet },
    { to: '/balances', label: 'Debtors & Creditors', icon: Scale },
  ] },
  { group: 'Insights', items: [{ to: '/reports', label: 'Reports', icon: ChartColumn }] },
  { group: 'System', items: [{ to: '/settings', label: 'Settings', icon: Settings }] },
]
const ALL = NAV.flatMap((g) => g.items)
const TABS = ALL.slice(0, 4)

function titleFor(path: string) {
  return [...ALL].sort((a, b) => b.to.length - a.to.length).find((i) => (i.to === '/' ? path === '/' : path.startsWith(i.to)))?.label ?? 'Exchange Ledger'
}

export function AppShell() {
  const { pathname } = useLocation()
  const [menu, setMenu] = useState(false)
  const [rates, setRates] = useState(false)
  const quote = useAppState((s) => s.settings.dubaiQuote)
  const { newDeal } = useDealDialog()
  useEffect(() => {
    document.title = titleFor(pathname) + ' · Exchange Ledger'
  }, [pathname])

  const link = (i: NavItem) => (
    <NavLink
      key={i.to}
      to={i.to}
      end={i.to === '/'}
      onClick={() => setMenu(false)}
      className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg', isActive && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent')}
    >
      <i.icon className="size-[18px]" />
      {i.label}
    </NavLink>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* sidebar: fixed on desktop, a drawer below 1024px */}
      <div className={cn('fixed inset-0 z-40 bg-black/40 lg:hidden', menu ? 'block' : 'hidden')} onClick={() => setMenu(false)} />
      <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col gap-5 overflow-y-auto border-r border-border bg-surface px-3 py-4 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:translate-x-0', menu ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-3 px-2">
          <div className="grid size-9 place-items-center rounded-xl bg-accent text-sm font-black text-accent-fg">X</div>
          <div>
            <div className="text-sm font-bold">Exchange Ledger</div>
            <div className="text-xs text-muted">SAR → AED → INR</div>
          </div>
        </div>
        {NAV.map((g) => (
          <nav key={g.group} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{g.group}</div>
            {g.items.map(link)}
          </nav>
        ))}
        <SyncBox />
        <DriveReminder />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">{titleFor(pathname)}</h1>
          <Button onClick={() => setRates(true)} title="Update today's rates">
            <span className="text-muted max-sm:hidden">Dubai</span>
            <b className="tabular-nums">{rate(quote)}</b>
          </Button>
          <Button variant="primary" className="max-sm:size-9 max-sm:p-0" title="New deal" onClick={() => newDeal()}>
            <Plus />
            <span className="max-sm:hidden">New deal</span>
          </Button>
        </header>
        <main className="mx-auto w-full max-w-[1280px] px-4 pt-5 pb-28 md:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>

      {/* bottom tab bar on phones */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {TABS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted', isActive && 'text-accent')}>
            <i.icon className="size-5" />
            {i.short ?? i.label}
          </NavLink>
        ))}
        <button className="flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted" onClick={() => setMenu(true)}>
          <Ellipsis className="size-5" />
          More
        </button>
      </nav>

      <RatesDialog open={rates} onClose={() => setRates(false)} />
    </div>
  )
}

const SYNC_TEXT: Record<SyncStatus, [string, string]> = {
  local: ['bg-amber-500', 'Saved in this browser only'],
  saved: ['bg-emerald-500', 'All changes saved'],
  saving: ['bg-sky-500 animate-pulse', 'Saving…'],
  offline: ['bg-red-500', 'No connection: changes not saved yet'],
  error: ['bg-red-500', "Couldn't save: retrying"],
}

/** Where the books are saved, who is signed in, and sign out. */
function SyncBox() {
  const status = useSyncStatus()
  const [email, setEmail] = useState<string | undefined>()
  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setEmail(data.session?.user.email))
  }, [])
  const [dot, text] = SYNC_TEXT[status]
  return (
    <div className="mt-auto grid gap-1.5 rounded-xl bg-surface-2 p-3 text-xs text-muted">
      <div className="flex items-center gap-2 font-medium text-fg"><span className={cn('size-2 shrink-0 rounded-full', dot)} />{text}</div>
      {email && (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate" title={email}>{email}</span>
          <button className="shrink-0 text-accent hover:underline" onClick={() => { if (!hasUnsaved() || confirm('Some changes are not saved yet. Sign out anyway?')) void supabase!.auth.signOut() }}>Sign out</button>
        </div>
      )}
    </div>
  )
}

/**
 * Once a day: back up to Google Drive. If Google was already approved in this session it just
 * runs; otherwise it asks with a button (Google's window may only open from a click).
 */
function DriveReminder() {
  const status = useSyncStatus()
  useEffect(() => {
    if (status !== 'saved' && status !== 'local') return // books not loaded yet
    const key = 'exchange-ledger:drive-reminded'
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      /* private mode: remind anyway */
    }
    if (!driveBackupDue() || getState().parties.length === 0) return
    const run = () =>
      toast.promise(backUpToDrive(), { loading: 'Backing up to Google Drive…', success: (r) => 'Daily backup saved to Google Drive: ' + r.fileName, error: (e) => 'Drive backup failed: ' + (e as Error).message })
    if (driveConnected()) run()
    else toast('No Google Drive backup in the last day', { description: 'Takes a few seconds.', duration: 20000, action: { label: 'Back up now', onClick: run } })
  }, [status])
  return null
}
