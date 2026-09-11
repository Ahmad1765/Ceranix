-- =============================================================================
-- Migration: 20260912020000_enable_realtime_for_orders_and_listings.sql
-- Description: Add public.orders and public.listings to the supabase_realtime
--              publication so order fulfillment status and sold state broadcast
--              to buyer and seller clients in real time.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      execute 'alter publication supabase_realtime add table public.orders';
    end if;
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listings'
    ) then
      execute 'alter publication supabase_realtime add table public.listings';
    end if;
  end if;
end $$;
