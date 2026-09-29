-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20260929200000_payout_methods_upsert_rpc.sql
-- Description: Self-contained payout_methods table & atomic default payout RPC
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.payout_methods (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  kind text not null check (kind in ('bank','wallet')),
  label text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  is_default boolean default false not null,
  created_at timestamptz default now()
);

create index if not exists payout_methods_user_idx on public.payout_methods(user_id);
create unique index if not exists payout_methods_one_default_idx
  on public.payout_methods(user_id) where is_default = true;

alter table public.payout_methods enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'payout_methods' and policyname = 'payouts_select_own') then
    create policy "payouts_select_own" on public.payout_methods for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'payout_methods' and policyname = 'payouts_insert_own') then
    create policy "payouts_insert_own" on public.payout_methods for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'payout_methods' and policyname = 'payouts_update_own') then
    create policy "payouts_update_own" on public.payout_methods for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'payout_methods' and policyname = 'payouts_delete_own') then
    create policy "payouts_delete_own" on public.payout_methods for delete using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.set_default_payout(p_payload jsonb)
returns public.payout_methods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout public.payout_methods;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_kind text := p_payload->>'kind';
  v_label text := trim(p_payload->>'label');
  v_last4 text := trim(p_payload->>'account_last4');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_kind not in ('bank', 'wallet') then
    raise exception 'Invalid payout kind: %', v_kind using errcode = '22000';
  end if;

  if length(v_label) < 2 then
    raise exception 'Payout label must be at least 2 characters' using errcode = '22000';
  end if;

  if v_last4 !~ '^[0-9]{4}$' then
    raise exception 'Account last 4 must be exactly 4 digits' using errcode = '22000';
  end if;

  -- 1. Clear existing default payout method for this user
  update public.payout_methods
     set is_default = false
   where user_id = v_user_id
     and is_default = true
     and (v_id is null or id <> v_id);

  -- 2. Update existing or insert new default payout method
  if v_id is not null then
    update public.payout_methods
       set kind = v_kind,
           label = v_label,
           account_last4 = v_last4,
           is_default = true
     where id = v_id and user_id = v_user_id
    returning * into v_payout;

    if v_payout.id is null then
      raise exception 'Payout method not found or not owned by caller' using errcode = 'P0002';
    end if;
  else
    insert into public.payout_methods (
      user_id, kind, label, account_last4, is_default
    ) values (
      v_user_id,
      v_kind,
      v_label,
      v_last4,
      true
    )
    returning * into v_payout;
  end if;

  return v_payout;
end;
$$;

revoke execute on function public.set_default_payout(jsonb) from public, anon;
grant execute on function public.set_default_payout(jsonb) to authenticated, service_role;
