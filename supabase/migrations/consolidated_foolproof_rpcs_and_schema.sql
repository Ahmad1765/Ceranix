-- =============================================================================
-- CERANIX / CARRINEX: CONSOLIDATED FOOLPROOF SCHEMA & RPCS
-- =============================================================================
-- Run this entire script in your Supabase SQL Editor to guarantee all required
-- tables, columns, constraints, and RPC functions exist with full idempotency.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CHAT OFFERS: Lineage, Parent Linkage & Status Enum
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.messages drop constraint if exists messages_offer_status_check;
alter table public.messages
  add constraint messages_offer_status_check
  check (offer_status in ('proposed', 'pending', 'accepted', 'declined', 'countered', 'expired', 'withdrawn'));

alter table public.messages
  add column if not exists parent_offer_id uuid references public.messages(id) on delete set null;

create index if not exists messages_parent_offer_idx
  on public.messages(parent_offer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ORDERS: State Machine, Fulfillment, CoD & Dispute Fields
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in (
    'awaiting_payment',
    'pending',
    'paid',
    'packing',
    'shifting',
    'delivered',
    'completed',
    'disputed',
    'refund_due',
    'refunded',
    'canceled',
    'failed'
  ));

alter table public.orders
  add column if not exists fulfillment_status text not null default 'pending'
    check (fulfillment_status in (
      'awaiting_payment',
      'pending',
      'packing',
      'shifting',
      'delivered',
      'completed',
      'disputed',
      'canceled'
    ));

-- Allow null stripe_session_id for pending or awaiting_payment states
alter table public.orders alter column stripe_session_id drop not null;

-- Ensure all transactional columns exist
alter table public.orders
  add column if not exists payment_method text not null default 'card',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists shipping_address jsonb,
  add column if not exists delivery_notes text,
  add column if not exists fulfillment_type text not null default 'direct'
    check (fulfillment_type in ('direct', 'dropship')),
  add column if not exists supplier_name text,
  add column if not exists supplier_order_id text,
  add column if not exists dispute_reason text,
  add column if not exists dispute_evidence_urls text[] default '{}',
  add column if not exists disputed_at timestamptz,
  add column if not exists dispute_resolved_at timestamptz,
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists packed_at timestamptz,
  add column if not exists shifted_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists carrier_handoff_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists cod_paid_at timestamptz,
  add column if not exists courier_name text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists buyer_inspection_period_hours integer default 48;

create index if not exists orders_fulfillment_status_idx
  on public.orders(fulfillment_status, created_at desc);

create index if not exists orders_buyer_status_idx
  on public.orders(buyer_id, status, created_at desc);

create index if not exists orders_seller_status_idx
  on public.orders(seller_id, status, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WEBHOOK IDEMPOTENCY REGISTRY
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.processed_webhooks (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SHIPPING ADDRESSES & ATOMIC UPSERT RPC
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'PK',
  phone text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shipping_addresses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'shipping_addresses' and policyname = 'Users can manage own shipping addresses'
  ) then
    create policy "Users can manage own shipping addresses"
      on public.shipping_addresses
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.upsert_shipping_address_with_default(p_payload jsonb)
returns public.shipping_addresses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address public.shipping_addresses;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  update public.shipping_addresses
     set is_default = false
   where user_id = v_user_id
     and is_default = true
     and (v_id is null or id <> v_id);

  if v_id is not null then
    update public.shipping_addresses
       set recipient_name = p_payload->>'recipient_name',
           line1          = p_payload->>'line1',
           line2          = p_payload->>'line2',
           city           = p_payload->>'city',
           state          = p_payload->>'state',
           postal_code    = p_payload->>'postal_code',
           country        = p_payload->>'country',
           phone          = p_payload->>'phone',
           is_default     = true
     where id = v_id and user_id = v_user_id
    returning * into v_address;

    if v_address.id is null then
      raise exception 'address not found or not owned by caller';
    end if;
  else
    insert into public.shipping_addresses (
      user_id, recipient_name, line1, line2, city, state, postal_code, country, phone, is_default
    ) values (
      v_user_id,
      p_payload->>'recipient_name',
      p_payload->>'line1',
      p_payload->>'line2',
      p_payload->>'city',
      p_payload->>'state',
      p_payload->>'postal_code',
      p_payload->>'country',
      p_payload->>'phone',
      true
    )
    returning * into v_address;
  end if;

  return v_address;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CHAT-TO-ORDER BRIDGE RPC
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_order_from_accepted_offer(
  p_conversation_id uuid,
  p_offer_message_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_conv public.conversations;
  v_msg public.messages;
  v_listing public.listings;
  v_order public.orders;
  v_amount_numeric numeric;
  v_amount_cents integer;
  v_fee_cents integer := 0; -- Buyer protection fee waived
  v_buyer_id uuid;
  v_seller_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  select * into v_msg from public.messages where id = p_offer_message_id and conversation_id = p_conversation_id;
  if v_msg.id is null then
    raise exception 'Offer message not found' using errcode = 'P0002';
  end if;

  if v_msg.kind <> 'offer' then
    raise exception 'Message is not an offer' using errcode = '22000';
  end if;

  if v_msg.offer_status <> 'accepted' then
    raise exception 'Offer is not in accepted status' using errcode = '22000';
  end if;

  if v_conv.listing_id is null then
    raise exception 'Conversation has no associated listing' using errcode = '22000';
  end if;

  select * into v_listing from public.listings where id = v_conv.listing_id for update;
  if v_listing.id is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  v_buyer_id := v_conv.buyer_id;
  v_seller_id := v_conv.seller_id;

  if v_caller_id <> v_buyer_id and v_caller_id <> v_seller_id then
    raise exception 'Unauthorized caller' using errcode = '42501';
  end if;

  v_amount_numeric := coalesce(
    (v_msg.metadata->>'amount')::numeric,
    (v_msg.metadata->>'offer_amount')::numeric,
    v_listing.price
  );
  v_amount_cents := round(v_amount_numeric * 100);

  -- Check if order already exists for this offer
  select * into v_order from public.orders
   where listing_id = v_listing.id
     and buyer_id = v_buyer_id
     and status in ('awaiting_payment', 'pending', 'paid')
   order by created_at desc
   limit 1;

  if v_order.id is not null then
    return v_order;
  end if;

  -- Lock listing to authorized buyer
  update public.listings
     set is_sold = true
   where id = v_listing.id;

  -- Create order in awaiting_payment state
  insert into public.orders (
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    buyer_protection_fee_cents,
    status,
    fulfillment_status,
    payment_method,
    payment_status,
    stripe_session_id
  ) values (
    v_listing.id,
    v_buyer_id,
    v_seller_id,
    v_amount_cents,
    v_fee_cents,
    'awaiting_payment',
    'awaiting_payment',
    'card',
    'pending',
    'offer_' || v_msg.id::text
  )
  returning * into v_order;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CHECKOUT PROCESSING & CASH ON DELIVERY (CoD) RPC
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.process_checkout(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_payment_method text,
  p_shipping_address jsonb,
  p_offer_amount numeric default null,
  p_delivery_notes text default null
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
  v_fee_cents integer := 0;
  v_order public.orders;
  v_existing_order public.orders;
  v_is_authorized_offer_buyer boolean := false;
  v_order_status text;
  v_offer_message_id uuid := null;
  v_accepted_offer_amount numeric := null;
  v_session_id text;
begin
  v_caller_id := coalesce(p_buyer_id, auth.uid());

  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_shipping_address is null then
    raise exception 'Shipping address is required' using errcode = '22000';
  end if;

  if p_payment_method not in ('cod', 'card') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;

  -- Lock listing to prevent concurrency race
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

  -- Check existing order by caller
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
             stripe_session_id = v_session_id
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
             delivery_notes = coalesce(p_delivery_notes, delivery_notes)
       where id = v_existing_order.id
      returning * into v_order;

      return v_order;
    end if;
  end if;

  -- Verify authorized offer buyer if listing marked sold
  if v_listing.is_sold then
    select exists (
      select 1
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
       where c.listing_id = p_listing_id
         and c.buyer_id = v_caller_id
         and m.kind = 'offer'
         and m.offer_status = 'accepted'
    ) into v_is_authorized_offer_buyer;

    if not v_is_authorized_offer_buyer then
      raise exception 'Listing is already sold' using errcode = '22000';
    end if;
  end if;

  -- Determine authoritative price
  select m.id, (m.metadata->>'amount')::numeric
    into v_offer_message_id, v_accepted_offer_amount
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
   where c.listing_id = p_listing_id
     and c.buyer_id = v_caller_id
     and m.kind = 'offer'
     and m.offer_status = 'accepted'
   order by m.created_at desc
   limit 1;

  if v_accepted_offer_amount is not null and v_accepted_offer_amount > 0 then
    v_item_price_cents := round(v_accepted_offer_amount * 100);
  elsif p_offer_amount is not null and p_offer_amount > 0 then
    v_item_price_cents := round(p_offer_amount * 100);
  else
    v_item_price_cents := round(v_listing.price * 100);
  end if;

  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
  else
    v_order_status := 'awaiting_payment';
    v_session_id := null;
  end if;

  insert into public.orders (
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    buyer_protection_fee_cents,
    status,
    fulfillment_status,
    payment_method,
    payment_status,
    shipping_address,
    delivery_notes,
    stripe_session_id
  ) values (
    v_listing.id,
    v_caller_id,
    v_listing.seller_id,
    v_item_price_cents,
    v_fee_cents,
    v_order_status,
    v_order_status,
    p_payment_method,
    case when p_payment_method = 'cod' then 'pending' else 'unpaid' end,
    p_shipping_address,
    p_delivery_notes,
    v_session_id
  )
  returning * into v_order;

  update public.listings
     set is_sold = true
   where id = v_listing.id;

  return v_order;
end;
$$;

create or replace function public.create_cod_order(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_shipping_address jsonb,
  p_offer_amount numeric default null,
  p_delivery_notes text default null
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
    p_delivery_notes
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ADVANCE FULFILLMENT STATE MACHINE RPC
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.advance_order_fulfillment(
  p_order_id uuid,
  p_next_status text,
  p_courier_name text default null,
  p_tracking_number text default null,
  p_dispute_reason text default null,
  p_dispute_evidence_urls text[] default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
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

  if v_caller_id <> v_order.buyer_id and v_caller_id <> v_order.seller_id then
    raise exception 'Unauthorized to update fulfillment status' using errcode = '42501';
  end if;

  case p_next_status
    when 'packing' then
      if v_caller_id <> v_order.seller_id then
        raise exception 'Only the seller can mark order as packing' using errcode = '42501';
      end if;
      if v_order.fulfillment_status not in ('pending') then
        raise exception 'Cannot transition to packing from %', v_order.fulfillment_status using errcode = '22000';
      end if;

      update public.orders
         set fulfillment_status = 'packing',
             status = 'packing',
             packed_at = coalesce(packed_at, v_now)
       where id = p_order_id
      returning * into v_order;

    when 'shifting' then
      if v_caller_id <> v_order.seller_id then
        raise exception 'Only the seller can mark order as in-transit (shifting)' using errcode = '42501';
      end if;
      if v_order.fulfillment_status not in ('pending', 'packing') then
        raise exception 'Cannot transition to shifting from %', v_order.fulfillment_status using errcode = '22000';
      end if;

      update public.orders
         set fulfillment_status = 'shifting',
             status = 'shifting',
             courier_name = coalesce(p_courier_name, courier_name),
             tracking_number = coalesce(p_tracking_number, tracking_number),
             shifted_at = coalesce(shifted_at, v_now),
             carrier_handoff_at = coalesce(carrier_handoff_at, v_now)
       where id = p_order_id
      returning * into v_order;

    when 'delivered' then
      if v_order.fulfillment_status not in ('shifting', 'packing') then
        raise exception 'Cannot transition to delivered from %', v_order.fulfillment_status using errcode = '22000';
      end if;

      update public.orders
         set fulfillment_status = 'delivered',
             status = 'delivered',
             delivered_at = coalesce(delivered_at, v_now),
             cod_paid_at = case when payment_method = 'cod' then coalesce(cod_paid_at, v_now) else cod_paid_at end,
             payment_status = case when payment_method = 'cod' then 'paid' else payment_status end
       where id = p_order_id
      returning * into v_order;

    when 'completed' then
      if v_order.fulfillment_status not in ('delivered') then
        raise exception 'Cannot complete order from % status', v_order.fulfillment_status using errcode = '22000';
      end if;

      update public.orders
         set fulfillment_status = 'completed',
             status = 'completed',
             completed_at = coalesce(completed_at, v_now)
       where id = p_order_id
      returning * into v_order;

    when 'disputed' then
      if v_caller_id <> v_order.buyer_id then
        raise exception 'Only the buyer can raise a dispute' using errcode = '42501';
      end if;
      if v_order.fulfillment_status not in ('shifting', 'delivered') then
        raise exception 'Cannot dispute order in % status', v_order.fulfillment_status using errcode = '22000';
      end if;

      update public.orders
         set fulfillment_status = 'disputed',
             status = 'disputed',
             dispute_reason = coalesce(p_dispute_reason, dispute_reason),
             dispute_evidence_urls = coalesce(p_dispute_evidence_urls, dispute_evidence_urls),
             disputed_at = coalesce(disputed_at, v_now)
       where id = p_order_id
      returning * into v_order;

    else
      raise exception 'Invalid target fulfillment status: %', p_next_status using errcode = '22000';
  end case;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. SUPPORT BOT REPLY RPC
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.dispatch_support_bot_reply(
  p_conversation_id uuid,
  p_content text
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_conv public.conversations;
  v_msg public.messages;
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_conv
    from public.conversations
   where id = p_conversation_id;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_caller_id and v_conv.seller_id <> v_caller_id then
    raise exception 'Not authorized to request support reply in this conversation' using errcode = '42501';
  end if;

  if v_conv.buyer_id <> v_bot_id and v_conv.seller_id <> v_bot_id then
    raise exception 'Target conversation is not a support conversation' using errcode = '22000';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    kind,
    created_at
  ) values (
    p_conversation_id,
    v_bot_id,
    p_content,
    'text',
    now()
  )
  returning * into v_msg;

  update public.conversations
     set updated_at = now()
   where id = p_conversation_id;

  return v_msg;
end;
$$;

revoke execute on function public.dispatch_support_bot_reply(uuid, text) from public, anon;
grant execute on function public.dispatch_support_bot_reply(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. PERMISSIONS & RPC GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function public.upsert_shipping_address_with_default(jsonb) to authenticated;
grant execute on function public.create_order_from_accepted_offer(uuid, uuid) to authenticated;
grant execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text) to authenticated;
grant execute on function public.create_cod_order(uuid, uuid, jsonb, numeric, text) to authenticated;
grant execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text[]) to authenticated;
grant execute on function public.dispatch_support_bot_reply(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. REALTIME PUBLICATION SUBSCRIPTION
-- Ensure orders and listings broadcast state transitions over Supabase Realtime
-- ─────────────────────────────────────────────────────────────────────────────

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
