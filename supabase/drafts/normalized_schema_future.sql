-- Exchange Ledger · initial schema (DRAFT — applied once the Supabase project exists)
--
-- Principles carried over from the prototype:
--   * money is numeric, never float; SAR to 3 decimals like the books, rates to 6
--   * every deal stores its own rates; changing today's rates never alters saved deals
--   * nothing is deleted: corrections are reversals / voids with a reason
--   * balances are computed from entries, never typed in
--   * ledger sign: + debit (party owes / holds money for the operator), − credit

create extension if not exists "pgcrypto";

-- ---------- people using the app ----------
create type app_role as enum ('owner', 'staff');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role app_role not null default 'staff',
  created_at timestamptz not null default now()
);

create or replace function is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner')
$$;

-- ---------- reference data ----------
create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create type party_type as enum ('saudi_customer', 'saudi_collector', 'dubai_collector', 'dubai_agent', 'distributor', 'operator');

create table parties (
  id uuid primary key default gen_random_uuid(),
  type party_type not null,
  name text not null,
  phone text not null default '',
  region_id uuid references regions,
  notes text not null default '',
  active boolean not null default true,
  opening_amount numeric(16,3) not null default 0, -- signed: + Dr, − Cr
  opening_date date,
  created_at timestamptz not null default now(),
  constraint distributor_has_region check (type <> 'distributor' or region_id is not null)
);

create table settings (
  id boolean primary key default true check (id), -- single row
  dubai_quote numeric(12,4) not null,              -- AED per ₹1,000
  sar_per_aed numeric(12,6) not null,             -- SAR per 1 AED
  default_distributor_fee_inr numeric(12,2) not null default 50,
  sale_narration text not null default 'By SALES A/C BANK ADD PASS',
  receipt_narration text not null default 'To CASH RECVD'
);

create table rate_updates (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  dubai_quote numeric(12,4) not null,
  sar_per_aed numeric(12,6) not null,
  note text,
  by_user uuid references profiles
);

create table premium_slabs (
  min_inr numeric(14,2) primary key,
  premium numeric(8,4) not null check (premium >= 0) -- SAR per ₹1,000
);

-- ---------- deals: ₹ to deliver, priced per ₹1,000 ----------
create type deal_status as enum ('pending_allocation', 'assigned', 'out_for_delivery', 'completed', 'cancelled');

create table deals (
  id uuid primary key default gen_random_uuid(),
  deal_no text not null unique,
  deal_date date not null,
  customer_id uuid not null references parties,
  inr_payout numeric(14,2) not null check (inr_payout > 0),
  dubai_quote numeric(12,4) not null,      -- frozen at entry
  sar_per_aed numeric(12,6) not null,     -- frozen at entry
  customer_rate numeric(12,4) not null,    -- SAR per ₹1,000
  premium numeric(8,4) not null,
  rate_override boolean not null default false,
  sar_amount numeric(16,3) not null,       -- = inr/1000 × customer_rate
  recipient_name text not null,
  recipient_phone text not null default '',
  recipient_address text not null default '',
  region_id uuid not null references regions,
  distributor_id uuid references parties,
  distributor_fee_inr numeric(12,2) not null default 0,
  status deal_status not null default 'pending_allocation',
  cancel_reason text,
  replaces_deal_id uuid references deals,
  created_by uuid references profiles,
  created_at timestamptz not null default now()
);

create table deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals,
  status deal_status not null,
  at timestamptz not null default now(),
  note text,
  by_user uuid references profiles
);

-- ---------- cash received from customers ----------
create table receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  customer_id uuid not null references parties,
  collector_id uuid not null references parties,
  amount numeric(16,3) not null check (amount > 0),
  received_on date not null,
  narration text,
  note text not null default '',
  voided_at timestamptz,
  void_reason text,
  created_by uuid references profiles,
  created_at timestamptz not null default now()
);

-- ---------- transfers: each step of the money down the chain, recorded as it happens ----------
--   send      Saudi collector → Dubai collector (SAR)
--   exchange  Dubai collector changes SAR → AED
--   settle    Dubai collector → Dubai agent (AED); the agent keeps your money in AED
--   payout    Dubai agent → distributor (₹), costing AED at the agent's AED per ₹1,000
create type transfer_kind as enum ('send', 'exchange', 'settle', 'payout');

create table transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_no text not null unique,
  kind transfer_kind not null,
  transfer_date date not null,
  from_id uuid not null references parties,
  to_id uuid references parties,
  sar numeric(16,3),
  aed numeric(16,3),
  inr numeric(16,2),
  rate numeric(14,6),          -- exchange: SAR per AED · payout: agent's AED per ₹1,000
  market_rate numeric(14,6),
  note text not null default '',
  voided_at timestamptz,
  void_reason text,
  created_by uuid references profiles,
  created_at timestamptz not null default now(),
  constraint transfer_amounts check (
    (kind = 'send' and sar > 0 and to_id is not null) or
    (kind = 'exchange' and sar > 0 and aed > 0 and rate > 0) or
    (kind = 'settle' and aed > 0 and to_id is not null) or
    (kind = 'payout' and inr > 0 and aed > 0 and rate > 0 and to_id is not null))
);

-- ---------- expenses: spent by whoever holds the operator's money ----------
create table expenses (
  id uuid primary key default gen_random_uuid(),
  expense_no text not null unique,
  expense_date date not null,
  paid_by uuid not null references parties,
  currency text not null check (currency in ('SAR', 'AED', 'INR')),
  amount numeric(16,3) not null check (amount > 0),
  category text not null,
  note text not null default '',
  voided_at timestamptz,
  void_reason text,
  created_by uuid references profiles,
  created_at timestamptz not null default now()
);

-- ---------- operator capital ----------
create type capital_kind as enum ('add', 'withdraw', 'transfer');

create table capital_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null unique,
  kind capital_kind not null,
  amount numeric(16,3) not null check (amount > 0),
  currency text not null check (currency in ('SAR', 'AED', 'INR')),
  party_id uuid not null references parties,
  to_party_id uuid references parties,
  entry_date timestamptz not null,
  note text not null default ''
);

-- ---------- limited edits: reworded particulars + an audit trail of every change ----------
create table ledger_narrations (
  line_key text primary key,               -- stable key of a derived ledger line
  text text not null,
  previous text,
  changed_at timestamptz not null default now(),
  by_user uuid references profiles
);

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by_user uuid references profiles,
  entity text not null,                    -- 'receipt', 'party', 'deal', ...
  entity_id uuid,
  action text not null,                    -- 'edit', 'void', 'reverse', ...
  changes jsonb,
  reason text
);

-- ---------- access: signed-in users only; only the owner changes rates and slabs ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','regions','parties','settings','rate_updates','premium_slabs','deals','deal_events','receipts','transfers','expenses','capital_entries','ledger_narrations','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read when signed in" on %I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['regions','parties','deals','deal_events','receipts','transfers','expenses','ledger_narrations','audit_log']
  loop
    execute format('create policy "staff write" on %I for insert to authenticated with check (true)', t);
    execute format('create policy "staff update" on %I for update to authenticated using (true)', t);
  end loop;
  foreach t in array array['settings','rate_updates','premium_slabs','capital_entries']
  loop
    execute format('create policy "owner write" on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;
-- no delete policies anywhere: corrections are reversals, never deletes.
