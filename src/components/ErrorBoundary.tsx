import { Component, type ReactNode } from 'react'

/** If a screen hits a bug, show a way out instead of a blank page. The books are safe (saved separately). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h1 className="font-bold">Something went wrong on this screen</h1>
          <p className="mt-2 text-sm text-muted">Your books are safe: every change is saved as you make it. Reload to carry on; if it happens again, send a screenshot of this message.</p>
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs break-words text-muted">{this.state.error.message}</p>
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg" onClick={() => location.reload()}>Reload</button>
            <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => (location.href = '/')}>Go to dashboard</button>
          </div>
        </div>
      </div>
    )
  }
}
