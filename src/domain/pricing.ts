import type { PremiumSlab } from './types'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
export const round4 = (n: number) => Math.round((n + Number.EPSILON) * 1e4) / 1e4
export const round6 = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6

/** The slab for a deal of `inr` rupees: the one with the highest minimum ≤ inr. */
export function slabFor(inr: number, slabs: PremiumSlab[]): PremiumSlab | undefined {
  return [...slabs].sort((a, b) => b.minInr - a.minInr).find((s) => inr >= s.minInr)
}

/** Customer rate (SAR per ₹1,000) = Dubai quote (AED per ₹1,000) + slab premium. */
export function suggestCustomerRate(inr: number, dubaiQuote: number, slabs: PremiumSlab[]) {
  return round4(dubaiQuote + (slabFor(inr, slabs)?.premium ?? 0))
}

/** ₹ per SAR implied by a Dubai quote and the SAR → AED rate. */
export function inrPerSar(dubaiQuote: number, sarPerAed: number) {
  return 1000 / (dubaiQuote * sarPerAed)
}

export interface PremiumDeal {
  customerRate: number
  /** SAR the customer pays (ledger debit), 3 decimals like the books */
  sar: number
  aedCost: number
  sarCost: number
  feeSar: number
  /** SAR left per ₹1,000 after paying Dubai in AED */
  profitPerThousand: number
  profitSar: number
  /** the same profit in ₹ at the Dubai rate */
  profitInr: number
}

/**
 * A deal priced per ₹1,000. Example: ₹1,00,000 at Dubai 39.52 AED + 2.00 premium,
 * 1 AED = 1.02145 SAR, ₹50 fee → SAR 4,152 collected, profit SAR 113.21.
 */
export function priceDeal(inr: number, dubaiQuote: number, customerRate: number, sarPerAed: number, feeInr: number): PremiumDeal {
  const k = inr / 1000
  const sar = round3(k * customerRate)
  const aedCost = round2(k * dubaiQuote)
  const sarCost = round2(aedCost * sarPerAed)
  const feeSar = round2(((feeInr * dubaiQuote) / 1000) * sarPerAed)
  const profitSar = round2(sar - sarCost - feeSar)
  return {
    customerRate,
    sar,
    aedCost,
    sarCost,
    feeSar,
    profitPerThousand: round4(customerRate - dubaiQuote * sarPerAed),
    profitSar,
    profitInr: round2(profitSar * inrPerSar(dubaiQuote, sarPerAed)),
  }
}

/** Delivery fee for a deal: ₹ per ₹1,00,000 delivered, e.g. ₹300 per lakh → ₹25,000 costs ₹75. */
export const deliveryFee = (inr: number, perLakh: number) => round2((inr * perLakh) / 100_000)
