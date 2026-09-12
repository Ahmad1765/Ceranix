-- Migration: Dual-Option Logistics System & Admin Logistics Hub
-- File: supabase/migrations/20260912100500_dual_logistics_and_admin_hub.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROFILES: Add is_admin flag & Guard Column-Level Updates
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Enhance guard_profile_trust_fields trigger function to prevent client updates to is_admin
create or replace function public.guard_profile_trust_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Allow bypass for database administrators, service role, or SQL editor sessions
  if coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
     or current_user in ('postgres', 'supabase_admin', 'dashboard_user')
     or session_user in ('postgres', 'supabase_admin', 'dashboard_user') then
    return new;
  end if;

  -- Guard is_admin against unauthorized mutation
  if new.is_admin is distinct from old.is_admin then
    if coalesce(current_setting('app.auth_override_is_admin', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_admin) is read-only';
    end if;
  end if;

  if new.is_verified is distinct from old.is_verified then
    if coalesce(current_setting('app.auth_override_is_verified', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_verified) is read-only';
    end if;
  end if;

  if new.is_pro is distinct from old.is_pro then
    if coalesce(current_setting('app.auth_override_is_pro', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_pro) is read-only';
    end if;
  end if;

  if new.rating is distinct from old.rating then
    if coalesce(current_setting('app.auth_override_rating', true), '') <> 'authorized' then
      raise exception 'profile trust field (rating) is read-only';
    end if;
  end if;

  if new.total_sales is distinct from old.total_sales then
    if coalesce(current_setting('app.auth_override_total_sales', true), '') <> 'authorized' then
      raise exception 'profile trust field (total_sales) is read-only';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_trust on public.profiles;
create trigger trg_guard_profile_trust
  before update on public.profiles
  for each row execute procedure public.guard_profile_trust_fields();

revoke execute on function public.guard_profile_trust_fields() from public, anon, authenticated;

-- Helper function to grant or revoke admin status safely from SQL Editor / migrations
create or replace function public.set_admin_user(
  target_identifier text,
  make_admin boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.auth_override_is_admin', 'authorized', true);
  update public.profiles
     set is_admin = make_admin
   where lower(username) = lower(target_identifier)
      or id::text = target_identifier;
  perform set_config('app.auth_override_is_admin', 'off', true);
end;
$$;

revoke execute on function public.set_admin_user(text, boolean) from public, anon, authenticated;
grant execute on function public.set_admin_user(text, boolean) to service_role, postgres;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ORDERS: Dual Logistics Method, Shipping Fee, and Seller Pickup Address
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists shipping_method text not null default 'managed'
    check (shipping_method in ('managed', 'self_ship')),
  add column if not exists shipping_fee_cents integer not null default 0;

-- Drop seller_pickup_address from public.orders if present to protect seller contact/location from buyer-facing SELECT
alter table public.orders
  drop column if exists seller_pickup_address;

create index if not exists orders_shipping_method_idx
  on public.orders(shipping_method, fulfillment_status);

-- Dedicated, separately protected table for seller pickup address.
-- Strict RLS ensures only the verified seller and platform admins have read/write access.
create table if not exists public.order_seller_pickups (
  order_id uuid primary key references public.orders(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  pickup_address jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_seller_pickups enable row level security;

drop policy if exists "Sellers and admins can view seller pickups" on public.order_seller_pickups;
create policy "Sellers and admins can view seller pickups"
  on public.order_seller_pickups
  for select to authenticated
  using (
    (select auth.uid()) = seller_id
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

drop policy if exists "Sellers and admins can insert seller pickups" on public.order_seller_pickups;
create policy "Sellers and admins can insert seller pickups"
  on public.order_seller_pickups
  for insert to authenticated
  with check (
    (select auth.uid()) = seller_id
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

drop policy if exists "Sellers and admins can update seller pickups" on public.order_seller_pickups;
create policy "Sellers and admins can update seller pickups"
  on public.order_seller_pickups
  for update to authenticated
  using (
    (select auth.uid()) = seller_id
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

-- Dedicated RPC for seller or admin to fetch pickup address securely
create or replace function public.get_order_seller_pickup(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_order record;
  v_is_admin boolean := false;
  v_pickup jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select id, seller_id, buyer_id into v_order
    from public.orders
   where id = p_order_id;

  if not found then
    return null;
  end if;

  v_is_admin := coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if v_caller_id <> v_order.seller_id and not v_is_admin then
    raise exception 'Access denied to seller pickup address' using errcode = '42501';
  end if;

  select pickup_address into v_pickup
    from public.order_seller_pickups
   where order_id = p_order_id;

  return v_pickup;
end;
$$;

revoke execute on function public.get_order_seller_pickup(uuid) from public, anon;
grant execute on function public.get_order_seller_pickup(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ORDERS RLS: Grant Verified Admins Platform-Wide Read Access
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Buyers and sellers can view own orders" on public.orders;
drop policy if exists "Buyers, sellers, and admins can view orders" on public.orders;

create policy "Buyers, sellers, and admins can view orders" on public.orders
  for select to authenticated
  using (
    (select auth.uid()) = buyer_id 
    or (select auth.uid()) = seller_id
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: advance_order_fulfillment (Support Admin Access & Pickup Address Capture)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.advance_order_fulfillment(uuid, text, text, text, text, text);
drop function if exists public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb);

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
  v_caller_id uuid;
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_system_msg text;
begin
  -- 1. MANDATORY AUTHENTICATION CHECK
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- 2. LOCK & FETCH ORDER ROW
  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Check if caller is verified platform admin (guarantee false if no matching profile row exists)
  v_is_admin := coalesce(
    (select is_admin from public.profiles where id = v_caller_id),
    false
  );

  -- 3. STRICT ROLE-BASED ACTOR AUTHORIZATION (ALLOW SELLER OR ADMIN)
  if p_target_status in ('packing', 'shifting') then
    if v_caller_id <> v_order.seller_id and not v_is_admin then
      raise exception 'Only the verified seller or admin may advance fulfillment to %', p_target_status
        using errcode = '42501';
    end if;
  elsif p_target_status in ('delivered', 'completed') then
    if v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Only the verified buyer or admin may confirm delivery or completion'
        using errcode = '42501';
    end if;
  else
    raise exception 'Invalid target fulfillment status: %', p_target_status
      using errcode = '22000';
  end if;

  -- 4. STRICT TRANSITION INTEGRITY
  if p_target_status = 'packing' then
    if v_order.fulfillment_status <> 'pending' then
      raise exception 'Cannot advance to packing from % (order must be in pending status)', v_order.fulfillment_status
        using errcode = '22000';
    end if;
  elsif p_target_status = 'shifting' then
    if v_order.fulfillment_status <> 'packing' then
      raise exception 'Cannot advance to shifting from % (order must be packing or supplier processing first)', v_order.fulfillment_status
        using errcode = '22000';
    end if;
  elsif p_target_status = 'delivered' then
    if v_order.fulfillment_status <> 'shifting' then
      raise exception 'Cannot mark delivered from % (order must be shifting / in-transit)', v_order.fulfillment_status
        using errcode = '22000';
    end if;
  elsif p_target_status = 'completed' then
    if v_order.fulfillment_status not in ('delivered', 'shifting') then
      raise exception 'Cannot complete order from current fulfillment status: %', v_order.fulfillment_status
        using errcode = '22000';
    end if;
  end if;

  -- 5. APPLY STATUS UPDATE, TIMESTAMPS, AND SELLER PICKUP ADDRESS
  update public.orders
     set fulfillment_status = p_target_status,
         status = case
           when p_target_status = 'completed' then 'completed'
           when p_target_status = 'shifting' and status = 'pending' then 'paid'
           else status
         end,
         packed_at = case when p_target_status = 'packing' then coalesce(packed_at, now()) else packed_at end,
         shifted_at = case when p_target_status = 'shifting' then coalesce(shifted_at, now()) else shifted_at end,
         shipped_at = case when p_target_status = 'shifting' then coalesce(shipped_at, now()) else shipped_at end,
         delivered_at = case when p_target_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
         completed_at = case when p_target_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         supplier_order_id = coalesce(p_supplier_order_id, supplier_order_id),
         supplier_name = coalesce(p_supplier_name, supplier_name)
   where id = p_order_id
  returning * into v_order;

  -- Upsert seller pickup address into separately protected table if provided
  if p_seller_pickup_address is not null then
    insert into public.order_seller_pickups (order_id, seller_id, pickup_address)
    values (p_order_id, v_order.seller_id, p_seller_pickup_address)
    on conflict (order_id) do update
      set pickup_address = excluded.pickup_address,
          updated_at = now();
  end if;

  -- 6. DISPATCH REALTIME AUDIT MESSAGE IN CONVERSATION THREAD
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    if p_target_status = 'packing' then
      v_system_msg := case
        when v_order.shipping_method = 'managed' then 'Seller has begun packing! 📦 Ceranix Operations has been notified for courier pickup.'
        when v_order.fulfillment_type = 'dropship' then 'Order sent to Supplier / Warehouse for processing. 🏭'
        else 'Seller has begun packing your order! 📦'
      end;
    elsif p_target_status = 'shifting' then
      v_system_msg := 'Package Shifting / Dispatched! 🚚' ||
        case when v_order.courier_name is not null then E'\nCourier: ' || v_order.courier_name else '' end ||
        case when v_order.tracking_number is not null and length(trim(v_order.tracking_number)) > 0 then E'\nTracking #: ' || v_order.tracking_number else '' end;
    elsif p_target_status = 'delivered' then
      v_system_msg := 'Package Delivered! 📬 Please inspect your item within 48 hours.';
    elsif p_target_status = 'completed' then
      v_system_msg := 'Order Completed! 🎉 Buyer confirmed receipt and condition.';
    end if;

    insert into public.messages (
      conversation_id,
      sender_id,
      content,
      kind,
      metadata
    ) values (
      v_conv_id,
      v_caller_id,
      v_system_msg,
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'fulfillment_status', p_target_status,
        'shipping_method', v_order.shipping_method,
        'courier', v_order.courier_name,
        'tracking_number', v_order.tracking_number,
        'updated_at', now()
      )
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: process_checkout & create_cod_order (Enforce Shipping Fee & Method)
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.process_checkout(uuid, uuid, text, jsonb, numeric, text);
drop function if exists public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text);

create or replace function public.process_checkout(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_payment_method text,
  p_shipping_address jsonb,
  p_offer_amount numeric default null,
  p_delivery_notes text default null,
  p_shipping_method text default 'managed'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_listing record;
  v_item_price_cents integer;
  v_fee_cents integer := 0; -- Waived Buyer Protection fee
  v_shipping_method text;
  v_shipping_fee_cents integer;
  v_order public.orders;
  v_existing_order public.orders;
  v_is_authorized_offer_buyer boolean := false;
  v_order_status text;
  v_offer_message_id uuid := null;
  v_accepted_offer_amount numeric := null;
  v_session_id text;
  v_payment_intent text;
begin
  -- 1. Derive caller exclusively from auth.uid()
  v_caller_id := auth.uid();

  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_buyer_id is not null and p_buyer_id <> v_caller_id then
    raise exception 'Provided buyer_id does not match authenticated user' using errcode = '42501';
  end if;

  if p_shipping_address is null then
    raise exception 'Shipping address is required' using errcode = '22000';
  end if;

  if p_payment_method not in ('cod', 'card') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;

  -- 2. Validate & Enforce Shipping Method & Fee Internally (Never Trust Client Fee Inputs)
  v_shipping_method := case
    when lower(trim(coalesce(p_shipping_method, 'managed'))) = 'self_ship' then 'self_ship'
    else 'managed'
  end;

  v_shipping_fee_cents := case
    when v_shipping_method = 'managed' then 25000 -- Exactly PKR 250 in paisa
    else 0
  end;

  -- 3. Lock listing row to prevent double-booking race conditions
  select id, seller_id, price, is_sold, title
    into v_listing
    from public.listings
   where id = p_listing_id
     for update;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  if v_listing.seller_id = v_caller_id then
    raise exception 'You cannot buy your own listing' using errcode = '22000';
  end if;

  -- 4. Check for existing order by THIS buyer on this listing (e.g. from in-chat offer bridge)
  select *
    into v_existing_order
    from public.orders
   where listing_id = p_listing_id
     and buyer_id = v_caller_id
     and status in ('awaiting_payment', 'pending')
   order by created_at desc
   limit 1
   for update;

  if v_existing_order.id is not null then
    if v_existing_order.status = 'awaiting_payment' then
      if p_payment_method = 'cod' then
        v_order_status := 'pending';
        v_session_id := coalesce(v_existing_order.stripe_session_id, 'cod_' || gen_random_uuid()::text);
      else
        v_order_status := 'awaiting_payment';
        v_session_id := v_existing_order.stripe_session_id;
      end if;

      update public.orders
         set payment_method = p_payment_method,
             status = v_order_status,
             fulfillment_status = v_order_status,
             shipping_address = p_shipping_address,
             delivery_notes = coalesce(p_delivery_notes, delivery_notes),
             stripe_session_id = v_session_id,
             shipping_method = v_shipping_method,
             shipping_fee_cents = v_shipping_fee_cents
       where id = v_existing_order.id
      returning * into v_order;

      update public.listings
         set is_sold = true
       where id = p_listing_id;

      return v_order;
    end if;

    if v_existing_order.status = 'pending' and v_existing_order.payment_method = 'cod' then
      update public.orders
         set shipping_address = coalesce(p_shipping_address, shipping_address),
             delivery_notes = coalesce(p_delivery_notes, delivery_notes),
             shipping_method = v_shipping_method,
             shipping_fee_cents = v_shipping_fee_cents
       where id = v_existing_order.id
      returning * into v_order;

      return v_order;
    end if;
  end if;

  -- 5. If no existing order, check if caller is authorized by an accepted in-chat offer
  if v_listing.is_sold then
    select exists (
      select 1
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
       where c.listing_id = p_listing_id
         and c.buyer_id = v_caller_id
         and m.kind = 'offer'
         and m.offer_status = 'accepted'
         and not exists (
           select 1 from public.orders o
            where o.listing_id = p_listing_id
              and o.buyer_id <> v_caller_id
              and o.status in ('paid', 'pending', 'packing', 'shifting', 'delivered', 'completed')
         )
    ) into v_is_authorized_offer_buyer;

    if not v_is_authorized_offer_buyer then
      raise exception 'Listing is already sold' using errcode = '23505';
    end if;
  end if;

  -- 6. Check for existing active or paid order by ANY user on this listing
  if exists (
    select 1 from public.orders
     where listing_id = p_listing_id
       and status in ('paid', 'pending', 'packing', 'shifting', 'delivered', 'completed')
  ) then
    raise exception 'Listing already has an active order' using errcode = '23505';
  end if;

  -- 7. Calculate item price (check accepted offer if hint provided)
  if p_offer_amount is not null and p_offer_amount > 0 then
    select m.id, (m.metadata->>'amount')::numeric
      into v_offer_message_id, v_accepted_offer_amount
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where c.listing_id = p_listing_id
       and c.buyer_id = v_caller_id
       and m.kind = 'offer'
       and m.offer_status = 'accepted'
       and not exists (
         select 1 from public.orders o
          where o.offer_message_id = m.id
            and o.status <> 'canceled'
       )
     order by m.updated_at desc
     limit 1;

    if v_offer_message_id is not null and v_accepted_offer_amount is not null and v_accepted_offer_amount = p_offer_amount then
      v_item_price_cents := round(p_offer_amount * 100)::integer;
    else
      v_offer_message_id := null;
      v_item_price_cents := round(v_listing.price * 100)::integer;
    end if;
  else
    v_item_price_cents := round(v_listing.price * 100)::integer;
  end if;

  if v_item_price_cents <= 0 then
    raise exception 'Invalid order amount' using errcode = '22000';
  end if;

  -- 8. Determine initial order status
  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
    v_payment_intent := null;
  else
    v_order_status := 'pending';
    v_session_id := null;
    v_payment_intent := null;
  end if;

  -- 9. Insert order row
  insert into public.orders (
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    fee_cents,
    shipping_fee_cents,
    shipping_method,
    currency,
    stripe_session_id,
    stripe_payment_intent,
    offer_message_id,
    payment_method,
    status,
    fulfillment_status,
    shipping_address,
    delivery_notes
  ) values (
    p_listing_id,
    v_caller_id,
    v_listing.seller_id,
    v_item_price_cents,
    v_fee_cents,
    v_shipping_fee_cents,
    v_shipping_method,
    'pkr',
    v_session_id,
    v_payment_intent,
    v_offer_message_id,
    p_payment_method,
    v_order_status,
    v_order_status,
    p_shipping_address,
    p_delivery_notes
  )
  returning * into v_order;

  -- 10. Mark listing sold atomically
  update public.listings
     set is_sold = true
   where id = p_listing_id;

  return v_order;
end;
$$;

revoke execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text) from public, anon;
grant execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text) to authenticated, service_role;

-- Update create_cod_order proxy
drop function if exists public.create_cod_order(uuid, uuid, jsonb, numeric, text);
drop function if exists public.create_cod_order(uuid, uuid, jsonb, numeric, text, text);

create or replace function public.create_cod_order(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_shipping_address jsonb,
  p_offer_amount numeric default null,
  p_delivery_notes text default null,
  p_shipping_method text default 'managed'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.process_checkout(
    p_listing_id,
    p_buyer_id,
    'cod',
    p_shipping_address,
    p_offer_amount,
    p_delivery_notes,
    p_shipping_method
  );
end;
$$;

revoke execute on function public.create_cod_order(uuid, uuid, jsonb, numeric, text, text) from public, anon;
grant execute on function public.create_cod_order(uuid, uuid, jsonb, numeric, text, text) to authenticated, service_role;
