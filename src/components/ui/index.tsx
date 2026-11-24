import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* shadcn-style primitives, kept in one file while the app is small */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-border bg-surface text-fg hover:bg-surface-2',
        primary: 'border-accent bg-accent text-accent-fg hover:brightness-110',
        danger: 'border-border bg-surface text-danger hover:bg-danger/10',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-fg',
      },
      size: { md: 'h-9 px-3.5', sm: 'h-8 px-2.5 text-xs', icon: 'size-9 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export function Button({ className, variant, size, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

const control =
  'w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-[15px] text-fg placeholder:text-muted/70 focus:border-transparent focus:outline-2 focus:outline-accent md:text-sm'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-9', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(control, 'h-9', className)} {...props} />
}

export function Field({ label, hint, className, children }: { label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-xs font-semibold text-muted', className)}>
      <span>{label}</span>
      {children}
      {hint && <span className="font-normal">{hint}</span>}
    </label>
  )
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl border border-border bg-surface p-4 shadow-sm md:p-5', className)} {...props} />
}

export function CardHeader({ title, action, sub }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-bold text-fg">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted', className)} {...props} />
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums break-words text-fg max-sm:text-base">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

/** Modal built on <dialog>: centered on desktop, a bottom sheet on phones. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        'm-auto max-h-[calc(100dvh-48px)] w-[min(560px,calc(100vw-32px))] flex-col rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] open:flex',
        'max-md:mb-0 max-md:max-h-[92dvh] max-md:w-screen max-md:max-w-none max-md:rounded-b-none',
        wide && 'w-[min(940px,calc(100vw-32px))]',
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-base font-bold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      {/* basis auto, not flex-1: iOS Safari collapses a 0-basis body when the dialog has no fixed height */}
      <div className="min-h-0 flex-auto shrink overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] max-md:[&>*]:flex-1">{footer}</div>}
    </dialog>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-16', className)} {...props} />
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>
}

/** Ask for a reason (cancel, void, edit) before running `onConfirm`. */
export function ReasonDialog({ open, title, message, confirm, danger, onClose, onConfirm }: { open: boolean; title: string; message: ReactNode; confirm: string; danger?: boolean; onClose: () => void; onConfirm: (reason: string) => boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} footer={<><Button onClick={onClose}>Back</Button><Button variant={danger ? 'danger' : 'primary'} type="submit" form="reason-form">{confirm}</Button></>}>
      {open && (
        <form
          id="reason-form"
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const r = String(new FormData(e.currentTarget).get('reason') ?? '')
            if (onConfirm(r)) onClose()
          }}
        >
          <p className="text-sm text-muted">{message}</p>
          <Field label="Reason"><Input name="reason" required autoFocus placeholder="Kept in the history" /></Field>
        </form>
      )}
    </Dialog>
  )
}

const STATUS_TONE: Record<string, string> = {
  pending_allocation: '',
  assigned: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
  out_for_delivery: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  cancelled: 'bg-red-500/15 text-red-600 dark:text-red-300',
}
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge className={STATUS_TONE[status]}>{label}</Badge>
}
