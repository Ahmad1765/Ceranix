-- Ceranix — listing price history (mirrors live).
-- Captures every price change on `listings` so we can surface
-- "items you liked got cheaper" on the My Feed tab.
-- Run after setup.sql. Idempotent: safe to re-run.

create table if not exists public.listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  old_price numeric(10,2) not null,
  new_price numeric(10,2) not null,
  changed_at timestamptz not null default now()
);

create index if not exists listing_price_history_listing_changed_idx
  on public.listing_price_history (listing_id, changed_at desc);

create or replace function public.log_listing_price_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.price is distinct from old.price then
    insert into public.listing_price_history (listing_id, old_price, new_price)
    values (new.id, old.price, new.price);
  end if;
  return new;
end$$;

drop trigger if exists listings_price_change_trg on public.listings;
create trigger listings_price_change_trg
  after update on public.listings
  for each row execute function public.log_listing_price_change();

revoke execute on function public.log_listing_price_change() from public, anon, authenticated;

alter table public.listing_price_history enable row level security;

drop policy if exists "price history readable when listing readable"
  on public.listing_price_history;
create policy "price history readable when listing readable"
  on public.listing_price_history for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_price_history.listing_id
    )
  );
