# Exchange Ledger

Currency exchange transaction system for Sinan's SAR → AED → INR business.
Customers in Saudi Arabia ask for rupees to be delivered in India; the operator collects SAR, sends it through Dubai, and Indian distributors pay the recipients.

Built with React, Vite, TypeScript and Tailwind; Supabase (Postgres + logins) is the backend from phase 2.
The clickable prototype that this app follows lives in `~/Desktop/TradeApp/prototype.html` (hosted at https://shafila657-max.github.io/exchange-ledger/).

## Run it

```bash
npm install      # first time only
npm run dev      # http://localhost:5173
npm test         # pricing + ledger maths
npm run build    # type-check and build to dist/
```

## How pricing works

Everything is quoted **per ₹1,000 delivered**:

- The Dubai agent quotes **AED per ₹1,000** (e.g. 36.39).
- The customer is charged **SAR per ₹1,000 = Dubai quote + premium** (e.g. 36.39 + 2.00 = 38.39).
- Premium comes from slabs by deal size (₹0+: 2.00, ₹5 lakh+: 1.80, ₹20 lakh+: 1.50), editable in Settings, overridable per deal.
- Deals are typed in ₹ thousands: 25 = ₹25,000 → 25 × 38.39 = SAR 959.750 on the customer's ledger.
- Real profit per ₹1,000 = customer rate − Dubai quote ÷ SAR→AED rate (≈ 1.2–1.3 SAR at a 2.00 premium).

Ledgers follow the operator's books: Date · Particulars · Qty · Rate · Credit · Debit · Balance (Dr/Cr), 3 decimals.

## Layout

| Path | What |
|---|---|
| `src/domain/` | Pure business logic: types, pricing, ledger statements, formatting. Tested in `domain.test.ts`. |
| `src/data/` | `store.ts` holds app data; `actions.ts` is the only way to change it (validated with zod). |
| `src/components/ui/` | Buttons, inputs, cards, dialog (shadcn-style). |
| `src/components/layout/` | Sidebar, top bar, phone tab bar, rates dialog. |
| `src/pages/` | One file per screen. |
| `supabase/migrations/` | Database schema (draft until the Supabase project exists). |

## Status

- **Phase 1 · Foundation (done):** layout for desktop and phone, today's rates with history, premium slabs, defaults, tested maths.
- **Phase 2 · Core (done):** parties with opening balances, new deal with the distributor chosen up front, deal page (deliver, change distributor, correct, cancel), cash received, ledgers in the book format with audited edits and PDF/Excel export, sample books (Settings → Load sample data). Data is stored in the browser until Supabase is connected; logins come with it.
- **Phase 3 · Full chain (done):** transfers recorded one step at a time (send SAR to Dubai, exchange SAR → AED, settle with the Dubai agent, agent pays a distributor), each editable with a reason or voidable; who's-holding-what; profit at deal rates and at the ₹-per-SAR actually achieved; capital register, debtors & creditors, reports with CSV.
- **Next · Go-live:** connect Supabase (logins, shared data across devices, the schema in `supabase/migrations`), then host it (Vercel or Netlify).

## Connecting Supabase

1. Create a project at supabase.com.
2. Copy `.env.example` to `.env.local` and fill in the project URL and **anon** key (never the service key).
3. Apply `supabase/migrations/0001_schema.sql` in the SQL editor.
4. `src/data/store.ts` is swapped for a Supabase-backed store; screens don't change.
