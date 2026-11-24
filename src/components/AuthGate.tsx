import type { Session } from '@supabase/supabase-js'
import { LockKeyhole } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { connectCloud, disconnectCloud, emptyData, loadLocal, seedCloud } from '@/data/store'
import { supabase } from '@/lib/supabase'
import { Button, Card, Field, Input } from '@/components/ui'

type Phase = 'checking' | 'signed-out' | 'loading' | 'first-time' | 'ready' | 'failed'

/**
 * Internal tool: only accounts created in Supabase can sign in (there is no sign-up).
 * Without Supabase set up, the app runs on this browser's own books.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(supabase ? 'checking' : 'ready')
  const [session, setSession] = useState<Session | null>(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    if (!supabase) return
    let current: string | null | undefined // the user whose books are open
    const open = async (s: Session | null) => {
      setSession(s)
      // Supabase repeats SIGNED_IN on token refresh and tab focus: only (re)load when the user changes
      if ((s?.user.id ?? null) === current) return
      current = s?.user.id ?? null
      if (!s) {
        disconnectCloud()
        setPhase('signed-out')
        return
      }
      setPhase('loading')
      try {
        const { firstTime } = await connectCloud()
        setPhase(firstTime ? 'first-time' : 'ready')
      } catch (e) {
        setProblem((e as Error).message)
        setPhase('failed')
      }
    }
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') void open(s)
      else if (s) setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (phase === 'ready') return <>{children}</>
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-accent text-lg font-black text-white">X</div>
          <div>
            <div className="font-bold">Exchange Ledger</div>
            <div className="text-xs text-muted">SAR → AED → INR</div>
          </div>
        </div>
        {phase === 'checking' || phase === 'loading' ? (
          <Card><p className="text-sm text-muted">{phase === 'loading' ? 'Loading the books…' : 'Checking sign-in…'}</p></Card>
        ) : phase === 'signed-out' ? (
          <SignIn />
        ) : phase === 'failed' ? (
          <Card>
            <p className="text-sm text-neg">Couldn't load the books: {problem}</p>
            <p className="mt-2 text-sm text-muted">Check the internet connection. If this keeps happening, the database setup script may not have been run yet.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={() => location.reload()}>Try again</Button>
              <Button onClick={() => supabase!.auth.signOut()}>Sign out</Button>
            </div>
          </Card>
        ) : (
          <FirstTime email={session?.user.email} onDone={() => setPhase('ready')} />
        )}
      </div>
    </div>
  )
}

function SignIn() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Card>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          setBusy(true)
          setError('')
          const { error } = await supabase!.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) })
          setBusy(false)
          if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
        }}
      >
        <h1 className="flex items-center gap-2 font-bold"><LockKeyhole className="size-4 text-accent" /> Sign in</h1>
        <Field label="Email"><Input name="email" type="email" autoComplete="username" required autoFocus /></Field>
        <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        {error && <p className="text-sm text-neg">{error}</p>}
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        <p className="text-xs text-muted">Internal tool. Ask the owner for an account.</p>
      </form>
    </Card>
  )
}

/** The shared books are empty: start them from this browser's books, or from nothing. */
function FirstTime({ email, onDone }: { email?: string; onDone: () => void }) {
  const local = loadLocal()
  const has = local.parties.length + local.deals.length > 0
  return (
    <Card>
      <h1 className="font-bold">Start the shared books</h1>
      <p className="mt-2 text-sm text-muted">Signed in as {email}. The online books are empty. Everyone who signs in will see and work on the same books.</p>
      <div className="mt-4 grid gap-2">
        {has && (
          <Button variant="primary" onClick={() => { seedCloud(local); onDone() }}>
            Upload this browser's books ({local.parties.length} parties · {local.deals.length} deals · {local.receipts.length} cash entries)
          </Button>
        )}
        <Button variant={has ? 'default' : 'primary'} onClick={() => { seedCloud(emptyData()); onDone() }}>Start empty</Button>
      </div>
    </Card>
  )
}
