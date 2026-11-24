-- Exchange Ledger: shared books for signed-in users.
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run again.
--
-- The books are kept as one document (the same shape the app already uses), with a
-- version number so two people saving at the same moment can never overwrite each
-- other: a save only succeeds if nobody else saved in between.
-- A restore point is kept at most once an hour.

create table if not exists public.app_state (
  id          int primary key default 1 check (id = 1),     -- exactly one row: the books
  data        jsonb not null default '{}'::jsonb,
  version     bigint not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
insert into public.app_state (id) values (1) on conflict (id) do nothing;

create table if not exists public.app_state_history (
  id        bigint generated always as identity primary key,
  version   bigint not null,
  data      jsonb not null,
  saved_at  timestamptz not null default now(),
  saved_by  uuid references auth.users(id) on delete set null
);
create index if not exists app_state_history_saved_at on public.app_state_history (saved_at desc);

-- Only signed-in users can read; nobody can write the tables directly (only through save_state).
alter table public.app_state enable row level security;
alter table public.app_state_history enable row level security;
drop policy if exists "signed in can read the books" on public.app_state;
create policy "signed in can read the books" on public.app_state for select to authenticated using (true);
drop policy if exists "signed in can read restore points" on public.app_state_history;
create policy "signed in can read restore points" on public.app_state_history for select to authenticated using (true);
revoke all on public.app_state, public.app_state_history from anon;

-- Save the books if nobody else saved since `expected_version`; returns the new version.
create or replace function public.save_state(expected_version bigint, new_data jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
  last_point timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(new_data) <> 'object' or new_data->'parties' is null then
    raise exception 'That does not look like the books' using errcode = '22023';
  end if;

  update public.app_state
     set data = new_data, version = version + 1, updated_at = now(), updated_by = auth.uid()
   where id = 1 and version = expected_version
  returning version into v;

  if v is null then
    raise exception 'conflict: someone else saved first' using errcode = 'P0409';
  end if;

  select max(saved_at) into last_point from public.app_state_history;
  if last_point is null or last_point < now() - interval '1 hour' then
    insert into public.app_state_history (version, data, saved_by) values (v, new_data, auth.uid());
  end if;
  -- keep six months of restore points
  delete from public.app_state_history where saved_at < now() - interval '180 days';

  return v;
end;
$$;

revoke all on function public.save_state(bigint, jsonb) from public, anon;
grant execute on function public.save_state(bigint, jsonb) to authenticated;

-- Tell open apps when the books change, so everyone sees the same numbers.
do $$
begin
  alter publication supabase_realtime add table public.app_state;
exception when duplicate_object then null;
end $$;
