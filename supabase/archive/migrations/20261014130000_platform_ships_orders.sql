-- =============================================================================
-- Grabsty ships every order itself. The seller's last step is "Ready for
-- Pickup" (fulfillment 'packing'); picked up / in transit / delivered are set
-- only by the logistics team (admins) or server-side jobs.
--
-- One guard on the table instead of per-function checks: sellers could reach
-- these states through advance_order_fulfillment, mark_order_shipped and
-- advance_escrow_status, and all of them write orders.fulfillment_status.
-- =============================================================================

create or replace function public.guard_platform_shipping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fulfillment_status is distinct from old.fulfillment_status
     and new.fulfillment_status in ('picked', 'shifting', 'delivered')
     -- No signed-in user: service role, cron, migrations.
     and auth.uid() is not null
     and not coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
     and not coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
     and not coalesce((select is_admin from public.profiles where id = auth.uid()), false)
  then
    raise exception 'Only the Grabsty logistics team can mark an order picked up, in transit or delivered'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_platform_shipping() from public, anon, authenticated;

drop trigger if exists trg_guard_platform_shipping on public.orders;
create trigger trg_guard_platform_shipping
  before update of fulfillment_status on public.orders
  for each row
  execute function public.guard_platform_shipping();
