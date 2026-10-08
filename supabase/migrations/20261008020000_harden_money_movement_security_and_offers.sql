-- =============================================================================
-- Migration: Harden Money Movement Security, RLS Lock-down, Offers Table & Server Bundles
-- Date: 2026-10-08
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RLS LOCK-DOWN: Orders, Transactions, and Pickups
-- ─────────────────────────────────────────────────────────────────────────────
-- Revoke direct PostgREST mutations (INSERT, UPDATE, DELETE) from authenticated
-- and anon users. Mutations must occur strictly via vetted SECURITY DEFINER RPCs.
-- Keep SELECT visibility for participants and verified admins.

alter table public.orders enable row level security;
alter table public.transactions enable row level security;
alter table public.order_seller_pickups enable row level security;

-- Add bundle tracking columns to public.orders
alter table public.orders
  add column if not exists bundle_item_ids uuid[],
  add column if not exists bundle_count integer default 1,
  add column if not exists payment_status text not null default 'pending';

-- Drop all permissive and legacy write policies
drop policy if exists "Buyers, sellers, and admins can update orders" on public.orders;
drop policy if exists "order_seller_pickups_party_access" on public.order_seller_pickups;
drop policy if exists "Sellers and admins can insert seller pickups" on public.order_seller_pickups;
drop policy if exists "Sellers and admins can update seller pickups" on public.order_seller_pickups;

-- Revoke direct table mutations
revoke insert, update, delete on public.orders from authenticated, anon, public;
revoke insert, update, delete on public.transactions from authenticated, anon, public;
revoke insert, update, delete on public.order_seller_pickups from authenticated, anon, public;

-- Grant SELECT only
grant select on public.orders to authenticated;
grant select on public.transactions to authenticated;
grant select on public.order_seller_pickups to authenticated;

-- Ensure robust SELECT policies
drop policy if exists "Buyers and sellers can view own orders" on public.orders;
drop policy if exists "Buyers, sellers, and admins can view orders" on public.orders;
create policy "Buyers, sellers, and admins can view orders" on public.orders
  for select to authenticated
  using (
    (select auth.uid()) = buyer_id 
    or (select auth.uid()) = seller_id
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

drop policy if exists "Buyers, sellers, and logistics admins can view transactions" on public.transactions;
create policy "Buyers, sellers, and logistics admins can view transactions" on public.transactions
  for select to authenticated
  using (
    (select auth.uid()) = buyer_id
    or (select auth.uid()) = seller_id
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

drop policy if exists "Sellers and admins can view seller pickups" on public.order_seller_pickups;
drop policy if exists "Participants and admins can view seller pickups" on public.order_seller_pickups;
create policy "Participants and admins can view seller pickups" on public.order_seller_pickups
  for select to authenticated
  using (
    (select auth.uid()) = seller_id
    or exists (select 1 from public.orders o where o.id = order_seller_pickups.order_id and o.buyer_id = (select auth.uid()))
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DEDICATED OFFERS TABLE & STRICT RLS
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null default 'PKR',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'countered', 'expired', 'canceled')),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  accepted_at timestamptz,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists offers_listing_buyer_idx on public.offers(listing_id, buyer_id, status);
create index if not exists offers_seller_status_idx on public.offers(seller_id, status, expires_at);
create index if not exists offers_message_id_idx on public.offers(message_id);

alter table public.offers enable row level security;

drop policy if exists "Offer participants and admins can view offers" on public.offers;
create policy "Offer participants and admins can view offers" on public.offers
  for select to authenticated
  using (
    (select auth.uid()) = buyer_id 
    or (select auth.uid()) = seller_id 
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

-- Prevent direct client mutations on offers table
revoke insert, update, delete on public.offers from authenticated, anon, public;
grant select on public.offers to authenticated;

-- Add reserved_until column on public.listings for temporary reservation holding
alter table public.listings
  add column if not exists reserved_until timestamptz;

-- Automatic trigger to populate public.offers when a user sends an offer message
drop function if exists public.trg_fn_sync_offer_on_message_insert() cascade;
create or replace function public.trg_fn_sync_offer_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv record;
  v_listing record;
  v_amount numeric;
begin
  if new.kind = 'offer' and coalesce(new.offer_status, 'pending') = 'pending' then
    select * into v_conv from public.conversations where id = new.conversation_id;
    if v_conv.id is not null and v_conv.listing_id is not null then
      select * into v_listing from public.listings where id = v_conv.listing_id;
      
      if (new.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
        v_amount := (new.metadata->>'amount')::numeric;
      else
        v_amount := null;
      end if;

      if v_amount is not null and v_amount > 0 and (v_listing.price is null or v_amount <= v_listing.price) then
        insert into public.offers (
          listing_id, buyer_id, seller_id, amount, status,
          expires_at, conversation_id, message_id, created_at, updated_at
        ) values (
          v_conv.listing_id,
          v_conv.buyer_id,
          v_conv.seller_id,
          v_amount,
          'pending',
          clock_timestamp() + interval '24 hours',
          v_conv.id,
          new.id,
          coalesce(new.created_at, clock_timestamp()),
          clock_timestamp()
        )
        on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_offer_on_message_insert on public.messages;
create trigger trg_sync_offer_on_message_insert
  after insert on public.messages
  for each row
  execute function public.trg_fn_sync_offer_on_message_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LISTINGS ANTI-TAMPER POLICY (Lock open orders against edits & deletes)
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Sellers can update own listings" on public.listings;
create policy "Sellers can update own listings" on public.listings
  for update to authenticated
  using (
    (select auth.uid()) = seller_id
    and not exists (
      select 1 from public.orders o
       where o.listing_id = listings.id
         and o.status in ('awaiting_payment', 'pending', 'paid', 'packing', 'shifting', 'delivered')
    )
  );

drop policy if exists "Sellers can delete own listings" on public.listings;
create policy "Sellers can delete own listings" on public.listings
  for delete to authenticated
  using (
    (select auth.uid()) = seller_id
    and not exists (
      select 1 from public.orders o
       where o.listing_id = listings.id
         and o.status in ('awaiting_payment', 'pending', 'paid', 'packing', 'shifting', 'delivered')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. HARDENED RPC: advance_order_fulfillment
-- Drop legacy function signatures to prevent 42P13 parameter default conflicts
drop function if exists public.advance_order_fulfillment(uuid, text, text, text, text, text) cascade;
drop function if exists public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) cascade;

create or replace function public.advance_order_fulfillment(
  p_order_id uuid,
  p_target_status text,
  p_courier text default null,
  p_tracking_number text default null,
  p_supplier_order_id text default null,
  p_supplier_name text default null,
  p_seller_pickup_address jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := false;
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_system_msg text;
  v_now timestamptz := clock_timestamp();
begin
  -- Identify service_role (e.g. courier webhooks running via background worker)
  v_is_service_role := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');

  if v_caller_id is null and not v_is_service_role then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Admin check: server-governed app_metadata or profiles.is_admin or service_role
  v_is_admin := v_is_service_role
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  -- Idempotency check: if already at target status, return immediately without re-triggering side-effects
  if v_order.fulfillment_status = p_target_status then
    return v_order;
  end if;

  -- Terminal status lockdown: block transitions out of completed, canceled, refunded, disputed except by admin
  if (v_order.status in ('completed', 'canceled', 'refunded', 'disputed') 
      or v_order.fulfillment_status in ('completed', 'canceled', 'refunded', 'disputed'))
     and not v_is_admin then
    raise exception 'Forbidden: order % is in % status and cannot be modified except by admin', 
      p_order_id, coalesce(v_order.status, v_order.fulfillment_status) 
      using errcode = '42501';
  end if;

  -- Role and state machine transition enforcement
  if p_target_status = 'packing' then
    if v_caller_id <> v_order.seller_id and not v_is_admin then
      raise exception 'Forbidden: only the seller or admin can mark order as packing' using errcode = '42501';
    end if;
    if v_order.payment_method = 'card' and v_order.status = 'awaiting_payment' and not v_is_admin then
      raise exception 'Cannot pack order awaiting card payment confirmation' using errcode = '22000';
    end if;
    if v_order.fulfillment_status not in ('pending', 'awaiting_payment', 'packing') and not v_is_admin then
      raise exception 'Cannot advance to packing from %', v_order.fulfillment_status using errcode = '22000';
    end if;

  elsif p_target_status = 'shifting' then
    if v_caller_id <> v_order.seller_id and not v_is_admin then
      raise exception 'Forbidden: only the seller or admin can dispatch package' using errcode = '42501';
    end if;
    if v_order.payment_method = 'card' and v_order.status = 'awaiting_payment' and not v_is_admin then
      raise exception 'Cannot dispatch order awaiting card payment confirmation' using errcode = '22000';
    end if;
    if v_order.fulfillment_status not in ('packing', 'pending', 'shifting') and not v_is_admin then
      raise exception 'Cannot advance to shifting from %', v_order.fulfillment_status using errcode = '22000';
    end if;

  elsif p_target_status = 'delivered' then
    -- Sellers must NEVER be permitted to mark delivered to prevent prematurely starting the escrow clock
    if v_caller_id = v_order.seller_id and not v_is_admin then
      raise exception 'Forbidden: sellers are not permitted to mark orders delivered. Delivery must be confirmed by courier webhook or buyer' 
        using errcode = '42501';
    end if;
    if not v_is_service_role and v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Forbidden: only courier webhook, admin, or buyer can confirm delivery' using errcode = '42501';
    end if;
    if v_order.fulfillment_status not in ('shifting', 'delivered') and not v_is_admin then
      raise exception 'Cannot mark delivered from %', v_order.fulfillment_status using errcode = '22000';
    end if;

  elsif p_target_status = 'completed' then
    if v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Forbidden: only the buyer or admin can complete order' using errcode = '42501';
    end if;
    if v_order.fulfillment_status not in ('delivered', 'completed') and not v_is_admin then
      raise exception 'Cannot complete order before it is delivered (current status: %)', v_order.fulfillment_status using errcode = '22000';
    end if;

  else
    raise exception 'Invalid target fulfillment status: %', p_target_status using errcode = '22000';
  end if;

  -- Apply updates to orders
  update public.orders
     set fulfillment_status = p_target_status,
         status = case
           when p_target_status = 'completed' then 'completed'
           else status
         end,
         escrow_status = case
           when p_target_status = 'packing' then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else escrow_status
         end,
         packed_at = case when p_target_status = 'packing' then coalesce(packed_at, v_now) else packed_at end,
         shifted_at = case when p_target_status = 'shifting' then coalesce(shifted_at, v_now) else shifted_at end,
         shipped_at = case when p_target_status = 'shifting' then coalesce(shipped_at, v_now) else shipped_at end,
         delivered_at = case when p_target_status in ('delivered', 'completed') then coalesce(delivered_at, v_now) else delivered_at end,
         completed_at = case when p_target_status = 'completed' then coalesce(completed_at, v_now) else completed_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         supplier_order_id = coalesce(p_supplier_order_id, supplier_order_id),
         supplier_name = coalesce(p_supplier_name, supplier_name)
   where id = p_order_id
  returning * into v_order;

  -- Store seller pickup address if provided
  if p_seller_pickup_address is not null then
    insert into public.order_seller_pickups (order_id, seller_id, pickup_address)
    values (p_order_id, v_order.seller_id, p_seller_pickup_address)
    on conflict (order_id) do update
      set pickup_address = excluded.pickup_address,
          updated_at = v_now;
  end if;

  -- Synchronize ledger row in public.transactions
  update public.transactions
     set status = case
           when p_target_status = 'packing' then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else status
         end,
         ready_for_pickup_at = case when p_target_status = 'packing' then coalesce(ready_for_pickup_at, v_now) else ready_for_pickup_at end,
         picked_up_at = case when p_target_status = 'shifting' then coalesce(picked_up_at, v_now) else picked_up_at end,
         delivered_at = case when p_target_status in ('delivered', 'completed') then coalesce(delivered_at, v_now) else delivered_at end,
         funds_released_at = case when p_target_status = 'completed' then coalesce(funds_released_at, v_now) else funds_released_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         updated_at = v_now
   where order_id = p_order_id;

  -- Real-time conversation message
  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    v_system_msg := case
      when p_target_status = 'packing' then 'Seller has begun packing! 📦 Pickup scheduled.'
      when p_target_status = 'shifting' then 'Package Shifting / Dispatched! 🚚' ||
        case when v_order.courier_name is not null then E'\nCourier: ' || v_order.courier_name else '' end ||
        case when v_order.tracking_number is not null and length(trim(v_order.tracking_number)) > 0 then E'\nTracking #: ' || v_order.tracking_number else '' end
      when p_target_status = 'delivered' then 'Package Delivered! 📬 Please inspect your item within 48 hours.'
      when p_target_status = 'completed' then 'Order Completed! 🎉 Buyer confirmed receipt and condition.'
      else null
    end;

    if v_system_msg is not null then
      insert into public.messages (
        conversation_id, sender_id, content, kind, metadata
      ) values (
        v_conv_id, coalesce(v_caller_id, v_order.seller_id), v_system_msg, 'system',
        jsonb_build_object(
          'order_id', p_order_id,
          'fulfillment_status', p_target_status,
          'courier', v_order.courier_name,
          'tracking_number', v_order.tracking_number,
          'updated_at', v_now
        )
      );
    end if;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. HARDENED RPC: complete_cod_order (Managed Courier Protection)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.complete_cod_order(uuid) cascade;

create or replace function public.complete_cod_order(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := false;
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  v_is_service_role := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');

  if v_caller_id is null and not v_is_service_role then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_is_admin := v_is_service_role
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if v_order.payment_method <> 'cod' then
    raise exception 'Order is not Cash on Delivery' using errcode = '22000';
  end if;

  -- For managed courier delivery, the seller cannot unilaterally confirm cash collection
  -- Cash collection must be confirmed by courier webhook (service_role), buyer, or admin
  if coalesce(v_order.shipping_method, 'managed') = 'managed' then
    if not v_is_service_role and not v_is_admin and v_caller_id <> v_order.buyer_id then
      raise exception 'For managed courier orders, Cash on Delivery completion must be confirmed by courier webhook, buyer, or admin'
        using errcode = '42501';
    end if;
  else
    -- Self-ship / in-person handover: seller, buyer, or admin can confirm
    if v_caller_id <> v_order.seller_id and v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Unauthorized to confirm this self-shipped CoD order' using errcode = '42501';
    end if;
  end if;

  -- Idempotent return if already completed
  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  if v_order.status in ('canceled', 'refunded') or v_order.fulfillment_status = 'canceled' then
    raise exception 'Order is canceled or refunded and cannot be completed' using errcode = '22000';
  end if;

  update public.orders
     set status = 'completed',
         fulfillment_status = 'completed',
         payment_status = 'paid',
         cod_paid_at = coalesce(cod_paid_at, v_now),
         delivered_at = coalesce(delivered_at, v_now),
         completed_at = coalesce(completed_at, v_now),
         escrow_status = 'COMPLETED_FUNDS_RELEASED'
   where id = p_order_id
  returning * into v_order;

  update public.transactions
     set status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         funds_released_at = coalesce(funds_released_at, v_now),
         updated_at = v_now
   where order_id = p_order_id;

  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = v_order.listing_id;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    ) values (
      v_conv_id, coalesce(v_caller_id, v_order.seller_id), 'Cash on Delivery Collected! 💵 Order completed successfully.', 'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'fulfillment_status', 'completed',
        'status', 'completed',
        'updated_at', v_now
      )
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.complete_cod_order(uuid) from public, anon;
grant execute on function public.complete_cod_order(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HARDENED RPC: confirm_order_received
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.confirm_order_received(uuid) cascade;

create or replace function public.confirm_order_received(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_buyer_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.buyer_id <> v_buyer_id then
    raise exception 'Only the verified buyer can confirm receipt of this order' using errcode = '42501';
  end if;

  if v_order.status in ('canceled', 'refunded') or v_order.fulfillment_status = 'canceled' then
    raise exception 'Cannot confirm receipt on a canceled or refunded order' using errcode = '22000';
  end if;

  -- Idempotent return if already completed
  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  update public.orders
     set status = 'completed',
         fulfillment_status = 'completed',
         escrow_status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         completed_at = coalesce(completed_at, v_now),
         cod_paid_at = case when payment_method = 'cod' then coalesce(cod_paid_at, v_now) else cod_paid_at end,
         payment_status = case when payment_method = 'cod' then 'paid' else payment_status end
   where id = p_order_id
  returning * into v_order;

  update public.transactions
     set status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         funds_released_at = coalesce(funds_released_at, v_now),
         updated_at = v_now
   where order_id = p_order_id
     and status in ('PENDING_PAYMENT', 'PAYMENT_SECURED_ESCROW', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED');

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    ) values (
      v_conv_id, v_buyer_id, 'Buyer confirmed receipt (Everything is OK)! 🎉 Escrow funds released to seller.', 'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'completed',
        'fulfillment_status', 'completed',
        'updated_at', v_now
      )
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.confirm_order_received(uuid) from public, anon;
grant execute on function public.confirm_order_received(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. HARDENED RPC: open_order_dispute (Server-enforced 48-hour Window)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.open_order_dispute(uuid, text) cascade;
drop function if exists public.open_order_dispute(uuid, text, text[]) cascade;

create or replace function public.open_order_dispute(
  p_order_id uuid,
  p_reason text,
  p_evidence_urls text[] default '{}'
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if v_order.buyer_id <> v_caller_id and not v_is_admin then
    raise exception 'Forbidden: only the buyer or admin may open a dispute for this order' using errcode = '42501';
  end if;

  -- Idempotency
  if v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then
    return v_order;
  end if;

  -- Terminal orders cannot be disputed
  if v_order.status in ('completed', 'canceled', 'refunded') and not v_is_admin then
    raise exception 'Cannot dispute an order that has already been completed or canceled' using errcode = '22000';
  end if;

  -- Must be in transit or delivered
  if v_order.fulfillment_status not in ('shifting', 'delivered') and not v_is_admin then
    raise exception 'Disputes can only be opened while in transit or upon delivery (current status: %)', v_order.fulfillment_status
      using errcode = '22000';
  end if;

  -- Enforce 48-hour inspection window server-side
  if v_order.fulfillment_status = 'delivered' and v_order.delivered_at is not null and not v_is_admin then
    if (v_now - v_order.delivered_at) > interval '48 hours' then
      raise exception 'The 48-hour buyer inspection dispute window for this order has expired' using errcode = '22000';
    end if;
  end if;

  update public.orders
     set status = 'disputed',
         fulfillment_status = 'disputed',
         escrow_status = 'DISPUTED',
         dispute_reason = p_reason,
         dispute_evidence_urls = p_evidence_urls,
         disputed_at = v_now
   where id = p_order_id
  returning * into v_order;

  -- Freeze transaction ledger
  update public.transactions
     set status = 'DISPUTED',
         dispute_reason = p_reason,
         dispute_evidence_urls = p_evidence_urls,
         disputed_at = v_now,
         updated_at = v_now
   where order_id = p_order_id;

  -- Dispatch dispute alert in conversation
  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    ) values (
      v_conv_id, v_caller_id,
      '⚠️ Buyer Protection Dispute Opened' || E'\nReason: ' || coalesce(p_reason, 'Damaged / Defective item reported') || E'\nFunds have been placed on temporary hold pending resolution.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'disputed',
        'fulfillment_status', 'disputed',
        'reason', p_reason,
        'disputed_at', v_now
      )
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.open_order_dispute(uuid, text, text[]) from public, anon;
grant execute on function public.open_order_dispute(uuid, text, text[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. HARDENED RPC: accept_chat_offer (Authoritative Offers Table & Inventory Lock)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.accept_chat_offer(uuid) cascade;

create or replace function public.accept_chat_offer(
  p_offer_message_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_offer public.offers;
  v_message public.messages;
  v_conversation public.conversations;
  v_listing public.listings;
  v_order public.orders;
  v_amount numeric;
  v_amount_cents integer;
  v_is_admin boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  -- 1. Locate offer either in public.offers or fall back to public.messages
  select * into v_offer
    from public.offers
   where id = p_offer_message_id or message_id = p_offer_message_id
     for update;

  if v_offer.id is null then
    -- Fallback: check messages table
    select * into v_message
      from public.messages
     where id = p_offer_message_id
       for update;

    if not found then
      raise exception 'Offer not found' using errcode = 'P0002';
    end if;

    if v_message.kind <> 'offer' then
      raise exception 'Message is not an offer' using errcode = '22000';
    end if;

    select * into v_conversation
      from public.conversations
     where id = v_message.conversation_id;

    if not found or v_conversation.listing_id is null then
      raise exception 'Conversation or listing not found' using errcode = 'P0002';
    end if;

    if (v_message.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
      v_amount := (v_message.metadata->>'amount')::numeric;
    else
      v_amount := null;
    end if;

    -- Insert into public.offers so future queries are backed by dedicated table
    insert into public.offers (
      id, listing_id, buyer_id, seller_id, amount, status, expires_at,
      conversation_id, message_id, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_conversation.listing_id,
      v_conversation.buyer_id,
      v_conversation.seller_id,
      coalesce(v_amount, 0),
      coalesce(v_message.offer_status, 'pending'),
      coalesce(v_message.created_at, v_now) + interval '24 hours',
      v_conversation.id,
      v_message.id,
      coalesce(v_message.created_at, v_now),
      v_now
    ) returning * into v_offer;
  end if;

  -- 2. Validate offer state
  if v_offer.status not in ('pending', 'proposed') then
    raise exception 'Offer is no longer active (current status: %)', v_offer.status using errcode = '22000';
  end if;

  if v_offer.expires_at < v_now then
    update public.offers set status = 'expired', updated_at = v_now where id = v_offer.id;
    raise exception 'Offer has expired' using errcode = '22000';
  end if;

  -- 3. Lock listing row and verify seller
  select * into v_listing
    from public.listings
   where id = v_offer.listing_id
     for update;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  if v_caller_id <> v_listing.seller_id and not v_is_admin then
    raise exception 'Only the verified seller may accept this offer' using errcode = '42501';
  end if;

  if v_listing.is_sold then
    raise exception 'Listing has already been sold or committed to another order' using errcode = '23505';
  end if;

  -- Validate amount is at most list price
  if v_offer.amount > v_listing.price and not v_is_admin then
    raise exception 'Offer amount cannot exceed listing price' using errcode = '22000';
  end if;

  v_amount_cents := round(v_offer.amount * 100)::integer;

  -- 4. Mark offer accepted
  update public.offers
     set status = 'accepted',
         accepted_at = v_now,
         updated_at = v_now
   where id = v_offer.id;

  -- Decline conflicting active offers for this listing
  update public.offers
     set status = 'declined',
         updated_at = v_now
   where listing_id = v_listing.id
     and id <> v_offer.id
     and status in ('pending', 'proposed');

  -- Synchronize chat message status if linked
  if v_offer.message_id is not null then
    update public.messages
       set offer_status = 'accepted',
           updated_at = v_now
     where id = v_offer.message_id;
  end if;

  -- 5. Lock inventory with a 24-hour reservation
  update public.listings
     set is_sold = true,
         reserved_until = v_now + interval '24 hours'
   where id = v_listing.id;

  -- 6. Check for existing awaiting_payment order or create one
  select * into v_order
    from public.orders
   where listing_id = v_listing.id
     and buyer_id = v_offer.buyer_id
     and status in ('awaiting_payment', 'pending')
   limit 1
   for update;

  if v_order.id is not null then
    update public.orders
       set amount_cents = v_amount_cents,
           status = 'awaiting_payment',
           fulfillment_status = 'awaiting_payment'
     where id = v_order.id
    returning * into v_order;
  else
    insert into public.orders (
      listing_id, buyer_id, seller_id, amount_cents, fee_cents,
      status, fulfillment_status, payment_method, payment_status,
      shipping_method, shipping_fee_cents, stripe_session_id
    ) values (
      v_listing.id, v_offer.buyer_id, v_listing.seller_id,
      v_amount_cents, 0,
      'awaiting_payment', 'awaiting_payment', 'card', 'unpaid',
      'managed', 25000, 'offer_' || v_offer.id::text
    ) returning * into v_order;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.accept_chat_offer(uuid) from public, anon;
grant execute on function public.accept_chat_offer(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. HARDENED RPC: counter_chat_offer
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.counter_chat_offer(uuid, numeric) cascade;
drop function if exists public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) cascade;

create or replace function public.counter_chat_offer(
  p_parent_offer_id uuid,
  p_amount numeric,
  p_note text default null,
  p_content text default null,
  p_conversation_id uuid default null,
  p_sender_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_parent public.messages;
  v_conversation public.conversations;
  v_child_msg public.messages;
  v_content text;
  v_amount_val numeric;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid offer amount' using errcode = '22000';
  end if;
  v_amount_val := round(p_amount, 2);

  select * into v_parent from public.messages where id = p_parent_offer_id for update;
  if not found then
    raise exception 'Parent offer message not found' using errcode = 'P0002';
  end if;

  if v_parent.kind <> 'offer' then
    raise exception 'Target message is not an offer' using errcode = '22000';
  end if;

  if v_parent.offer_status not in ('proposed', 'pending') then
    raise exception 'Offer is no longer active (current status: %)', v_parent.offer_status using errcode = '22000';
  end if;

  select * into v_conversation from public.conversations where id = v_parent.conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_caller_id <> v_conversation.buyer_id and v_caller_id <> v_conversation.seller_id then
    raise exception 'Not authorized to make an offer in this conversation' using errcode = '42501';
  end if;

  if v_caller_id = v_parent.sender_id then
    raise exception 'Cannot counter your own offer' using errcode = '22000';
  end if;

  -- Transition parent offer to countered in messages
  update public.messages
     set offer_status = 'countered', updated_at = v_now
   where id = p_parent_offer_id;

  -- Transition parent offer in public.offers
  update public.offers
     set status = 'countered', updated_at = v_now
   where message_id = p_parent_offer_id or id = p_parent_offer_id;

  v_content := coalesce(p_content, 'Counter-Offer: ' || v_amount_val::text || ' PKR');

  insert into public.messages (
    conversation_id, sender_id, content, kind, offer_status, parent_offer_id, metadata
  ) values (
    v_conversation.id,
    v_caller_id,
    v_content,
    'offer',
    'pending',
    p_parent_offer_id,
    jsonb_build_object(
      'amount', v_amount_val,
      'currency', 'PKR',
      'note', p_note,
      'parent_offer_id', p_parent_offer_id
    )
  ) returning * into v_child_msg;

  return v_child_msg;
end;
$$;

revoke execute on function public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) from public, anon;
grant execute on function public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. HARDENED RPC: process_checkout (Deadlock-free Server Bundle & Price Protection)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop all older/overloaded versions to avoid 42P13 parameter defaults conflict & ambiguity
drop function if exists public.process_checkout(uuid, uuid, text, jsonb, numeric, text) cascade;
drop function if exists public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text) cascade;
drop function if exists public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) cascade;
drop function if exists public.create_cod_order(uuid, jsonb, text, numeric) cascade;
drop function if exists public.create_cod_order(uuid, uuid, jsonb, numeric, text) cascade;
drop function if exists public.create_cod_order(uuid, uuid, jsonb, numeric, text, text) cascade;

create or replace function public.process_checkout(
  p_listing_id uuid,
  p_buyer_id uuid default null,
  p_payment_method text default 'cod',
  p_shipping_address jsonb default null,
  p_offer_amount numeric default null,
  p_delivery_notes text default null,
  p_shipping_method text default 'managed',
  p_bundle_item_ids uuid[] default null,
  p_expected_total numeric default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_is_service_role boolean := false;
  v_listing record;
  v_item_price_cents integer := 0;
  v_fee_cents integer := 0;
  v_shipping_method text;
  v_shipping_fee_cents integer;
  v_order public.orders;
  v_existing_order public.orders;
  v_order_status text;
  v_session_id text;
  v_now timestamptz := clock_timestamp();
  v_all_listing_ids uuid[];
  v_ordered_listing_ids uuid[];
  v_bundle_count integer := 1;
  v_bundle_subtotal_cents integer := 0;
  v_bundle_discount_pct integer := 0;
  v_bundle_savings_cents integer := 0;
  v_total_cents integer := 0;
  v_accepted_offer record;
  v_is_seller_mismatch boolean := false;
  v_seller_id uuid;
begin
  v_is_service_role := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');

  -- Enforce auth.uid() internally; do not trust client-supplied p_buyer_id for authenticated calls
  if auth.uid() is not null then
    v_caller_id := auth.uid();
  elsif v_is_service_role then
    v_caller_id := p_buyer_id;
  else
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_shipping_address is null then
    raise exception 'Shipping address is required' using errcode = '22000';
  end if;

  if p_payment_method not in ('cod', 'card') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;

  v_shipping_method := case
    when lower(trim(coalesce(p_shipping_method, 'managed'))) = 'self_ship' then 'self_ship'
    else 'managed'
  end;

  v_shipping_fee_cents := case
    when v_shipping_method = 'managed' then 25000
    else 0
  end;

  -- 1. Gather all listing IDs in bundle
  v_all_listing_ids := array[p_listing_id];
  if p_bundle_item_ids is not null and array_length(p_bundle_item_ids, 1) > 0 then
    select array_agg(distinct item_id) into v_all_listing_ids
      from unnest(array_cat(v_all_listing_ids, p_bundle_item_ids)) as item_id;
  end if;

  -- 2. Sort IDs to lock rows in consistent order (prevents database deadlocks)
  select array_agg(id order by id) into v_ordered_listing_ids
    from unnest(v_all_listing_ids) as id;

  v_bundle_count := coalesce(cardinality(v_ordered_listing_ids), 1);

  -- 3. Lock all listings FOR UPDATE
  perform 1 from public.listings where id = any(v_ordered_listing_ids) for update;

  select count(distinct seller_id) > 1, max(seller_id::text)::uuid
    into v_is_seller_mismatch, v_seller_id
    from public.listings
   where id = any(v_ordered_listing_ids);

  if v_is_seller_mismatch then
    raise exception 'All bundled items must be from the same seller' using errcode = '22000';
  end if;

  if v_seller_id = v_caller_id then
    raise exception 'You cannot buy your own listings' using errcode = '22000';
  end if;

  -- Verify all items exist
  if (select count(*) from public.listings where id = any(v_ordered_listing_ids)) <> v_bundle_count then
    raise exception 'One or more items in the order were not found' using errcode = 'P0002';
  end if;

  -- Primary listing record
  select * into v_listing from public.listings where id = p_listing_id;

  -- 4. Check whether single listing is sold or reserved
  if v_bundle_count = 1 then
    -- Check for an accepted offer in public.offers
    select * into v_accepted_offer
      from public.offers
     where listing_id = p_listing_id
       and buyer_id = v_caller_id
       and status = 'accepted'
       and (expires_at > v_now or accepted_at > (v_now - interval '24 hours'))
     order by accepted_at desc nulls last, created_at desc
     limit 1;

    if v_listing.is_sold then
      if v_accepted_offer.id is null then
        raise exception 'Listing is already sold' using errcode = '22000';
      end if;
    end if;

    if v_accepted_offer.id is not null then
      v_item_price_cents := round(v_accepted_offer.amount * 100)::integer;
    else
      v_item_price_cents := round(v_listing.price * 100)::integer;
    end if;

  else
    -- Bundle purchase: verify none of the items are sold
    if exists (select 1 from public.listings where id = any(v_ordered_listing_ids) and is_sold = true) then
      raise exception 'One or more items in the bundle are already sold' using errcode = '22000';
    end if;

    -- Calculate bundle discount server-side in SQL:
    -- 2 items: 5%, 3 items: 10%, 4 items: 15%, 5+ items: 20%
    v_bundle_discount_pct := case
      when v_bundle_count >= 5 then 20
      when v_bundle_count = 4 then 15
      when v_bundle_count = 3 then 10
      when v_bundle_count = 2 then 5
      else 0
    end;

    select sum(round(price * 100))::integer
      into v_bundle_subtotal_cents
      from public.listings
     where id = any(v_ordered_listing_ids);

    v_bundle_savings_cents := round((v_bundle_subtotal_cents * v_bundle_discount_pct) / 100.0)::integer;
    v_item_price_cents := v_bundle_subtotal_cents - v_bundle_savings_cents;
  end if;

  -- 5. Price-change protection: verify against expected_total if provided by buyer
  v_total_cents := v_item_price_cents + v_shipping_fee_cents;
  if p_expected_total is not null then
    if abs(round(p_expected_total * 100) - v_total_cents) > 5 then
      raise exception 'Price has changed: expected total % PKR but calculated % PKR. Please review before proceeding.',
        p_expected_total, (v_total_cents / 100.0)
        using errcode = '22000';
    end if;
  end if;

  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
  else
    v_order_status := 'awaiting_payment';
    v_session_id := null;
  end if;

  -- 6. Check existing order
  select * into v_existing_order
    from public.orders
   where listing_id = p_listing_id
     and buyer_id = v_caller_id
     and status in ('awaiting_payment', 'pending')
   order by created_at desc
   limit 1
   for update;

  if v_existing_order.id is not null then
    update public.orders
       set amount_cents = v_item_price_cents,
           payment_method = p_payment_method,
           status = v_order_status,
           fulfillment_status = v_order_status,
           shipping_method = v_shipping_method,
           shipping_fee_cents = v_shipping_fee_cents,
           shipping_address = p_shipping_address,
           delivery_notes = coalesce(p_delivery_notes, delivery_notes),
           stripe_session_id = coalesce(v_session_id, stripe_session_id),
           bundle_item_ids = case when v_bundle_count > 1 then p_bundle_item_ids else null end,
           bundle_count = v_bundle_count
     where id = v_existing_order.id
    returning * into v_order;

    update public.listings
       set is_sold = true,
           reserved_until = case when p_payment_method = 'card' then v_now + interval '24 hours' else null end
     where id = any(v_ordered_listing_ids);

    -- Sync transactions
    update public.transactions
       set payment_method = p_payment_method,
           amount_cents = v_total_cents,
           shipping_fee_cents = v_shipping_fee_cents,
           payout_amount_cents = v_item_price_cents,
           status = case when p_payment_method = 'cod' then 'PENDING_PAYMENT' else status end,
           updated_at = v_now
     where order_id = v_existing_order.id;

    return v_order;
  end if;

  -- 7. Insert new order
  insert into public.orders (
    listing_id, buyer_id, seller_id, amount_cents, fee_cents,
    status, fulfillment_status, payment_method, payment_status,
    shipping_method, shipping_fee_cents,
    shipping_address, delivery_notes, stripe_session_id,
    bundle_item_ids, bundle_count
  ) values (
    v_listing.id, v_caller_id, v_listing.seller_id,
    v_item_price_cents, v_fee_cents,
    v_order_status, v_order_status, p_payment_method,
    case when p_payment_method = 'cod' then 'pending' else 'unpaid' end,
    v_shipping_method, v_shipping_fee_cents,
    p_shipping_address, p_delivery_notes, v_session_id,
    case when v_bundle_count > 1 then p_bundle_item_ids else null end,
    v_bundle_count
  ) returning * into v_order;

  -- Mark listing(s) sold / reserved
  update public.listings
     set is_sold = true,
         reserved_until = case when p_payment_method = 'card' then v_now + interval '24 hours' else null end
   where id = any(v_ordered_listing_ids);

  return v_order;
end;
$$;

revoke execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) from public, anon;
grant execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) to authenticated, service_role;

-- Backward compatible alias for create_cod_order proxy
create or replace function public.create_cod_order(
  p_listing_id uuid,
  p_buyer_id uuid default null,
  p_shipping_address jsonb default null,
  p_offer_amount numeric default null,
  p_delivery_notes text default null,
  p_shipping_method text default 'managed'
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.process_checkout(
    p_listing_id => p_listing_id,
    p_buyer_id => p_buyer_id,
    p_payment_method => 'cod',
    p_shipping_address => p_shipping_address,
    p_offer_amount => p_offer_amount,
    p_delivery_notes => p_delivery_notes,
    p_shipping_method => p_shipping_method,
    p_bundle_item_ids => null,
    p_expected_total => null
  );
end;
$$;

revoke execute on function public.create_cod_order(uuid, uuid, jsonb, numeric, text, text) from public, anon;
grant execute on function public.create_cod_order(uuid, uuid, jsonb, numeric, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. HARDENED TRIGGER: trg_fn_auto_create_order_transaction
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.trg_fn_auto_create_order_transaction() cascade;

create or replace function public.trg_fn_auto_create_order_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_price integer := coalesce(new.amount_cents, 0);
  v_fee integer := coalesce(new.fee_cents, 0);
  v_shipping_fee integer := coalesce(new.shipping_fee_cents, 0);
  v_platform_fee integer;
  v_payout integer;
  v_total_amount integer;
  v_initial_status text;
begin
  v_platform_fee := least(v_item_price, greatest(0, v_fee));
  v_payout := greatest(0, v_item_price - v_platform_fee);
  v_total_amount := v_payout + v_platform_fee + v_shipping_fee;

  if v_total_amount <= 0 then
    v_total_amount := greatest(1, v_item_price);
    v_payout := v_total_amount;
    v_platform_fee := 0;
    v_shipping_fee := 0;
  end if;

  -- Strictly start at PENDING_PAYMENT until verified paid
  v_initial_status := case
    when new.status in ('paid') then 'PAYMENT_SECURED_ESCROW'
    else 'PENDING_PAYMENT'
  end;

  insert into public.transactions (
    order_id, listing_id, buyer_id, seller_id,
    amount_cents, platform_fee_cents, shipping_fee_cents, payout_amount_cents,
    currency, payment_method, status, escrow_secured_at
  ) values (
    new.id, new.listing_id, new.buyer_id, new.seller_id,
    v_total_amount, v_platform_fee, v_shipping_fee, v_payout,
    coalesce(new.currency, 'pkr'), coalesce(new.payment_method, 'cod'),
    v_initial_status,
    case when v_initial_status = 'PAYMENT_SECURED_ESCROW' then clock_timestamp() else null end
  )
  on conflict (order_id) do nothing;

  update public.orders
     set payout_amount_cents = v_payout,
         escrow_status = v_initial_status
   where id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_auto_create_order_transaction on public.orders;
create trigger trg_auto_create_order_transaction
  after insert on public.orders
  for each row
  execute function public.trg_fn_auto_create_order_transaction();

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. HARDENED RPC: advance_escrow_status
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.advance_escrow_status(uuid, text, text, text, text, text, text) cascade;

create or replace function public.advance_escrow_status(
  p_order_id uuid,
  p_target_status text,
  p_notes text default null,
  p_courier text default null,
  p_tracking_number text default null,
  p_dispute_reason text default null,
  p_cancel_reason text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := false;
  v_is_admin boolean := false;
  v_tx public.transactions;
  v_order public.orders;
  v_valid_transition boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  v_is_service_role := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');

  if v_caller_id is null and not v_is_service_role then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_is_admin := v_is_service_role
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  select * into v_tx from public.transactions where order_id = p_order_id for update;
  if not found then
    raise exception 'Transaction not found for order %', p_order_id using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  -- Idempotent return
  if v_tx.status = p_target_status then
    return v_tx;
  end if;

  -- Terminal lock
  if v_tx.status in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED') and not v_is_admin then
    raise exception 'Transaction is already finalized (% )', v_tx.status using errcode = '22000';
  end if;

  -- Valid transition map
  if v_tx.status = 'PENDING_PAYMENT' and p_target_status in ('PAYMENT_SECURED_ESCROW', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'PAYMENT_SECURED_ESCROW' and p_target_status in ('READY_FOR_PICKUP', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'READY_FOR_PICKUP' and p_target_status in ('IN_TRANSIT', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'IN_TRANSIT' and p_target_status in ('DELIVERED', 'DISPUTED', 'COMPLETED_FUNDS_RELEASED') then
    v_valid_transition := true;
  elsif v_tx.status = 'DELIVERED' and p_target_status in ('COMPLETED_FUNDS_RELEASED', 'DISPUTED') then
    v_valid_transition := true;
  elsif v_tx.status = 'DISPUTED' and p_target_status in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED') then
    v_valid_transition := true;
  end if;

  if not v_valid_transition and not v_is_admin then
    raise exception 'Illegal escrow state transition from % to %', v_tx.status, p_target_status using errcode = '22000';
  end if;

  -- Role authorization per state
  if p_target_status = 'PAYMENT_SECURED_ESCROW' then
    if not v_is_admin then
      raise exception 'Only verified server payment webhooks or admin can secure escrow' using errcode = '42501';
    end if;
  elsif p_target_status = 'READY_FOR_PICKUP' then
    if v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Only seller or admin can mark item ready for pickup' using errcode = '42501';
    end if;
  elsif p_target_status = 'IN_TRANSIT' then
    if v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Only seller or admin can mark shipment in transit' using errcode = '42501';
    end if;
  elsif p_target_status = 'DELIVERED' then
    -- Sellers are strictly forbidden
    if v_caller_id = v_tx.seller_id and not v_is_admin then
      raise exception 'Forbidden: sellers are not permitted to mark deliveries' using errcode = '42501';
    end if;
    if not v_is_service_role and v_caller_id <> v_tx.buyer_id and not v_is_admin then
      raise exception 'Only courier webhook, buyer, or admin can confirm delivery' using errcode = '42501';
    end if;
  elsif p_target_status = 'COMPLETED_FUNDS_RELEASED' then
    if v_caller_id <> v_tx.buyer_id and not v_is_admin then
      raise exception 'Only buyer or platform admin can release escrow funds' using errcode = '42501';
    end if;
  elsif p_target_status = 'DISPUTED' then
    if v_caller_id <> v_tx.buyer_id and not v_is_admin then
      raise exception 'Only buyer or admin can open a dispute' using errcode = '42501';
    end if;
  elsif p_target_status = 'CANCELLED' then
    if v_tx.status = 'DISPUTED' and not v_is_admin then
      raise exception 'Only platform admin can cancel and refund a disputed order' using errcode = '42501';
    elsif v_caller_id <> v_tx.buyer_id and v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Unauthorized to cancel this transaction' using errcode = '42501';
    end if;
  end if;

  update public.transactions
     set status = p_target_status,
         escrow_secured_at = case when p_target_status = 'PAYMENT_SECURED_ESCROW' then coalesce(escrow_secured_at, v_now) else escrow_secured_at end,
         ready_for_pickup_at = case when p_target_status = 'READY_FOR_PICKUP' then coalesce(ready_for_pickup_at, v_now) else ready_for_pickup_at end,
         picked_up_at = case when p_target_status = 'IN_TRANSIT' then coalesce(picked_up_at, v_now) else picked_up_at end,
         delivered_at = case when p_target_status in ('DELIVERED', 'COMPLETED_FUNDS_RELEASED') then coalesce(delivered_at, v_now) else delivered_at end,
         funds_released_at = case when p_target_status = 'COMPLETED_FUNDS_RELEASED' then coalesce(funds_released_at, v_now) else funds_released_at end,
         disputed_at = case when p_target_status = 'DISPUTED' then coalesce(disputed_at, v_now) else disputed_at end,
         cancelled_at = case when p_target_status = 'CANCELLED' then coalesce(cancelled_at, v_now) else cancelled_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         dispute_reason = coalesce(p_dispute_reason, dispute_reason),
         cancel_reason = coalesce(p_cancel_reason, cancel_reason),
         logistics_notes = coalesce(p_notes, logistics_notes),
         updated_at = v_now
   where order_id = p_order_id
  returning * into v_tx;

  -- Synchronize public.orders
  update public.orders
     set escrow_status = p_target_status,
         fulfillment_status = case
           when p_target_status = 'READY_FOR_PICKUP' then 'packing'
           when p_target_status = 'IN_TRANSIT' then 'shifting'
           when p_target_status = 'DELIVERED' then 'delivered'
           when p_target_status = 'COMPLETED_FUNDS_RELEASED' then 'completed'
           when p_target_status = 'DISPUTED' then 'disputed'
           when p_target_status = 'CANCELLED' then 'canceled'
           else fulfillment_status
         end,
         status = case
           when p_target_status = 'COMPLETED_FUNDS_RELEASED' then 'completed'
           when p_target_status = 'DISPUTED' then 'disputed'
           when p_target_status = 'CANCELLED' then 'canceled'
           else status
         end
   where id = p_order_id;

  return v_tx;
end;
$$;

revoke execute on function public.advance_escrow_status(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.advance_escrow_status(uuid, text, text, text, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. SERVER-VERIFIED PAYMENT WEBHOOK RPC: verify_payment_webhook
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.verify_payment_webhook(uuid, text, text, integer, text) cascade;

create or replace function public.verify_payment_webhook(
  p_order_id uuid,
  p_provider text,
  p_external_transaction_id text,
  p_amount_cents integer,
  p_idempotency_key text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := false;
  v_order public.orders;
  v_is_admin boolean := false;
  v_now timestamptz := clock_timestamp();
  v_expected_total_cents integer;
begin
  v_is_service_role := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');

  if v_caller_id is not null then
    v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
      or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
      or coalesce((select is_admin from public.profiles where id = v_caller_id), false);
    if not v_is_admin and not v_is_service_role then
      raise exception 'Forbidden: payment webhooks can only be processed by server' using errcode = '42501';
    end if;
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Idempotency check: if already verified and paid
  if v_order.status = 'paid' and v_order.escrow_status = 'PAYMENT_SECURED_ESCROW' then
    return v_order;
  end if;

  -- Check amount against order total
  v_expected_total_cents := v_order.amount_cents + coalesce(v_order.shipping_fee_cents, 0);
  if p_amount_cents <> v_expected_total_cents then
    raise exception 'Payment amount mismatch: webhook reported % cents but order total is % cents',
      p_amount_cents, v_expected_total_cents
      using errcode = '22000';
  end if;

  -- Advance order to paid and secured escrow
  update public.orders
     set status = 'paid',
         payment_status = 'paid',
         escrow_status = 'PAYMENT_SECURED_ESCROW',
         payment_authorized_at = coalesce(payment_authorized_at, v_now),
         stripe_payment_intent = coalesce(p_external_transaction_id, stripe_payment_intent),
         reserved_until = null
   where id = p_order_id
  returning * into v_order;

  -- Update transaction row
  update public.transactions
     set status = 'PAYMENT_SECURED_ESCROW',
         escrow_secured_at = coalesce(escrow_secured_at, v_now),
         updated_at = v_now
   where order_id = p_order_id;

  -- Ensure listing is marked sold
  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = v_order.listing_id;

  return v_order;
end;
$$;

revoke execute on function public.verify_payment_webhook(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.verify_payment_webhook(uuid, text, text, integer, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. MAINTENANCE JOBS: Reservation Expiry (24h) & Inspection Auto-Release (48h)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.release_expired_reservations() cascade;

create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rec record;
  v_now timestamptz := clock_timestamp();
begin
  for v_rec in
    select id, listing_id
      from public.orders
     where status = 'awaiting_payment'
       and created_at < (v_now - interval '24 hours')
     for update skip locked
  loop
    update public.orders
       set status = 'canceled',
           fulfillment_status = 'canceled',
           escrow_status = 'CANCELLED'
     where id = v_rec.id;

    update public.listings
       set is_sold = false,
           reserved_until = null
     where id = v_rec.listing_id
       and is_sold = true;

    v_count := v_count + 1;
  end loop;

  update public.listings
     set is_sold = false,
         reserved_until = null
   where reserved_until is not null
     and reserved_until < v_now
     and is_sold = true
     and not exists (
       select 1 from public.orders o
        where o.listing_id = listings.id
          and o.status not in ('canceled', 'refunded')
     );

  return v_count;
end;
$$;

drop function if exists public.auto_complete_delivered_orders() cascade;

create or replace function public.auto_complete_delivered_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_order record;
  v_now timestamptz := clock_timestamp();
begin
  for v_order in
    select id, listing_id, buyer_id, seller_id
      from public.orders
     where fulfillment_status = 'delivered'
       and status not in ('completed', 'canceled', 'refunded', 'disputed')
       and delivered_at is not null
       and delivered_at <= (v_now - interval '48 hours')
       and disputed_at is null
     for update skip locked
  loop
    update public.orders
       set status = 'completed',
           fulfillment_status = 'completed',
           escrow_status = 'COMPLETED_FUNDS_RELEASED',
           completed_at = v_now
     where id = v_order.id;

    update public.transactions
       set status = 'COMPLETED_FUNDS_RELEASED',
           funds_released_at = v_now,
           updated_at = v_now
     where order_id = v_order.id;

    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    )
    select c.id, v_order.buyer_id,
      'Order Auto-Completed! ⏱️ The 48-hour inspection period has elapsed with no disputes. Funds have been released to the seller.',
      'system',
      jsonb_build_object(
        'order_id', v_order.id,
        'status', 'completed',
        'fulfillment_status', 'completed',
        'auto_completed', true,
        'completed_at', v_now
      )
    from public.conversations c
    where c.listing_id = v_order.listing_id
      and ((c.buyer_id = v_order.buyer_id and c.seller_id = v_order.seller_id) or (c.buyer_id = v_order.seller_id and c.seller_id = v_order.buyer_id))
    limit 1;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.release_expired_reservations() from public, anon;
grant execute on function public.release_expired_reservations() to service_role;

revoke execute on function public.auto_complete_delivered_orders() from public, anon;
grant execute on function public.auto_complete_delivered_orders() to service_role;
