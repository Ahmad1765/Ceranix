-- =============================================================================
-- Migration: 20260924010000_escrow_state_machine_and_transactions.sql
-- Description: Phase 1: Escrow State Machine, Transactions Ledger, Financial Balance
--              Guardrail, Immutable Audit Trail, Strict Transition RPC, and Realtime Publications.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ORDERS TABLE: Add Escrow Status and Net Payout Tracking
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists escrow_status text default 'PENDING_PAYMENT'
    check (escrow_status in (
      'PENDING_PAYMENT',
      'PAYMENT_SECURED_ESCROW',
      'READY_FOR_PICKUP',
      'IN_TRANSIT',
      'DELIVERED',
      'COMPLETED_FUNDS_RELEASED',
      'DISPUTED',
      'CANCELLED'
    )),
  add column if not exists payout_amount_cents integer default 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRANSACTIONS TABLE: Formal Escrow Ledger with Accounting Balance Invariant
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,

  -- Financial Ledger (Minor Units in PKR Paisa)
  amount_cents integer not null check (amount_cents > 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  shipping_fee_cents integer not null default 0 check (shipping_fee_cents >= 0),
  payout_amount_cents integer not null default 0 check (payout_amount_cents >= 0),
  currency text not null default 'pkr',
  payment_method text not null check (payment_method in ('card', 'cod')),

  -- Guardrail: Accounting Invariant (Guarantees escrow math balances perfectly; prevents leaks/negative balances)
  constraint transactions_escrow_balance_check
    check (amount_cents = platform_fee_cents + shipping_fee_cents + payout_amount_cents),

  -- Strict Escrow State Machine Status
  status text not null default 'PENDING_PAYMENT' check (status in (
    'PENDING_PAYMENT',
    'PAYMENT_SECURED_ESCROW',
    'READY_FOR_PICKUP',
    'IN_TRANSIT',
    'DELIVERED',
    'COMPLETED_FUNDS_RELEASED',
    'DISPUTED',
    'CANCELLED'
  )),

  -- Lifecycle Timestamps
  escrow_secured_at timestamptz,
  ready_for_pickup_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  funds_released_at timestamptz,
  disputed_at timestamptz,
  cancelled_at timestamptz,

  -- Operational / Dispute Attributes
  dispute_reason text,
  dispute_evidence_urls text[] default '{}',
  cancel_reason text,
  cancelled_by uuid references public.profiles(id),
  courier_name text,
  tracking_number text,
  logistics_notes text,
  logistics_agent_id uuid references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Performance Indexes
create index if not exists transactions_status_idx on public.transactions(status, created_at desc);
create index if not exists transactions_buyer_idx on public.transactions(buyer_id);
create index if not exists transactions_seller_idx on public.transactions(seller_id);
create index if not exists transactions_order_idx on public.transactions(order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS): Read Policy & Mutation Gate for Transactions
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.transactions enable row level security;

drop policy if exists "Buyers, sellers, and logistics admins can view transactions" on public.transactions;
create policy "Buyers, sellers, and logistics admins can view transactions"
  on public.transactions
  for select to authenticated
  using (
    (select auth.uid()) = buyer_id
    or (select auth.uid()) = seller_id
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

-- Direct client INSERT / UPDATE / DELETE are intentionally disallowed.
-- Mutations are performed strictly via trusted Security Definer RPCs or service role.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRANSACTION EVENT LOGS: Immutable Audit Trail with RLS
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.transaction_event_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles(id),
  action text not null,
  notes text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists transaction_events_tx_idx on public.transaction_event_logs(transaction_id, created_at desc);
create index if not exists transaction_events_order_idx on public.transaction_event_logs(order_id, created_at desc);

alter table public.transaction_event_logs enable row level security;

drop policy if exists "Buyers, sellers, and logistics admins can view transaction events" on public.transaction_event_logs;
create policy "Buyers, sellers, and logistics admins can view transaction events"
  on public.transaction_event_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.transactions t
       where t.id = transaction_event_logs.transaction_id
         and (
           t.buyer_id = (select auth.uid())
           or t.seller_id = (select auth.uid())
         )
    )
    or exists (select 1 from public.profiles where id = (select auth.uid()) and is_admin = true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. REALTIME BROADCAST: Register Transactions in supabase_realtime
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'transactions'
    ) then
      alter publication supabase_realtime add table public.transactions;
    end if;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: advance_escrow_status (Atomic Transitions, Role Check, Audit Log & Chat Notice)
-- ─────────────────────────────────────────────────────────────────────────────

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
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_is_admin boolean := false;
  v_tx public.transactions;
  v_order public.orders;
  v_valid_transition boolean := false;
  v_conv_id uuid;
  v_system_msg text;
begin
  -- 1. Authentication check
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(is_admin, false) into v_is_admin
    from public.profiles where id = v_caller_id;

  -- 2. Lock Transaction & Order Rows atomically (prevent concurrency race conditions)
  select * into v_tx
    from public.transactions
   where order_id = p_order_id
     for update;

  if not found then
    raise exception 'Transaction not found for order %', p_order_id using errcode = 'P0002';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  -- 3. Strict State Machine Transition Guardrails (prevent jumping states)
  if v_tx.status = 'PENDING_PAYMENT' and p_target_status in ('PAYMENT_SECURED_ESCROW', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'PAYMENT_SECURED_ESCROW' and p_target_status in ('READY_FOR_PICKUP', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'READY_FOR_PICKUP' and p_target_status in ('IN_TRANSIT', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'IN_TRANSIT' and p_target_status in ('DELIVERED', 'DISPUTED') then
    v_valid_transition := true;
  elsif v_tx.status = 'DELIVERED' and p_target_status in ('COMPLETED_FUNDS_RELEASED', 'DISPUTED') then
    v_valid_transition := true;
  elsif v_tx.status = 'DISPUTED' and p_target_status in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED') then
    v_valid_transition := true;
  end if;

  if not v_valid_transition then
    raise exception 'Illegal escrow state transition from % to %', v_tx.status, p_target_status using errcode = '22000';
  end if;

  -- 4. Actor Permission Enforcement
  if p_target_status = 'READY_FOR_PICKUP' then
    if v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Only seller or logistics admin can mark item ready for pickup' using errcode = '42501';
    end if;
  elsif p_target_status in ('IN_TRANSIT', 'DELIVERED') then
    if not v_is_admin then
      raise exception 'Only internal logistics operations or admins can advance shipment to %', p_target_status using errcode = '42501';
    end if;
  elsif p_target_status = 'COMPLETED_FUNDS_RELEASED' then
    if v_caller_id <> v_tx.buyer_id and not v_is_admin then
      raise exception 'Only buyer or platform admin can release escrow funds' using errcode = '42501';
    end if;
  elsif p_target_status = 'DISPUTED' then
    if v_caller_id <> v_tx.buyer_id and v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Only transaction participants or admin can open a dispute' using errcode = '42501';
    end if;
  elsif p_target_status = 'CANCELLED' then
    if v_tx.status = 'DISPUTED' and not v_is_admin then
      raise exception 'Only platform admin can cancel and refund a disputed order' using errcode = '42501';
    elsif v_caller_id <> v_tx.buyer_id and v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Unauthorized to cancel this transaction' using errcode = '42501';
    end if;
  end if;

  -- 5. Update Transaction Record & Timestamps
  update public.transactions
     set status = p_target_status,
         escrow_secured_at = case when p_target_status = 'PAYMENT_SECURED_ESCROW' then coalesce(escrow_secured_at, now()) else escrow_secured_at end,
         ready_for_pickup_at = case when p_target_status = 'READY_FOR_PICKUP' then coalesce(ready_for_pickup_at, now()) else ready_for_pickup_at end,
         picked_up_at = case when p_target_status = 'IN_TRANSIT' then coalesce(picked_up_at, now()) else picked_up_at end,
         delivered_at = case when p_target_status = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
         funds_released_at = case when p_target_status = 'COMPLETED_FUNDS_RELEASED' then coalesce(funds_released_at, now()) else funds_released_at end,
         disputed_at = case when p_target_status = 'DISPUTED' then coalesce(disputed_at, now()) else disputed_at end,
         cancelled_at = case when p_target_status = 'CANCELLED' then coalesce(cancelled_at, now()) else cancelled_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         dispute_reason = coalesce(p_dispute_reason, dispute_reason),
         cancel_reason = coalesce(p_cancel_reason, cancel_reason),
         logistics_notes = coalesce(p_notes, logistics_notes),
         logistics_agent_id = case when p_target_status in ('IN_TRANSIT', 'DELIVERED') then v_caller_id else logistics_agent_id end,
         updated_at = now()
   where id = v_tx.id
  returning * into v_tx;

  -- 6. Insert Immutable Audit Log
  insert into public.transaction_event_logs (
    transaction_id,
    order_id,
    from_status,
    to_status,
    actor_id,
    action,
    notes,
    metadata
  ) values (
    v_tx.id,
    p_order_id,
    v_order.escrow_status,
    p_target_status,
    v_caller_id,
    'STATE_ADVANCE',
    p_notes,
    jsonb_build_object(
      'courier', p_courier,
      'tracking_number', p_tracking_number,
      'dispute_reason', p_dispute_reason,
      'cancel_reason', p_cancel_reason
    )
  );

  -- 7. Sync with public.orders for backward compatibility with buyer/seller screens
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
           when p_target_status = 'CANCELLED' then 'canceled'
           when p_target_status = 'DISPUTED' then 'disputed'
           when p_target_status = 'PAYMENT_SECURED_ESCROW' and status = 'pending' then 'paid'
           else status
         end,
         packed_at = case when p_target_status = 'READY_FOR_PICKUP' then coalesce(packed_at, now()) else packed_at end,
         shifted_at = case when p_target_status = 'IN_TRANSIT' then coalesce(shifted_at, now()) else shifted_at end,
         shipped_at = case when p_target_status = 'IN_TRANSIT' then coalesce(shipped_at, now()) else shipped_at end,
         delivered_at = case when p_target_status = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
         completed_at = case when p_target_status = 'COMPLETED_FUNDS_RELEASED' then coalesce(completed_at, now()) else completed_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number)
   where id = p_order_id;

  -- 8. Post real-time audit notice into buyer/seller chat conversation thread
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    v_system_msg := case
      when p_target_status = 'PAYMENT_SECURED_ESCROW' then 'Escrow Secured! 🔒 Payment held safely. Order ready for seller fulfillment.'
      when p_target_status = 'READY_FOR_PICKUP' then 'Package Ready! 📦 Seller confirmed item availability. Internal logistics assigned for pickup.'
      when p_target_status = 'IN_TRANSIT' then 'Package Picked Up & In Transit! 🚚 In-house shipping courier is en route to buyer.'
      when p_target_status = 'DELIVERED' then 'Package Delivered! 📬 Buyer has 48 hours to inspect item condition.'
      when p_target_status = 'COMPLETED_FUNDS_RELEASED' then 'Escrow Released! 💰 Buyer confirmed receipt. Payout dispatched to seller.'
      when p_target_status = 'DISPUTED' then 'Order Disputed ⚠️ Escrow hold frozen pending operations arbitration.'
      when p_target_status = 'CANCELLED' then 'Order Cancelled 🚫 Escrow payment refunded.'
      else null
    end;

    if v_system_msg is not null then
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
          'escrow_status', p_target_status,
          'courier', p_courier,
          'tracking_number', p_tracking_number,
          'updated_at', now()
        )
      );
    end if;
  end if;

  return v_tx;
end;
$$;

revoke execute on function public.advance_escrow_status(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.advance_escrow_status(uuid, text, text, text, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TRIGGER: Auto-Create Escrow Transaction on New Orders
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.trg_fn_auto_create_order_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
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
  -- Platform fee cannot exceed item price; seller payout is item price minus platform fee
  v_platform_fee := least(v_item_price, greatest(0, v_fee));
  v_payout := greatest(0, v_item_price - v_platform_fee);
  -- Total escrow funds captured from buyer: item price + shipping fee
  v_total_amount := v_payout + v_platform_fee + v_shipping_fee;

  -- Ensure strictly positive total amount
  if v_total_amount <= 0 then
    v_total_amount := greatest(1, v_item_price);
    v_payout := v_total_amount;
    v_platform_fee := 0;
    v_shipping_fee := 0;
  end if;

  v_initial_status := case
    when new.status in ('paid') or new.payment_method = 'cod' then 'PAYMENT_SECURED_ESCROW'
    when new.status in ('awaiting_payment', 'pending') and new.payment_method <> 'cod' then 'PENDING_PAYMENT'
    else 'PAYMENT_SECURED_ESCROW'
  end;

  insert into public.transactions (
    order_id,
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    platform_fee_cents,
    shipping_fee_cents,
    payout_amount_cents,
    currency,
    payment_method,
    status,
    escrow_secured_at
  ) values (
    new.id,
    new.listing_id,
    new.buyer_id,
    new.seller_id,
    v_total_amount,
    v_platform_fee,
    v_shipping_fee,
    v_payout,
    coalesce(new.currency, 'pkr'),
    coalesce(new.payment_method, 'cod'),
    v_initial_status,
    case when v_initial_status = 'PAYMENT_SECURED_ESCROW' then now() else null end
  )
  on conflict (order_id) do nothing;

  -- Keep payout_amount_cents on orders table synced
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
  execute procedure public.trg_fn_auto_create_order_transaction();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. BACKFILL: Migrate Pre-Existing Orders into Transactions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
  v_item_price integer;
  v_fee integer;
  v_shipping_fee integer;
  v_platform_fee integer;
  v_payout integer;
  v_total_amount integer;
  v_status text;
begin
  for r in (
    select o.*
      from public.orders o
      left join public.transactions t on t.order_id = o.id
     where t.id is null
  ) loop
    v_item_price := coalesce(r.amount_cents, 0);
    v_fee := coalesce(r.fee_cents, 0);
    v_shipping_fee := coalesce(r.shipping_fee_cents, 0);

    -- Platform fee cannot exceed item price; seller payout is item price minus platform fee
    v_platform_fee := least(v_item_price, greatest(0, v_fee));
    v_payout := greatest(0, v_item_price - v_platform_fee);

    -- Total escrow funds captured from buyer: item price + shipping fee
    v_total_amount := v_payout + v_platform_fee + v_shipping_fee;

    -- Ensure strictly positive total amount
    if v_total_amount <= 0 then
      v_total_amount := greatest(1, v_item_price);
      v_payout := v_total_amount;
      v_platform_fee := 0;
      v_shipping_fee := 0;
    end if;

    v_status := case
      when r.status = 'completed' or r.fulfillment_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
      when r.status in ('canceled', 'refunded', 'failed') or r.fulfillment_status = 'canceled' then 'CANCELLED'
      when r.status = 'disputed' or r.fulfillment_status = 'disputed' then 'DISPUTED'
      when r.fulfillment_status = 'delivered' then 'DELIVERED'
      when r.fulfillment_status = 'shifting' or r.shipped_at is not null then 'IN_TRANSIT'
      when r.fulfillment_status = 'packing' then 'READY_FOR_PICKUP'
      when r.status in ('paid') or r.payment_method = 'cod' then 'PAYMENT_SECURED_ESCROW'
      else 'PENDING_PAYMENT'
    end;

    insert into public.transactions (
      order_id,
      listing_id,
      buyer_id,
      seller_id,
      amount_cents,
      platform_fee_cents,
      shipping_fee_cents,
      payout_amount_cents,
      currency,
      payment_method,
      status,
      escrow_secured_at,
      ready_for_pickup_at,
      picked_up_at,
      delivered_at,
      funds_released_at,
      courier_name,
      tracking_number,
      created_at
    ) values (
      r.id,
      r.listing_id,
      r.buyer_id,
      r.seller_id,
      v_total_amount,
      v_platform_fee,
      v_shipping_fee,
      v_payout,
      coalesce(r.currency, 'pkr'),
      coalesce(r.payment_method, 'cod'),
      v_status,
      case when v_status not in ('PENDING_PAYMENT', 'CANCELLED') then r.created_at else null end,
      r.packed_at,
      coalesce(r.shifted_at, r.shipped_at),
      r.delivered_at,
      r.completed_at,
      r.courier_name,
      r.tracking_number,
      r.created_at
    )
    on conflict (order_id) do nothing;

    -- Update order with escrow status and payout
    update public.orders
       set escrow_status = v_status,
           payout_amount_cents = v_payout
     where id = r.id;
  end loop;
end $$;
