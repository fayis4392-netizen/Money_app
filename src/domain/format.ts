import type { Currency } from './types'

const nfIN = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nfUS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf3 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export function money(n: number | null | undefined, c: Currency) {
  if (n == null || Number.isNaN(n)) return '—'
  return c === 'INR' ? '₹' + nfIN.format(n) : `${c} ${nfUS.format(n)}`
}

/** 3-decimal figure as used in the books */
export const f3 = (n: number) => nf3.format(n)

/** "10,212.840 Dr" */
export const drcr = (n: number) => `${f3(Math.abs(n))} ${n < -0.0005 ? 'Cr' : 'Dr'}`

/** Rate with 2–4 decimals */
export function rate(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  const r = Math.round(n * 1e4) / 1e4
  return (String(r).split('.')[1] ?? '').length < 2 ? r.toFixed(2) : String(r)
}

/** "₹1 lakh", "₹5 lakh", "₹25,000" */
export function lakh(n: number) {
  return n >= 100_000 ? nfIN.format(n / 100_000).replace(/\.00$/, '') + ' lakh' : new Intl.NumberFormat('en-IN').format(n)
}

/** yyyy-mm-dd or ISO → dd/mm/yyyy */
export const dmy = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '')

export const fdt = (s: string) =>
  new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
