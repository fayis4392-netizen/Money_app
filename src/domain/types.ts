/**
 * Domain model for the SAR → AED → INR exchange ledger.
 *
 * Money flow: a Saudi customer asks for ₹ to be delivered in India and pays SAR.
 * The SAR goes (Saudi collector → Dubai collector) into AED, the Dubai agent
 * turns AED into ₹ and pays Indian distributors, who pay the recipient.
 *
 * Pricing is per ₹1,000 delivered: the Dubai agent quotes AED per ₹1,000 and the
 * customer is charged SAR per ₹1,000 = Dubai quote + premium.
 *
 * Ledger sign convention: + means the party owes / holds money for the operator (Dr),
 * − means the operator owes the party (Cr).
 */

export type Currency = 'SAR' | 'AED' | 'INR'

export type PartyType =
  | 'saudi_customer'
  | 'saudi_collector'
  | 'dubai_collector'
  | 'dubai_agent'
  | 'distributor'
  | 'operator'

export const PARTY_TYPES: PartyType[] = [
  'saudi_customer',
  'saudi_collector',
  'dubai_collector',
  'dubai_agent',
  'distributor',
  'operator',
]

export const PARTY_TYPE_LABEL: Record<PartyType, string> = {
  saudi_customer: 'Saudi Customer',
  saudi_collector: 'Saudi Collector',
  dubai_collector: 'Dubai Collector',
  dubai_agent: 'Dubai Agent',
  distributor: 'Indian Distributor',
  operator: 'Operator Cash',
}

/** Currency a party's opening balance is kept in. */
export const OPENING_CURRENCY: Record<PartyType, Currency> = {
  saudi_customer: 'SAR',
  saudi_collector: 'SAR',
  dubai_collector: 'SAR',
  dubai_agent: 'AED',
  distributor: 'INR',
  operator: 'INR',
}

export interface Region {
  id: string
  name: string
}

export interface Party {
  id: string
  type: PartyType
  name: string
  phone: string
  regionId?: string // distributors only
  notes?: string
  active: boolean
  /** signed: + Dr (owes operator), − Cr */
  opening?: { amount: number; date: string }
  /** distributors: their own delivery charge, ₹ per ₹1,00,000 (blank = the default in Settings) */
  feePerLakh?: number
  edits?: PartyEdit[]
}

/** Premium charged over the Dubai quote, by deal size in ₹. */
export interface PremiumSlab {
  minInr: number
  premium: number // SAR per ₹1,000
}

export interface RateUpdate {
  at: string
  dubaiQuote: number
  sarPerAed: number
  note?: string
}

export interface Settings {
  /** Dubai agent's quote today, AED per ₹1,000 */
  dubaiQuote: number
  /** SAR given for 1 AED (about 1.02) */
  sarPerAed: number
  slabs: PremiumSlab[]
  /** distributor's delivery charge: ₹ per ₹1,00,000 delivered (each distributor can have their own) */
  distributorFeePerLakh: number
  saleNarration: string
  receiptNarration: string
  rateLog: RateUpdate[]
  /** the last backup saved to Google Drive */
  lastDriveBackup?: { at: string; by?: string; fileName: string; folderUrl?: string }
}

export const DEFAULT_SETTINGS: Settings = {
  dubaiQuote: 36.5,
  sarPerAed: 1.0215,
  slabs: [
    { minInr: 0, premium: 2 },
    { minInr: 500_000, premium: 1.8 },
    { minInr: 2_000_000, premium: 1.5 },
  ],
  distributorFeePerLakh: 300,
  saleNarration: 'By SALES A/C BANK ADD PASS',
  receiptNarration: 'To CASH RECVD',
  rateLog: [],
}

export type DealStatus = 'pending_allocation' | 'assigned' | 'out_for_delivery' | 'completed' | 'cancelled'

export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  pending_allocation: 'Pending allocation',
  assigned: 'Assigned to distributor',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
}
export const DEAL_FLOW: DealStatus[] = ['pending_allocation', 'assigned', 'out_for_delivery', 'completed']

export interface DealEvent {
  status: DealStatus
  at: string
  note?: string
}

/** A deal: ₹ to deliver in India, priced per ₹1,000. Rates are frozen at entry. */
export interface Deal {
  id: string
  dealNo: string
  dealDate: string // yyyy-mm-dd
  customerId: string
  inrPayout: number
  dubaiQuote: number // AED per ₹1,000
  sarPerAed: number
  customerRate: number // SAR per ₹1,000
  premium: number
  slab?: PremiumSlab
  rateOverride: boolean
  sarAmount: number // 3 decimals
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  regionId: string
  distributorId?: string
  distributorFeeInr: number
  status: DealStatus
  history: DealEvent[]
  cancelReason?: string
  replacesDealId?: string
  createdAt: string
}

/** Cash received from a Saudi customer: credits their running account. */
export interface Receipt {
  id: string
  receiptNo: string
  customerId: string
  collectorId: string
  amount: number // SAR, 3 decimals
  date: string // yyyy-mm-dd
  narration: string // '' = default wording
  note: string
  edits: { at: string; changes: string[]; reason: string }[]
  voided?: { at: string; reason: string }
  createdAt: string
}

/** A reworded ledger line (amounts never change this way). */
export interface Narration {
  text: string
  at: string
  previous?: string
}

export interface PartyEdit {
  at: string
  what: string
  from: string
  to: string
}

/* ---------------- transfers: SAR → Dubai → AED → ₹ → distributors ---------------- */
/**
 * Money moving down the chain, recorded one step at a time as it happens:
 *  send      Saudi collector hands SAR to a Dubai collector
 *  exchange  Dubai collector changes SAR into AED
 *  settle    Dubai collector hands AED to the Dubai agent, who owes ₹ at their AED-per-₹1,000 rate
 *  payout    Dubai agent pays ₹ to an Indian distributor
 */
export type TransferKind = 'send' | 'exchange' | 'settle' | 'payout'

export const TRANSFER_LABEL: Record<TransferKind, string> = {
  send: 'Send SAR to Dubai',
  exchange: 'Exchange SAR → AED',
  settle: 'Settle with Dubai agent',
  payout: 'Dubai agent pays distributor',
}

/** One line on what each transfer step means, shown on the forms. */
export const TRANSFER_HELP: Record<TransferKind, string> = {
  send: 'The Saudi collector hands SAR to the Dubai collector.',
  exchange: 'The Dubai collector changes SAR into AED.',
  settle: 'The Dubai collector hands AED to the Dubai agent, who keeps it for you.',
  payout: "The Dubai agent pays ₹ to a distributor; it comes off your AED at the agent's rate.",
}

export interface Transfer {
  id: string
  no: string // T-0001
  kind: TransferKind
  date: string // yyyy-mm-dd
  /** send: Saudi collector · exchange/settle: Dubai collector · payout: Dubai agent */
  fromId: string
  /** send: Dubai collector · settle: Dubai agent · payout: distributor · exchange: unused */
  toId?: string
  sar?: number // send, exchange
  aed?: number // exchange (result), settle, payout (AED it cost)
  inr?: number // payout
  rate?: number // exchange: SAR per AED · payout: agent's AED per ₹1,000
  marketRate?: number // payout: market AED per ₹1,000, to see the agent's margin
  note: string
  edits: { at: string; changes: string[]; reason: string }[]
  voided?: { at: string; reason: string }
  createdAt: string
}

export type CapitalKind = 'add' | 'withdraw' | 'transfer'
export interface CapitalEntry {
  id: string
  entryNo: string
  kind: CapitalKind
  amount: number
  currency: Currency
  partyId: string // where the money is (add) / comes from (withdraw, transfer)
  toPartyId?: string // transfer only
  date: string // yyyy-mm-dd
  note: string
}

/* ---------------- expenses ---------------- */
export const DEFAULT_EXPENSE_CATEGORIES = ['Transport', 'Commission', 'Bank / exchange charge', 'Phone', 'Salary', 'Other']

/** Money spent by someone holding the operator's cash (or paid from their own pocket, to be repaid). */
export interface Expense {
  id: string
  no: string // E-0001
  date: string // yyyy-mm-dd
  paidById: string
  currency: Currency
  amount: number
  category: string
  note: string
  edits: { at: string; changes: string[]; reason: string }[]
  voided?: { at: string; reason: string }
  createdAt: string
}
