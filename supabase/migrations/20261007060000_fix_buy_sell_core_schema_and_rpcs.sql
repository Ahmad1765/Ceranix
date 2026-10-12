-- =============================================================================
-- Migration: Fix Buy/Sell Core Schema, Orders RLS, and Fulfillment RPCs
-- Date: 2026-10-07
-- Phase 1 Fixes:
--   1. Add missing `subcategory` & `color` columns to `public.listings`.
--   2. Add missing UPDATE RLS policy on `public.orders` for buyers, sellers & admins.
--   3. Fix `advance_order_fulfillment` state transitions (permit packing from
--      awaiting_payment/pending/packing, prevent premature CoD paid status).
--   4. Fix `complete_cod_order` to atomically complete CoD orders, advance
--      fulfillment_status to completed, release escrow, and update transactions.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SCHEMA: Add subcategory and color to public.listings
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.listings
  add column if not exists subcategory text,
  add column if not exists color text;

create index if not exists listings_category_subcategory_idx
  on public.listings(category, subcategory)
  where is_sold = false;

create index if not exists listings_color_idx
  on public.listings(color)
  where is_sold = false;

comment on column public.listings.subcategory is 'Optional category taxonomy subcategory slug.';
comment on column public.listings.color is 'Optional color taxonomy slug.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS: Add UPDATE policy on public.orders for buyers, sellers, and admins
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.orders enable row level security;

drop policy if exists "Buyers, sellers, and admins can update orders" on public.orders;
create policy "Buyers, sellers, and admins can update orders" on public.orders
  for update to authenticated
  using (
    (select auth.uid()) = buyer_id 
    or (select auth.uid()) = seller_id
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  )
  with check (
    (select auth.uid()) = buyer_id 
    or (select auth.uid()) = seller_id
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: advance_order_fulfillment (State Machine & Escrow Sync)
-- ─────────────────────────────────────────────────────────────────────────────

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
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_system_msg text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_is_admin := coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if p_target_status in ('packing', 'shifting') then
    if v_caller_id <> v_order.seller_id and not v_is_admin then
      raise exception 'Only the verified seller or admin may advance fulfillment to %', p_target_status using errcode = '42501';
    end if;
  elsif p_target_status in ('delivered', 'completed') then
    if v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Only the verified buyer or admin may confirm delivery or completion' using errcode = '42501';
    end if;
  else
    raise exception 'Invalid target fulfillment status: %', p_target_status using errcode = '22000';
  end if;

  -- Validate state machine progression (permit idempotent calls & awaiting_payment)
  if p_target_status = 'packing' then
    if v_order.fulfillment_status not in ('pending', 'awaiting_payment', 'packing') then
      raise exception 'Cannot advance to packing from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'shifting' then
    if v_order.fulfillment_status not in ('pending', 'awaiting_payment', 'packing', 'shifting') then
      raise exception 'Cannot advance to shifting from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'delivered' then
    if v_order.fulfillment_status not in ('packing', 'shifting', 'delivered') then
      raise exception 'Cannot mark delivered from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'completed' then
    if v_order.fulfillment_status not in ('delivered', 'shifting', 'completed') then
      raise exception 'Cannot complete order from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  end if;

  update public.orders
     set fulfillment_status = p_target_status,
         status = case
           when p_target_status = 'completed' then 'completed'
           -- Only transition card/escrow orders to paid on dispatch; CoD is paid on delivery
           when p_target_status = 'shifting' and status in ('pending', 'awaiting_payment') and coalesce(payment_method, '') <> 'cod' then 'paid'
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

  if p_seller_pickup_address is not null then
    insert into public.order_seller_pickups (order_id, seller_id, pickup_address)
    values (p_order_id, v_order.seller_id, p_seller_pickup_address)
    on conflict (order_id) do update
      set pickup_address = excluded.pickup_address,
          updated_at = v_now;
  end if;

  -- Synchronize public.transactions row
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
        v_conv_id, v_caller_id, v_system_msg, 'system',
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
-- 4. RPC: complete_cod_order (Atomic Seller CoD Completion)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.complete_cod_order(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
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

  v_is_admin := coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if v_caller_id <> v_order.seller_id and not v_is_admin then
    raise exception 'Only the seller or admin can mark a CoD order as completed' using errcode = '42501';
  end if;

  if v_order.payment_method <> 'cod' then
    raise exception 'Order is not Cash on Delivery' using errcode = '22000';
  end if;

  -- Idempotent return if already completed
  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  -- Prevent completing canceled or refunded orders
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

  -- Synchronize public.transactions row
  update public.transactions
     set status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         funds_released_at = coalesce(funds_released_at, v_now),
         updated_at = v_now
   where order_id = p_order_id;

  -- Ensure listing is marked is_sold = true
  update public.listings
     set is_sold = true
   where id = v_order.listing_id;

  -- Real-time conversation message
  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    ) values (
      v_conv_id, v_caller_id, 'Cash on Delivery Collected! 💵 Order completed successfully.', 'system',
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
