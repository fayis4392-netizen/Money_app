import { z } from 'zod'
import { round2, round3, round4, round6, slabFor } from '@/domain/pricing'
import { PARTY_TYPES, PARTY_TYPE_LABEL, type CapitalEntry, type Deal, type Expense, type DealStatus, type Party, type PartyType, type PremiumSlab, type Receipt, type Settings, type Transfer, type TransferKind } from '@/domain/types'
import { getState, setState, type AppData } from './store'
import { balances, canCorrect } from '@/domain/derive'
import { dmy, drcr, f3, todayStr } from '@/domain/format'
import type { Currency } from '@/domain/types'

export class UserError extends Error {}

function check<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input)
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? 'Check the form')
  return r.data
}

/** A yyyy-mm-dd date, not more than 3 days ahead (catches a mistyped year). */
const day = (what = 'the date') =>
  z.string({ error: `Choose ${what}` }).min(1, `Choose ${what}`).regex(/^\d{4}-\d{2}-\d{2}$/, `Choose ${what}`).refine((d) => d >= '2000-01-01', `${what[0].toUpperCase() + what.slice(1)} looks wrong`).refine((d) => {
    const lim = new Date(); lim.setDate(lim.getDate() + 3)
    return d <= lim.toISOString().slice(0, 10) || d <= todayStr()
  }, `${what[0].toUpperCase() + what.slice(1)} is in the future: check the year`)

/** SAR per AED sits near 1.02 (both are pegged to the dollar); far from it is a typo, e.g. 0.979 typed the old way round. */
const SAR_PER_AED = { min: 1, max: 1.08 }
const sarPerAedOk = (r: number) => r >= SAR_PER_AED.min && r <= SAR_PER_AED.max
const sarPerAedMsg = (r: number) => `${r} SAR per AED looks wrong: it's usually about 1.02 (SAR you give for 1 AED)`

const positive = (what: string) => z.coerce.number({ error: `Enter ${what}` }).positive(`${what} must be greater than 0`)

const ratesSchema = z.object({
  dubaiQuote: positive('the Dubai quote'),
  sarPerAed: positive('the SAR per AED rate').refine(sarPerAedOk, { error: (i) => sarPerAedMsg(Number(i.input)) }),
  note: z.string().trim().optional(),
})

/** Today's Dubai quote (AED per ₹1,000) and SAR → AED rate; logged with time. */
export function setRates(input: unknown) {
  const v = check(ratesSchema, input)
  const prev = getState().settings.dubaiQuote
  if (prev > 0 && Math.abs(v.dubaiQuote - prev) / prev > 0.15) fail(`Dubai quote ${v.dubaiQuote} is far from the last one (${prev}): check for a typo`)
  setState((s) => ({
    ...s,
    settings: {
      ...s.settings,
      dubaiQuote: round4(v.dubaiQuote),
      sarPerAed: round6(v.sarPerAed),
      rateLog: [...s.settings.rateLog, { at: new Date().toISOString(), dubaiQuote: round4(v.dubaiQuote), sarPerAed: round6(v.sarPerAed), note: v.note || undefined }],
    },
  }))
}

const slabsSchema = z
  .array(z.object({ minInr: z.coerce.number().min(0, 'Minimum ₹ must be 0 or more'), premium: z.coerce.number().min(0, 'Premium must be 0 or more').max(10, 'Premium looks too big') }))
  .min(1, 'Keep at least one slab')
  .refine((r) => r.some((x) => x.minInr === 0), 'One slab must start at ₹0')
  .refine((r) => new Set(r.map((x) => x.minInr)).size === r.length, 'Two slabs have the same minimum')

export function saveSlabs(rows: unknown) {
  const v = check(slabsSchema, rows) as PremiumSlab[]
  setState((s) => ({ ...s, settings: { ...s.settings, slabs: v.map((x) => ({ minInr: x.minInr, premium: round4(x.premium) })).sort((a, b) => a.minInr - b.minInr) } }))
}

const defaultsSchema = z.object({
  distributorFeePerLakh: z.coerce.number().min(0, 'Delivery charge must be 0 or more'),
  saleNarration: z.string().trim().min(1, 'Sale particulars cannot be empty'),
  receiptNarration: z.string().trim().min(1, 'Receipt particulars cannot be empty'),
})

export function saveDefaults(input: unknown) {
  const v = check(defaultsSchema, input) as Pick<Settings, 'distributorFeePerLakh' | 'saleNarration' | 'receiptNarration'>
  setState((s) => ({ ...s, settings: { ...s.settings, ...v } }))
}

/* ======================= parties & regions ======================= */

const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const fail = (m: string): never => {
  throw new UserError(m)
}
const party = (id?: string) => getState().parties.find((p) => p.id === id)
const pname = (id?: string) => party(id)?.name ?? '—'

export function addRegion(name: string) {
  name = name.trim()
  if (!name) fail('Region name is required')
  if (getState().regions.some((r) => r.name.toLowerCase() === name.toLowerCase())) fail('Region already exists')
  const r = { id: uid(), name }
  setState((s) => ({ ...s, regions: [...s.regions, r] }))
  return r
}

const partySchema = z.object({
  id: z.string().optional(),
  type: z.enum(PARTY_TYPES as [PartyType, ...PartyType[]]),
  name: z.string().trim().min(1, 'Name is required'),
  phone: z.string().trim().default(''),
  regionId: z.string().optional(),
  notes: z.string().default(''),
  active: z.boolean().default(true),
  openingAmount: z.union([z.literal(''), z.coerce.number().min(0, 'Opening balance must be 0 or more')]).optional(),
  openingSide: z.enum(['Dr', 'Cr']).default('Dr'),
  openingDate: z.string().optional(),
  feePerLakh: z.union([z.literal(''), z.coerce.number().min(0, 'Delivery charge must be 0 or more')]).optional(),
})

export function saveParty(input: unknown): Party {
  const v = check(partySchema, input)
  if (v.type === 'distributor' && !v.regionId) fail('Distributors need a region')
  const same = getState().parties.find((p) => p.id !== v.id && p.type === v.type && p.name.trim().toLowerCase() === v.name.toLowerCase())
  if (same) fail(`There is already a ${PARTY_TYPE_LABEL[v.type].toLowerCase()} called ${same.name}: use a different name, e.g. add the town`)
  if (v.openingDate) check(day('the opening date'), v.openingDate)
  const oa = v.openingAmount === '' || v.openingAmount == null ? 0 : v.openingAmount
  const opening = oa > 0 ? { amount: round3(v.openingSide === 'Cr' ? -oa : oa), date: v.openingDate || new Date().toISOString().slice(0, 10) } : undefined
  const feePerLakh = v.type === 'distributor' && v.feePerLakh !== '' && v.feePerLakh != null ? round2(v.feePerLakh) : undefined
  const fields = { name: v.name, phone: v.phone, regionId: v.type === 'distributor' ? v.regionId : undefined, notes: v.notes, active: v.active, opening, feePerLakh }
  if (v.id) {
    const old = party(v.id) ?? fail('Party not found')
    const desc = (o?: Party['opening']) => (o ? `${drcr(o.amount)} on ${dmy(o.date)}` : 'none')
    const edits = [...(old.edits ?? [])]
    if (desc(old.opening) !== desc(opening)) edits.push({ at: now(), what: 'Opening balance', from: desc(old.opening), to: desc(opening) })
    const next = { ...old, ...fields, edits }
    setState((s) => ({ ...s, parties: s.parties.map((p) => (p.id === v.id ? next : p)) }))
    return next
  }
  const p: Party = { id: uid(), type: v.type, ...fields }
  setState((s) => ({ ...s, parties: [...s.parties, p] }))
  return p
}

/* ======================= deals ======================= */
const dealSchema = z.object({
  dealDate: day('the deal date'),
  customerId: z.string().min(1, 'Choose a customer'),
  inrK: z.coerce.number({ error: 'Enter the amount to deliver' }).positive('Enter the amount to deliver in India'),
  dubaiQuote: positive("the Dubai quote"),
  sarPerAed: positive('the SAR per AED rate').refine(sarPerAedOk, { error: (i) => sarPerAedMsg(Number(i.input)) }),
  customerRate: positive('the customer rate'),
  recipientName: z.string().trim().min(1, 'Recipient name is required'),
  recipientPhone: z.string().trim().default(''),
  recipientAddress: z.string().trim().default(''),
  regionId: z.string().min(1, 'Choose a delivery region'),
  distributorId: z.string().min(1, 'Choose a distributor'),
  fee: z.coerce.number().min(0, 'Delivery charge must be 0 or more'),
  replacesDealId: z.string().optional(),
})

function buildDeal(input: unknown, at: string): Deal {
  const v = check(dealSchema, input)
  const st = getState()
  const c = party(v.customerId)
  if (!c || c.type !== 'saudi_customer') fail('Choose a customer')
  const dist = party(v.distributorId)
  if (!dist || dist.type !== 'distributor') fail('Choose a distributor')
  if (dist!.regionId !== v.regionId) fail(`${dist!.name} does not deliver in that region`)
  if (v.customerRate > v.dubaiQuote * 1.3 || v.customerRate < v.dubaiQuote * 0.9) fail(`Customer rate ${v.customerRate} is far from the Dubai quote ${v.dubaiQuote}: check for a typo`)
  const inr = Math.round(v.inrK * 1000 * 100) / 100
  const sl = slabFor(inr, st.settings.slabs)
  const suggested = round4(v.dubaiQuote + (sl?.premium ?? 0))
  const rate = round4(v.customerRate)
  const n = st.counters.deal + 1
  return {
    id: uid(),
    dealNo: 'D-' + String(n).padStart(4, '0'),
    dealDate: v.dealDate,
    customerId: v.customerId,
    inrPayout: inr,
    dubaiQuote: round4(v.dubaiQuote),
    sarPerAed: round6(v.sarPerAed),
    customerRate: rate,
    premium: round4(rate - v.dubaiQuote),
    slab: sl,
    rateOverride: Math.abs(rate - suggested) > 1e-6,
    sarAmount: round3((inr / 1000) * rate),
    recipientName: v.recipientName,
    recipientPhone: v.recipientPhone,
    recipientAddress: v.recipientAddress,
    regionId: v.regionId,
    distributorId: dist!.id,
    distributorFeeInr: Math.round(v.fee * 100) / 100,
    status: 'assigned',
    history: [
      { status: 'pending_allocation', at, note: `Logged @ SAR ${rate} per ₹1,000 (Dubai ${v.dubaiQuote} AED + premium ${round4(rate - v.dubaiQuote)})` },
      { status: 'assigned', at, note: `Assigned to ${dist!.name} · fee ₹${v.fee}` },
    ],
    replacesDealId: v.replacesDealId || undefined,
    createdAt: at,
  }
}

/** New deal, assigned to its distributor straight away. */
export function addDeal(input: unknown): Deal {
  const at = now()
  const d = buildDeal(input, at)
  setState((s) => ({ ...s, deals: [...s.deals, d], counters: { ...s.counters, deal: s.counters.deal + 1 } }))
  return d
}

function cancelled(x: Deal, reason: string, at: string): Deal {
  return { ...x, status: 'cancelled', cancelReason: reason, history: [...x.history, { status: 'cancelled', at, note: reason }] }
}

export function cancelDeal(id: string, reason: string) {
  const x = getState().deals.find((d) => d.id === id) ?? fail('Deal not found')
  if (!reason.trim()) fail('Give a reason')
  if (!canCorrect(x)) fail('Only deals not yet out for delivery can be cancelled')
  setState((s) => ({ ...s, deals: s.deals.map((d) => (d.id === id ? cancelled(x, reason.trim(), now()) : d)) }))
}

/** Correct a deal: the original is cancelled with a reversal and the corrected one entered. */
export function reverseAndReenter(id: string, input: unknown): Deal {
  const x = getState().deals.find((d) => d.id === id) ?? fail('Deal not found')
  if (!canCorrect(x)) fail('This deal can no longer be corrected')
  const at = now()
  const d = buildDeal({ ...(input as object), replacesDealId: id }, at)
  setState((s) => ({
    ...s,
    deals: [...s.deals.map((o) => (o.id === id ? cancelled(x, 'Corrected by ' + d.dealNo, at) : o)), d],
    counters: { ...s.counters, deal: s.counters.deal + 1 },
  }))
  return d
}

export function reassignDistributor(id: string, distributorId: string, fee: unknown) {
  const x = getState().deals.find((d) => d.id === id) ?? fail('Deal not found')
  if (x.status !== 'assigned') fail('Only an assigned deal can be moved to another distributor')
  const dist = party(distributorId)
  if (!dist || dist.type !== 'distributor') fail('Choose a distributor')
  const f = Number(fee)
  if (!(f >= 0)) fail('Delivery charge must be 0 or more')
  const next = { ...x, distributorId, distributorFeeInr: Math.round(f * 100) / 100, history: [...x.history, { status: 'assigned' as DealStatus, at: now(), note: `Reassigned to ${dist!.name} · fee ₹${f}` }] }
  setState((s) => ({ ...s, deals: s.deals.map((d) => (d.id === id ? next : d)) }))
}

export function advanceDeal(id: string) {
  const x = getState().deals.find((d) => d.id === id) ?? fail('Deal not found')
  const nextStatus = ({ assigned: 'out_for_delivery', out_for_delivery: 'completed' } as Partial<Record<DealStatus, DealStatus>>)[x.status]
  if (!nextStatus) fail('No next step for this deal')
  const note = nextStatus === 'completed' ? `Paid ₹${x.inrPayout.toLocaleString('en-IN')} to ${x.recipientName}` : `With ${pname(x.distributorId)}`
  const next = { ...x, status: nextStatus!, history: [...x.history, { status: nextStatus!, at: now(), note }] }
  setState((s) => ({ ...s, deals: s.deals.map((d) => (d.id === id ? next : d)) }))
}

/* ======================= cash received ======================= */
const receiptSchema = z.object({
  customerId: z.string().min(1, 'Choose a customer'),
  collectorId: z.string().min(1, 'Choose who received the cash'),
  amount: positive('the amount'),
  date: day(),
  narration: z.string().trim().default(''),
  note: z.string().trim().default(''),
})

export function addReceipt(input: unknown): Receipt {
  const v = check(receiptSchema, input)
  if (party(v.customerId)?.type !== 'saudi_customer') fail('Choose a customer')
  if (party(v.collectorId)?.type !== 'saudi_collector') fail('Choose the Saudi collector who received the cash')
  const n = getState().counters.receipt + 1
  const r: Receipt = { id: uid(), receiptNo: 'R-' + String(n).padStart(4, '0'), ...v, amount: round3(v.amount), edits: [], createdAt: now() }
  setState((s) => ({ ...s, receipts: [...s.receipts, r], counters: { ...s.counters, receipt: n } }))
  return r
}

export function editReceipt(id: string, input: unknown, reason: string) {
  const r = getState().receipts.find((x) => x.id === id) ?? fail('Entry not found')
  if (r.voided) fail('This entry is voided')
  if (!reason?.trim()) fail('Give a reason for the change')
  const v = check(receiptSchema, { ...(input as object), customerId: r.customerId })
  const changes: string[] = []
  if (round3(v.amount) !== r.amount) changes.push(`amount ${f3(r.amount)} → ${f3(v.amount)}`)
  if (v.date !== r.date) changes.push(`date ${dmy(r.date)} → ${dmy(v.date)}`)
  if (v.collectorId !== r.collectorId) changes.push(`received by ${pname(r.collectorId)} → ${pname(v.collectorId)}`)
  if (v.narration !== r.narration) changes.push('particulars')
  if (v.note !== r.note) changes.push('note')
  if (!changes.length) fail('Nothing changed')
  if (party(v.collectorId)?.type !== 'saudi_collector') fail('Choose the Saudi collector who received the cash')
  const next: Receipt = { ...r, ...v, amount: round3(v.amount), edits: [...r.edits, { at: now(), changes, reason: reason.trim() }] }
  commit((s) => ({ ...s, receipts: s.receipts.map((x) => (x.id === id ? next : x)) }))
}

export function voidReceipt(id: string, reason: string, withDependents = false) {
  voidWithDependents({ kind: 'receipt', id }, reason, withDependents)
}

/* ============ money that was passed on: edits and voids never leave a collector below zero ============ */

/** Collectors can only pass on what they hold, so these must not go below zero. */
const MUST_HOLD: Partial<Record<PartyType, Currency[]>> = { saudi_collector: ['SAR'], dubai_collector: ['SAR', 'AED'] }
const OUT_CUR: Record<TransferKind, Currency> = { send: 'SAR', exchange: 'SAR', settle: 'AED', payout: 'AED' }

/** Holders a change would push below zero (or further below, if they already were). */
function shortfalls(before: AppData, after: AppData) {
  const b0 = balances(before), b1 = balances(after)
  const out: { partyId: string; cur: Currency; was: number; now: number }[] = []
  for (const p of after.parties)
    for (const cur of MUST_HOLD[p.type] ?? []) {
      const was = b0[p.id]?.[cur] ?? 0, now = b1[p.id]?.[cur] ?? 0
      if (now < -0.0005 && now < was - 0.0005) out.push({ partyId: p.id, cur, was, now })
    }
  return out
}

/** Later entries that took the money out, newest first: what a rollback would undo for this holder. */
const outgoing = (s: AppData, partyId: string, cur: Currency) =>
  s.transfers.filter((t) => !t.voided && t.fromId === partyId && OUT_CUR[t.kind] === cur).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))

const shortMsg = (x: ReturnType<typeof shortfalls>[number], s: AppData, sender?: string) => {
  if (x.partyId === sender) return `${pname(x.partyId)} doesn't hold that much: this would leave them at ${x.cur} ${drcr(x.now)}`
  const later = outgoing(s, x.partyId, x.cur).slice(0, 3).map((t) => t.no)
  return `${pname(x.partyId)} would be left at ${x.cur} ${drcr(x.now)}: that money was already passed on${later.length ? ` (${later.join(', ')})` : ''}. Change or void ${later.length ? 'those' : 'the later entries'} first.`
}

/** Apply a change only if no collector ends up holding less than nothing. */
function commit(fn: (s: AppData) => AppData, sender?: string) {
  const before = getState()
  const after = fn(before)
  const bad = shortfalls(before, after)
  if (bad.length) fail(shortMsg(bad.find((b) => b.partyId === sender) ?? bad[0], after, sender))
  setState(() => after)
}

type VoidTarget = { kind: 'receipt' | 'transfer'; id: string }

function applyVoids(s: AppData, target: VoidTarget, extra: Set<string>, at: string, reason: string, no: string): AppData {
  const tag = (x: { voided?: unknown }) => !x.voided
  return {
    ...s,
    receipts: s.receipts.map((r) => (target.kind === 'receipt' && r.id === target.id && tag(r) ? { ...r, voided: { at, reason } } : r)),
    transfers: s.transfers.map((t) =>
      target.kind === 'transfer' && t.id === target.id && tag(t) ? { ...t, voided: { at, reason } } : extra.has(t.id) && tag(t) ? { ...t, voided: { at, reason: `${reason} (rolled back with ${no})` } } : t,
    ),
  }
}

function targetOf(target: VoidTarget) {
  const s = getState()
  const x = target.kind === 'receipt' ? s.receipts.find((r) => r.id === target.id) : s.transfers.find((t) => t.id === target.id)
  if (!x) fail('Entry not found')
  if (x!.voided) fail('Already voided')
  return { no: 'receiptNo' in x! ? x.receiptNo : x!.no }
}

/**
 * What voiding this entry would also have to undo: the later entries that passed the same money on,
 * newest first, until nobody is left holding less than nothing (like rolling back a transaction).
 */
export function voidPlan(target: VoidTarget): Transfer[] {
  const { no } = targetOf(target)
  const s = getState()
  const extra = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const after = applyVoids(s, target, extra, '', '', no)
    const bad = shortfalls(s, after)
    if (!bad.length) return s.transfers.filter((t) => extra.has(t.id)).sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no))
    const next = outgoing(after, bad[0].partyId, bad[0].cur)[0]
    if (!next) fail(`Voiding ${no} would leave ${pname(bad[0].partyId)} at ${bad[0].cur} ${drcr(bad[0].now)}, and there's no later entry from them to undo. Check their ledger first.`)
    extra.add(next!.id)
  }
  return fail('Too many linked entries to undo at once')
}

/** Void an entry, and (when asked) the later entries that depend on it, all together or not at all. */
function voidWithDependents(target: VoidTarget, reason: string, withDependents: boolean) {
  const { no } = targetOf(target)
  if (!reason?.trim()) fail('Give a reason')
  const deps = voidPlan(target)
  if (deps.length && !withDependents) fail(`That money was already passed on by ${deps.map((t) => t.no).join(', ')}. Void those too, or change them first.`)
  commit((s) => applyVoids(s, target, new Set(deps.map((t) => t.id)), now(), reason.trim(), no))
}

/** Reword the particulars of one ledger line; amounts stay with their source. */
export function setNarration(key: string, text: string) {
  text = text.trim()
  if (!text) fail('Particulars cannot be empty')
  setState((s) => ({ ...s, narrations: { ...s.narrations, [key]: { text, at: now(), previous: s.narrations[key]?.text } } }))
}

/* ======================= transfers down the chain ======================= */
const KIND_PARTIES: Record<TransferKind, [PartyType, PartyType | null]> = {
  send: ['saudi_collector', 'dubai_collector'],
  exchange: ['dubai_collector', null],
  settle: ['dubai_collector', 'dubai_agent'],
  payout: ['dubai_agent', 'distributor'],
}
const FROM_LABEL: Record<TransferKind, string> = { send: 'the Saudi collector', exchange: 'the Dubai collector', settle: 'the Dubai collector', payout: 'the Dubai agent' }
const TO_LABEL: Record<TransferKind, string> = { send: 'the Dubai collector', exchange: '', settle: 'the Dubai agent', payout: 'the distributor' }

const transferSchema = z.object({
  kind: z.enum(['send', 'exchange', 'settle', 'payout']),
  date: day(),
  fromId: z.string().min(1, 'Choose who it comes from'),
  toId: z.string().optional(),
  amount: positive('the amount'),
  rate: z.union([z.literal(''), z.coerce.number().positive('Rate must be greater than 0')]).optional(),
  marketRate: z.union([z.literal(''), z.coerce.number().positive()]).optional(),
  /** exchange: AED actually received · payout: AED it costs; blank = worked out from the rate */
  result: z.union([z.literal(''), z.coerce.number().positive('The result must be greater than 0')]).optional(),
  note: z.string().trim().default(''),
})

/** Turn form input into the stored fields of a transfer, checking the parties and rates. */
type TransferFields = Omit<Transfer, 'id' | 'no' | 'edits' | 'createdAt' | 'voided'>
function transferFields(input: unknown): TransferFields {
  const v = check(transferSchema, input)
  const [fromType, toType] = KIND_PARTIES[v.kind]
  if (party(v.fromId)?.type !== fromType) fail('Choose ' + FROM_LABEL[v.kind])
  if (toType && party(v.toId)?.type !== toType) fail('Choose ' + TO_LABEL[v.kind])
  const rate = v.rate === '' || v.rate == null ? undefined : v.rate
  if ((v.kind === 'exchange' || v.kind === 'payout') && !rate) fail(v.kind === 'exchange' ? 'Enter the SAR per AED rate' : "Enter the agent's rate (AED per ₹1,000)")
  if (v.kind === 'exchange' && !sarPerAedOk(rate!)) fail(sarPerAedMsg(rate!))
  if (v.kind === 'payout') {
    const q = getState().settings.dubaiQuote
    if (Math.abs(rate! - q) / q > 0.1) fail(`Agent rate ${rate} is far from today's Dubai quote ${q} (AED per ₹1,000): check for a typo`)
  }
  // a typed-over result may be rounded, not wildly different
  const calc = v.kind === 'exchange' ? v.amount / rate! : v.kind === 'payout' ? (v.amount / 1000) * rate! : 0
  if (v.result && calc && Math.abs(v.result - calc) / calc > 0.02) fail(`AED ${v.result} is far from what the rate gives (AED ${f3(calc)}): check it`)
  const base = { kind: v.kind, date: v.date, fromId: v.fromId, toId: toType ? v.toId : undefined, note: v.note }
  switch (v.kind) {
    case 'send': return { ...base, sar: round3(v.amount) }
    // the result can be rounded by hand (e.g. AED 88 instead of 88.11): what was really received is what counts
    case 'exchange': return { ...base, sar: round3(v.amount), rate: round6(rate!), aed: v.result ? round3(v.result) : round3(v.amount / rate!) }
    // the Dubai agent keeps your money in AED; his rate is applied on each ₹ payment he makes
    case 'settle': return { ...base, aed: round3(v.amount) }
    case 'payout': return { ...base, inr: round2(v.amount), rate: round4(rate!), marketRate: v.marketRate ? round4(v.marketRate) : undefined, aed: v.result ? round3(v.result) : round3((v.amount / 1000) * rate!) }
  }
}

/** What the sender holds in the currency this transfer takes out. */
function holding(t: { kind: TransferKind; fromId: string }) {
  const cur = { send: 'SAR', exchange: 'SAR', settle: 'AED', payout: 'AED' }[t.kind] as 'SAR' | 'AED' | 'INR'
  return { cur, have: balances(getState())[t.fromId]?.[cur] ?? 0 }
}
const outOf = (t: TransferFields) => (t.kind === 'send' || t.kind === 'exchange' ? t.sar! : t.aed!)

export function addTransfer(input: unknown): Transfer {
  const f = transferFields(input)
  // collectors can only pass on cash they hold; the Dubai agent may pay a distributor before settling (credit)
  if (f.kind !== 'payout') {
    const { cur, have } = holding(f)
    if (outOf(f) > have + 0.0005) fail(`${pname(f.fromId)} holds only ${cur} ${f3(Math.max(0, have))}`)
  }
  const n = getState().counters.transfer + 1
  const t: Transfer = { id: uid(), no: 'T-' + String(n).padStart(4, '0'), ...f, edits: [], createdAt: now() }
  setState((s) => ({ ...s, transfers: [...s.transfers, t], counters: { ...s.counters, transfer: n } }))
  return t
}

export function editTransfer(id: string, input: unknown, reason: string) {
  const old = getState().transfers.find((x) => x.id === id) ?? fail('Entry not found')
  if (old.voided) fail('This entry is voided')
  if (!reason?.trim()) fail('Give a reason for the change')
  const f = transferFields({ ...(input as object), kind: old.kind })
  const changes: string[] = []
  const cmp = (label: string, a: unknown, b: unknown, fmt = (x: unknown) => String(x ?? '—')) => { if ((a ?? '') !== (b ?? '')) changes.push(`${label} ${fmt(a)} → ${fmt(b)}`) }
  cmp('date', old.date, f.date, (x) => dmy(String(x)))
  cmp('from', old.fromId, f.fromId, (x) => pname(String(x)))
  cmp('to', old.toId, f.toId, (x) => pname(x as string))
  cmp('SAR', old.sar, f.sar)
  cmp('AED', old.aed, f.aed)
  cmp('₹', old.inr, f.inr)
  cmp('rate', old.rate, f.rate)
  cmp('market rate', old.marketRate, f.marketRate)
  if (old.note !== f.note) changes.push('note')
  if (!changes.length) fail('Nothing changed')
  const next: Transfer = { ...old, sar: undefined, aed: undefined, inr: undefined, rate: undefined, marketRate: undefined, ...f, edits: [...old.edits, { at: now(), changes, reason: reason.trim() }] }
  commit((s) => ({ ...s, transfers: s.transfers.map((x) => (x.id === id ? next : x)) }), next.fromId)
}

export function voidTransfer(id: string, reason: string, withDependents = false) {
  voidWithDependents({ kind: 'transfer', id }, reason, withDependents)
}

/* ======================= operator capital ======================= */
const capitalSchema = z.object({
  kind: z.enum(['add', 'withdraw', 'transfer']),
  amount: positive('the amount'),
  currency: z.enum(['SAR', 'AED', 'INR']),
  partyId: z.string().min(1, 'Choose where the money is'),
  toPartyId: z.string().optional(),
  date: day(),
  note: z.string().trim().default(''),
})

export function capitalEntry(input: unknown): CapitalEntry {
  const v = check(capitalSchema, input)
  if (!party(v.partyId)) fail('Choose where the money is')
  if (v.kind === 'transfer') {
    if (!v.toPartyId) fail('Choose who receives the money')
    if (v.toPartyId === v.partyId) fail('From and to must be different')
    if (!party(v.toPartyId)) fail('Choose who receives the money')
  }
  if (v.kind !== 'add') {
    const have = balances(getState())[v.partyId]?.[v.currency] ?? 0
    if (v.amount > have + 0.0005) fail(`${pname(v.partyId)} holds only ${v.currency} ${f3(have)}`)
  }
  const n = getState().counters.capital + 1
  const c: CapitalEntry = { id: uid(), entryNo: 'C-' + String(n).padStart(4, '0'), ...v, amount: round3(v.amount), toPartyId: v.kind === 'transfer' ? v.toPartyId : undefined }
  setState((s) => ({ ...s, capital: [...s.capital, c], counters: { ...s.counters, capital: n } }))
  return c
}

/* ======================= expenses ======================= */
const expenseSchema = z.object({
  date: day(),
  paidById: z.string().min(1, 'Choose who paid'),
  currency: z.enum(['SAR', 'AED', 'INR']),
  amount: positive('the amount'),
  category: z.string().trim().min(1, 'Choose a category'),
  note: z.string().trim().default(''),
})

function expenseFields(input: unknown) {
  const v = check(expenseSchema, input)
  const p = party(v.paidById)
  if (!p || p.type === 'saudi_customer') fail('Choose who paid: a collector, agent, distributor or operator cash')
  return { ...v, amount: round3(v.amount) }
}

export function addExpense(input: unknown): Expense {
  const v = expenseFields(input)
  const n = getState().counters.expense + 1
  const e: Expense = { id: uid(), no: 'E-' + String(n).padStart(4, '0'), ...v, edits: [], createdAt: now() }
  setState((s) => ({ ...s, expenses: [...s.expenses, e], counters: { ...s.counters, expense: n } }))
  return e
}

export function editExpense(id: string, input: unknown, reason: string) {
  const old = getState().expenses.find((x) => x.id === id) ?? fail('Entry not found')
  if (old.voided) fail('This entry is voided')
  if (!reason?.trim()) fail('Give a reason for the change')
  const v = expenseFields(input)
  const changes: string[] = []
  if (v.amount !== old.amount || v.currency !== old.currency) changes.push(`amount ${old.currency} ${f3(old.amount)} → ${v.currency} ${f3(v.amount)}`)
  if (v.date !== old.date) changes.push(`date ${dmy(old.date)} → ${dmy(v.date)}`)
  if (v.paidById !== old.paidById) changes.push(`paid by ${pname(old.paidById)} → ${pname(v.paidById)}`)
  if (v.category !== old.category) changes.push(`category ${old.category} → ${v.category}`)
  if (v.note !== old.note) changes.push('note')
  if (!changes.length) fail('Nothing changed')
  const next: Expense = { ...old, ...v, edits: [...old.edits, { at: now(), changes, reason: reason.trim() }] }
  setState((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === id ? next : x)) }))
}

export function voidExpense(id: string, reason: string) {
  const e = getState().expenses.find((x) => x.id === id) ?? fail('Entry not found')
  if (e.voided) fail('Already voided')
  if (!reason?.trim()) fail('Give a reason')
  setState((s) => ({ ...s, expenses: s.expenses.map((x) => (x.id === id ? { ...e, voided: { at: now(), reason: reason.trim() } } : x)) }))
}
