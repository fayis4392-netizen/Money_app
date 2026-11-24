import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { toast } from 'sonner'
import { UserError } from '@/data/actions'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Run an action; show its message on success, or the reason it was refused. */
export function attempt(fn: () => void, ok?: string): boolean {
  try {
    fn()
    if (ok) toast.success(ok)
    return true
  } catch (e) {
    if (e instanceof UserError) toast.error(e.message)
    else {
      console.error(e)
      toast.error('Something went wrong: ' + (e as Error).message)
    }
    return false
  }
}
