import { voidPlan, voidReceipt, voidTransfer, UserError } from '@/data/actions'
import { useData } from '@/data/store'
import { dmy, money } from '@/domain/format'
import { TRANSFER_LABEL, type Transfer } from '@/domain/types'
import { attempt } from '@/lib/utils'
import { ReasonDialog } from '@/components/ui'

const amountOf = (t: Transfer) => (t.kind === 'send' || t.kind === 'exchange' ? money(t.sar, 'SAR') : t.kind === 'settle' ? money(t.aed, 'AED') : money(t.inr, 'INR'))

function planFor(target: { kind: 'receipt' | 'transfer'; id: string } | null): { deps: Transfer[]; error?: string } {
  if (!target) return { deps: [] }
  try {
    return { deps: voidPlan(target) }
  } catch (e) {
    return { deps: [], error: e instanceof UserError ? e.message : String(e) }
  }
}

/**
 * Void a receipt or transfer. If the money was already passed on, lists the later entries that
 * would be left hanging and voids them together with it (all or nothing), like a rollback.
 */
export function VoidDialog({ target, no, onClose }: { target: { kind: 'receipt' | 'transfer'; id: string } | null; no?: string; onClose: () => void }) {
  const data = useData()
  // worked out on each render, so it always reflects the current books
  const plan = planFor(target)
  const name = (id?: string) => data.parties.find((p) => p.id === id)?.name ?? '—'
  const n = plan.deps.length

  const message = plan.error ? (
    <span className="text-neg">{plan.error}</span>
  ) : n ? (
    <span className="grid gap-2">
      <span>That money was already passed on. To keep every balance right, these later entries will be <b className="text-fg">voided together with {no}</b>, all at once:</span>
      <span className="grid gap-1 rounded-lg bg-surface-2 p-2 text-xs text-fg tabular-nums">
        {plan.deps.map((t) => (
          <span key={t.id} className="flex justify-between gap-3">
            <span>{dmy(t.date)} · {t.no} · {TRANSFER_LABEL[t.kind]} · {name(t.fromId)}{t.toId ? ' → ' + name(t.toId) : ''}</span>
            <b>{amountOf(t)}</b>
          </span>
        ))}
      </span>
      <span>Each stays in the list, struck out, with its lines reversed. Re-enter any that really happened.</span>
    </span>
  ) : (
    'The entry stays, struck out, and its lines are reversed on every ledger it touched.'
  )

  return (
    <ReasonDialog
      open={!!target}
      title={`Void ${no ?? ''}`}
      message={message}
      confirm={n ? `Void ${n + 1} entries` : 'Void entry'}
      danger
      onClose={onClose}
      onConfirm={(r) =>
        attempt(() => (target!.kind === 'receipt' ? voidReceipt(target!.id, r, true) : voidTransfer(target!.id, r, true)), n ? `${n + 1} entries voided` : 'Entry voided')
      }
    />
  )
}
