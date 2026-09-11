-- Migration: Order Lifecycle State Machine, Payment Authorization Gate, and Strict Fulfillment RPCs
-- File: supabase/migrations/20260911224500_order_lifecycle_and_fulfillment_state_machine.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CHAT OFFERS: Formalize Proposed, Countered, and Parent Lineage
-- ─────────────────────────────────────────────────────────────────────────────

-- Extend messages.offer_status check constraint to include 'proposed' and 'countered'
alter table public.messages drop constraint if exists messages_offer_status_check;
alter table public.messages
  add constraint messages_offer_status_check
  check (offer_status in ('proposed', 'pending', 'accepted', 'declined', 'countered', 'expired', 'withdrawn'));

-- Parent offer linkage for countering lineage and audit trails
alter table public.messages
  add column if not exists parent_offer_id uuid references public.messages(id) on delete set null;

create index if not exists messages_parent_offer_idx
  on public.messages(parent_offer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ORDERS: Payment-Auth Gate, Fulfillment Status, Dropship & Dispute Fields
-- ─────────────────────────────────────────────────────────────────────────────

-- Extend primary status constraint
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

-- Add dedicated fulfillment_status column
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

-- Make stripe_session_id nullable so orders can be created in awaiting_payment state before Stripe session generation
alter table public.orders alter column stripe_session_id drop not null;

-- Backfill fulfillment_status on pre-existing rows
update public.orders
   set fulfillment_status = case
     when status in ('completed') then 'completed'
     when status in ('canceled', 'refunded', 'refund_due', 'failed') then 'canceled'
     when shipped_at is not null then 'shifting'
     when status = 'paid' then 'pending'
     else 'pending'
   end
 where fulfillment_status = 'pending' and status <> 'pending';

-- Dropshipping, dispute arbitration, and audit timestamp attributes
alter table public.orders
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
  add column if not exists delivered_at timestamptz;

-- High-performance composite indexes for buyer tracking & seller fulfillment queries
create index if not exists orders_fulfillment_status_idx
  on public.orders(fulfillment_status, created_at desc);

create index if not exists orders_dispute_idx
  on public.orders(fulfillment_status)
  where fulfillment_status = 'disputed';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WEBHOOK IDEMPOTENCY: Processed Webhooks Registry
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.processed_webhooks (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.processed_webhooks enable row level security;
-- No client policies: accessible exclusively by service_role and SECURITY DEFINER RPCs

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: confirm_order_payment_authorization (Stripe Webhook / CoD Gateway)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.confirm_order_payment_authorization(
  p_order_id uuid,
  p_stripe_event_id text,
  p_payment_intent text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_conv_id uuid;
begin
  -- 1. Idempotency Check: Reject duplicate Stripe webhook dispatches
  if p_stripe_event_id is not null and length(trim(p_stripe_event_id)) > 0 then
    insert into public.processed_webhooks (event_id, event_type)
    values (p_stripe_event_id, 'payment_intent.succeeded')
    on conflict (event_id) do nothing;

    -- If the row was not inserted, the event has already been processed
    if not found then
      select * into v_order from public.orders where id = p_order_id;
      return v_order;
    end if;
  end if;

  -- 2. Lock Order row
  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- If already authorized / paid, exit idempotently
  if v_order.fulfillment_status not in ('awaiting_payment') then
    return v_order;
  end if;

  -- 3. Advance to Pending fulfillment and Paid status
  update public.orders
     set status = 'paid',
         fulfillment_status = 'pending',
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         payment_authorized_at = now()
   where id = p_order_id
  returning * into v_order;

  -- 4. Post system event into conversation
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id,
      sender_id,
      content,
      kind,
      metadata
    ) values (
      v_conv_id,
      v_order.seller_id,
      'Payment Authorized! 💳 Funds secured in Escrow. Order is now Pending fulfillment.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'pending',
        'fulfillment_status', 'pending',
        'payment_authorized_at', now()
      )
    );
  end if;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: advance_order_fulfillment (Pending -> Packing -> Shifting -> Delivered)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.advance_order_fulfillment(
  p_order_id uuid,
  p_target_status text,
  p_courier text default null,
  p_tracking_number text default null,
  p_supplier_order_id text default null,
  p_supplier_name text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_order public.orders;
  v_conv_id uuid;
  v_system_msg text;
begin
  -- 1. MANDATORY AUTHENTICATION CHECK (PREVENT PRIVILEGE ESCALATION)
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

  -- 3. STRICT ROLE-BASED ACTOR AUTHORIZATION
  if p_target_status in ('packing', 'shifting') then
    if v_caller_id <> v_order.seller_id then
      raise exception 'Only the verified seller may advance fulfillment to %', p_target_status
        using errcode = '42501';
    end if;
  elsif p_target_status in ('delivered', 'completed') then
    if v_caller_id <> v_order.buyer_id then
      raise exception 'Only the verified buyer may confirm delivery or completion'
        using errcode = '42501';
    end if;
  else
    raise exception 'Invalid target fulfillment status: %', p_target_status
      using errcode = '22000';
  end if;

  -- 4. STRICT TRANSITION INTEGRITY (BLOCK INVALID STATE JUMPING)
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

  -- 5. APPLY STATUS UPDATE AND TIMESTAMPS
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
      v_system_msg := 'Order Completed! 🎉 Buyer confirmed receipt and satisfied condition.';
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
        'courier', v_order.courier_name,
        'tracking_number', v_order.tracking_number,
        'updated_at', now()
      )
    );
  end if;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: open_order_dispute (Buyer Protection: Damaged Goods / In-Transit Loss)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.open_order_dispute(
  p_order_id uuid,
  p_reason text,
  p_evidence_urls text[] default '{}'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_order public.orders;
  v_conv_id uuid;
begin
  -- 1. MANDATORY AUTHENTICATION CHECK
  v_buyer_id := auth.uid();
  if v_buyer_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- 2. LOCK & VERIFY ORDER ROW
  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.buyer_id <> v_buyer_id then
    raise exception 'Only the verified buyer may open a dispute for this order'
      using errcode = '42501';
  end if;

  -- Dispute permitted only during transit or within post-delivery window
  if v_order.fulfillment_status not in ('shifting', 'delivered') then
    raise exception 'Disputes can only be opened while in transit or upon delivery (current status: %)', v_order.fulfillment_status
      using errcode = '22000';
  end if;

  -- 3. TRANSITION TO DISPUTED
  update public.orders
     set fulfillment_status = 'disputed',
         status = 'disputed',
         dispute_reason = p_reason,
         dispute_evidence_urls = p_evidence_urls,
         disputed_at = now()
   where id = p_order_id
  returning * into v_order;

  -- 4. DISPATCH DISPUTE NOTICE IN CONVERSATION
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id,
      sender_id,
      content,
      kind,
      metadata
    ) values (
      v_conv_id,
      v_buyer_id,
      '⚠️ Buyer Protection Dispute Opened' || E'\nReason: ' || coalesce(p_reason, 'Damaged / Defective item reported') || E'\nFunds have been placed on temporary hold pending resolution.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'disputed',
        'fulfillment_status', 'disputed',
        'reason', p_reason,
        'disputed_at', now()
      )
    );
  end if;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. PG_CRON AUTO-EXPIRY: Sweep Expired Offers (48h) & Inventory Locks (15m)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.sweep_expired_offers_and_reservations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_count int;
  v_unlocked_orders record;
begin
  -- 1. Sweep active offers older than 48 hours -> mark 'expired'
  update public.messages
     set offer_status = 'expired',
         updated_at = now()
   where kind = 'offer'
     and offer_status in ('proposed', 'pending')
     and created_at < now() - interval '48 hours';

  -- 2. Sweep orders in awaiting_payment older than 15 minutes -> mark 'failed', unlock listing
  for v_unlocked_orders in
    select id, listing_id
      from public.orders
     where fulfillment_status = 'awaiting_payment'
       and created_at < now() - interval '15 minutes'
       for update
  loop
    update public.orders
       set fulfillment_status = 'canceled',
           status = 'failed',
           cancel_reason = 'Payment authorization TTL expired (15m)'
     where id = v_unlocked_orders.id;

    if v_unlocked_orders.listing_id is not null then
      if not exists (
        select 1
          from public.orders
         where listing_id = v_unlocked_orders.listing_id
           and id <> v_unlocked_orders.id
           and status not in ('canceled', 'refunded', 'failed')
           and coalesce(fulfillment_status, '') not in ('canceled', 'failed')
      ) then
        update public.listings
           set is_sold = false
         where id = v_unlocked_orders.listing_id;
      end if;
    end if;
  end loop;
end;
$$;

-- Schedule sweep every 5 minutes if pg_cron extension is available
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Unsched existing job if present to avoid duplication
    perform cron.unschedule('sweep_expired_orders_and_offers')
      where exists (select 1 from cron.job where jobname = 'sweep_expired_orders_and_offers');

    perform cron.schedule(
      'sweep_expired_orders_and_offers',
      '*/5 * * * *',
      'select public.sweep_expired_offers_and_reservations();'
    );
  end if;
exception when others then
  null; -- Ignore if cron schema is inaccessible during migration run
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. EXECUTION PERMISSIONS: Revoke public, grant exclusively to authenticated
-- ─────────────────────────────────────────────────────────────────────────────

revoke execute on function public.confirm_order_payment_authorization(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.open_order_dispute(uuid, text, text[]) from public, anon;
revoke execute on function public.sweep_expired_offers_and_reservations() from public, anon;

grant execute on function public.confirm_order_payment_authorization(uuid, text, text) to service_role;
grant execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.open_order_dispute(uuid, text, text[]) to authenticated, service_role;
grant execute on function public.sweep_expired_offers_and_reservations() to service_role;
