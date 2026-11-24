-- Exchange Ledger: keep the database small and live updates light.
-- Paste into Supabase → SQL Editor → Run, after 0001_app_state.sql. Safe to run again.
--
-- 1. Restore points thin out with age, so they never fill the free 500 MB:
--      last 2 days: one per hour · last 30 days: one per day · last 6 months: one per week.
-- 2. Live updates announce only "version N saved" (a tiny row), not the whole books.
-- 3. A size guard stops a broken save from writing something huge.

-- tiny row that open apps listen to
create table if not exists public.app_state_meta (
  id          int primary key default 1 check (id = 1),
  version     bigint not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
insert into public.app_state_meta (id, version, updated_at, updated_by)
  select id, version, updated_at, updated_by from public.app_state where id = 1
  on conflict (id) do update set version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

alter table public.app_state_meta enable row level security;
drop policy if exists "signed in can read the version" on public.app_state_meta;
create policy "signed in can read the version" on public.app_state_meta for select to authenticated using (true);
revoke all on public.app_state_meta from anon;
grant select on public.app_state_meta to authenticated;

-- listen to the tiny row instead of the whole books
do $$
begin
  alter publication supabase_realtime add table public.app_state_meta;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime drop table public.app_state;
exception when undefined_object then null;
end $$;

-- thin out restore points: keep the newest one per hour / day / week, by age
create or replace function public.prune_restore_points()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.app_state_history h
  using (
    select id,
           row_number() over (
             partition by case
               when saved_at >= now() - interval '2 days'  then date_trunc('hour', saved_at)
               when saved_at >= now() - interval '30 days' then date_trunc('day', saved_at)
               else date_trunc('week', saved_at)
             end
             order by saved_at desc
           ) as n
    from public.app_state_history
  ) ranked
  where h.id = ranked.id
    and (ranked.n > 1 or h.saved_at < now() - interval '180 days');
$$;
revoke all on function public.prune_restore_points() from public, anon, authenticated;

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
  if pg_column_size(new_data) > 50 * 1024 * 1024 then
    raise exception 'The books are too large to save (over 50 MB)' using errcode = '54000';
  end if;

  update public.app_state
     set data = new_data, version = version + 1, updated_at = now(), updated_by = auth.uid()
   where id = 1 and version = expected_version
  returning version into v;

  if v is null then
    raise exception 'conflict: someone else saved first' using errcode = 'P0409';
  end if;

  update public.app_state_meta set version = v, updated_at = now(), updated_by = auth.uid() where id = 1;

  -- a restore point at most once an hour; thinning runs only then, so ordinary saves stay fast
  select max(saved_at) into last_point from public.app_state_history;
  if last_point is null or last_point < now() - interval '1 hour' then
    insert into public.app_state_history (version, data, saved_by) values (v, new_data, auth.uid());
    perform public.prune_restore_points();
  end if;

  return v;
end;
$$;

revoke all on function public.save_state(bigint, jsonb) from public, anon;
grant execute on function public.save_state(bigint, jsonb) to authenticated;

-- tidy up what's already there
select public.prune_restore_points();
