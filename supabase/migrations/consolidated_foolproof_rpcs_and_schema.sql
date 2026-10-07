-- =============================================================================
-- CERANIX / CARRINEX: CONSOLIDATED FOOLPROOF SCHEMA & RPCS (ALL-IN-ONE)
-- =============================================================================
-- Run this entire script in your Supabase SQL Editor to guarantee all required
-- tables, columns, constraints, RLS policies, triggers, and RPC functions exist
-- with full idempotency and transactional integrity.
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
-- 2. ORDERS: State Machine, Fulfillment, CoD, Escrow & Dispute Fields
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
    ));

-- Allow null stripe_session_id for pending or awaiting_payment states
alter table public.orders alter column stripe_session_id drop not null;

-- Ensure all transactional and fulfillment columns exist
alter table public.orders
  add column if not exists payment_method text not null default 'card',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists shipping_method text not null default 'managed'
    check (shipping_method in ('managed', 'self_ship')),
  add column if not exists shipping_fee_cents integer default 0,
  add column if not exists payout_amount_cents integer default 0,
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

-- Ensure public.orders has UPDATE RLS policy for buyers, sellers, and admins
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

-- Ensure subcategory and color columns exist on public.listings
alter table public.listings
  add column if not exists subcategory text,
  add column if not exists color text;

create index if not exists listings_category_subcategory_idx
  on public.listings(category, subcategory)
  where is_sold = false;

create index if not exists listings_color_idx
  on public.listings(color)
  where is_sold = false;

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
set search_path = public
as $$
declare
  v_address public.shipping_addresses;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
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
      raise exception 'address not found or not owned by caller' using errcode = 'P0002';
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
-- 5. SELLER PICKUP ADDRESSES TABLE
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.order_seller_pickups (
  order_id uuid primary key references public.orders(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  pickup_address jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_seller_pickups enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'order_seller_pickups' and policyname = 'order_seller_pickups_party_access') then
    create policy "order_seller_pickups_party_access"
      on public.order_seller_pickups
      for all
      using (
        auth.uid() = seller_id
        or exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid()))
        or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
      );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PAYOUT METHODS TABLE & ATOMIC SET_DEFAULT_PAYOUT RPC
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TRANSACTIONS & AUDIT LOGS: Escrow Accounting Ledger
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  shipping_fee_cents integer not null default 0 check (shipping_fee_cents >= 0),
  payout_amount_cents integer not null default 0 check (payout_amount_cents >= 0),
  currency text not null default 'pkr',
  payment_method text not null check (payment_method in ('card', 'cod')),
  constraint transactions_escrow_balance_check
    check (amount_cents = platform_fee_cents + shipping_fee_cents + payout_amount_cents),
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
  escrow_secured_at timestamptz,
  ready_for_pickup_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  funds_released_at timestamptz,
  disputed_at timestamptz,
  cancelled_at timestamptz,
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

create index if not exists transactions_status_idx on public.transactions(status, created_at desc);
create index if not exists transactions_buyer_idx on public.transactions(buyer_id);
create index if not exists transactions_seller_idx on public.transactions(seller_id);
create index if not exists transactions_order_idx on public.transactions(order_id);

alter table public.transactions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'transactions' and policyname = 'Buyers, sellers, and logistics admins can view transactions') then
    create policy "Buyers, sellers, and logistics admins can view transactions"
      on public.transactions
      for select to authenticated
      using (
        auth.uid() = buyer_id
        or auth.uid() = seller_id
        or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
      );
  end if;
end $$;

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

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'transaction_event_logs' and policyname = 'Buyers, sellers, and logistics admins can view transaction events') then
    create policy "Buyers, sellers, and logistics admins can view transaction events"
      on public.transaction_event_logs
      for select to authenticated
      using (
        exists (
          select 1 from public.transactions t
           where t.id = transaction_event_logs.transaction_id
             and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
        )
        or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
      );
  end if;
end $$;

-- Auto-create transaction trigger for orders
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
  v_platform_fee := least(v_item_price, greatest(0, v_fee));
  v_payout := greatest(0, v_item_price - v_platform_fee);
  v_total_amount := v_payout + v_platform_fee + v_shipping_fee;

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
    order_id, listing_id, buyer_id, seller_id,
    amount_cents, platform_fee_cents, shipping_fee_cents, payout_amount_cents,
    currency, payment_method, status, escrow_secured_at
  ) values (
    new.id, new.listing_id, new.buyer_id, new.seller_id,
    v_total_amount, v_platform_fee, v_shipping_fee, v_payout,
    coalesce(new.currency, 'pkr'), coalesce(new.payment_method, 'cod'),
    v_initial_status,
    case when v_initial_status = 'PAYMENT_SECURED_ESCROW' then now() else null end
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
  execute procedure public.trg_fn_auto_create_order_transaction();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. CHAT OFFERS: accept_chat_offer & counter_chat_offer RPCs
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.accept_chat_offer(
  p_offer_message_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_message record;
  v_conversation record;
  v_listing record;
  v_order public.orders;
  v_counterparty uuid;
  v_amount_cents int;
  v_fee_cents int := 0;
  v_item_price numeric;
  v_session_id text;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform set_config('ceranix.in_accept_offer', 'on', true);

  select * into v_message from public.messages where id = p_offer_message_id for update;
  if not found then
    raise exception 'Offer message not found' using errcode = 'P0002';
  end if;

  if v_message.kind <> 'offer' then
    raise exception 'Message is not an offer' using errcode = '22000';
  end if;

  if v_message.offer_status not in ('proposed', 'pending') then
    raise exception 'Offer is no longer active (current status: %)', v_message.offer_status using errcode = '22000';
  end if;

  select * into v_conversation from public.conversations where id = v_message.conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conversation.listing_id is null then
    raise exception 'Cannot accept offer on direct conversation without listing' using errcode = '22000';
  end if;

  v_counterparty := case
    when v_message.sender_id = v_conversation.buyer_id then v_conversation.seller_id
    else v_conversation.buyer_id
  end;

  if v_caller_id <> v_counterparty then
    raise exception 'Only the offer recipient may accept this offer' using errcode = '42501';
  end if;

  select * into v_listing from public.listings where id = v_conversation.listing_id for update;
  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  if v_listing.is_sold then
    raise exception 'Listing has already been sold or committed to another order' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.orders
     where listing_id = v_listing.id
       and status in ('awaiting_payment', 'pending', 'paid', 'packing', 'shifting', 'delivered')
  ) then
    raise exception 'Listing already has an active order' using errcode = '23505';
  end if;

  if (v_message.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
    v_item_price := (v_message.metadata->>'amount')::numeric;
  else
    v_item_price := null;
  end if;

  if v_item_price is null or v_item_price <= 0 then
    v_item_price := v_listing.price;
  end if;

  v_amount_cents := round(v_item_price * 100)::integer;
  if v_amount_cents <= 0 then
    raise exception 'Invalid offer amount' using errcode = '22000';
  end if;

  update public.messages
     set offer_status = 'accepted', updated_at = now()
   where id = p_offer_message_id;

  update public.messages m
     set offer_status = 'declined', updated_at = now()
    from public.conversations c
   where m.conversation_id = c.id
     and c.listing_id = v_listing.id
     and m.id <> p_offer_message_id
     and m.kind = 'offer'
     and m.offer_status in ('proposed', 'pending');

  update public.listings
     set is_sold = true
   where id = v_listing.id;

  v_session_id := 'offer_' || gen_random_uuid()::text;

  insert into public.orders (
    listing_id, buyer_id, seller_id, amount_cents, fee_cents,
    currency, stripe_session_id, offer_message_id,
    status, fulfillment_status, payment_method
  ) values (
    v_listing.id, v_conversation.buyer_id, v_conversation.seller_id,
    v_amount_cents, v_fee_cents, 'pkr', v_session_id,
    p_offer_message_id, 'awaiting_payment', 'awaiting_payment', 'card'
  )
  returning * into v_order;

  insert into public.messages (
    conversation_id, sender_id, content, kind, metadata
  ) values (
    v_conversation.id, v_caller_id,
    'Offer Accepted! 🤝 Order #' || left(v_order.id::text, 8) || ' created. Inventory reserved awaiting payment.',
    'system',
    jsonb_build_object(
      'order_id', v_order.id,
      'status', 'awaiting_payment',
      'fulfillment_status', 'awaiting_payment',
      'amount_cents', v_amount_cents,
      'accepted_at', now()
    )
  );

  return v_order;
end;
$$;

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
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_sender_id uuid;
  v_parent public.messages%rowtype;
  v_conversation public.conversations%rowtype;
  v_child_msg public.messages;
  v_content text;
  v_amount_val numeric;
begin
  v_sender_id := coalesce(v_caller_id, p_sender_id);
  if v_sender_id is null then
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

  if p_conversation_id is not null and p_conversation_id <> v_parent.conversation_id then
    raise exception 'Conversation mismatch' using errcode = '22000';
  end if;

  if v_sender_id <> v_conversation.buyer_id and v_sender_id <> v_conversation.seller_id then
    raise exception 'Not authorized to make an offer in this conversation' using errcode = '42501';
  end if;

  if v_sender_id = v_parent.sender_id then
    raise exception 'Cannot counter your own offer' using errcode = '22000';
  end if;

  update public.messages
     set offer_status = 'countered', updated_at = now()
   where id = p_parent_offer_id;

  v_content := coalesce(
    nullif(trim(p_content), ''),
    nullif(trim(p_note), ''),
    'Counter-Offer: PKR ' || to_char(v_amount_val, 'FM999,999,999.00')
  );

  insert into public.messages (
    conversation_id, sender_id, content, kind, parent_offer_id,
    metadata, offer_status, created_at, updated_at
  ) values (
    v_parent.conversation_id, v_sender_id, v_content, 'offer', p_parent_offer_id,
    jsonb_build_object(
      'amount', v_amount_val,
      'offer_amount', v_amount_val,
      'parent_offer_id', p_parent_offer_id,
      'note', p_note
    ),
    'pending', now(), now()
  )
  returning * into v_child_msg;

  update public.conversations set updated_at = now() where id = v_parent.conversation_id;
  return v_child_msg;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. CHECKOUT PROCESSING & CASH ON DELIVERY (CoD) RPC
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_caller_id uuid := coalesce(p_buyer_id, auth.uid());
  v_listing record;
  v_item_price_cents integer;
  v_fee_cents integer := 0;
  v_shipping_method text;
  v_shipping_fee_cents integer;
  v_order public.orders;
  v_existing_order public.orders;
  v_is_authorized_offer_buyer boolean := false;
  v_order_status text;
  v_offer_message_id uuid := null;
  v_accepted_offer_amount numeric := null;
  v_session_id text;
begin
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

  select * into v_existing_order
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
             shipping_method = v_shipping_method,
             shipping_fee_cents = v_shipping_fee_cents,
             shipping_address = p_shipping_address,
             delivery_notes = coalesce(p_delivery_notes, delivery_notes),
             stripe_session_id = v_session_id
       where id = v_existing_order.id
      returning * into v_order;

      update public.listings set is_sold = true where id = p_listing_id;

      -- Sync transaction if present
      update public.transactions
         set payment_method = p_payment_method,
             shipping_fee_cents = v_shipping_fee_cents,
             status = case when p_payment_method = 'cod' then 'PAYMENT_SECURED_ESCROW' else status end,
             escrow_secured_at = case when p_payment_method = 'cod' then coalesce(escrow_secured_at, now()) else escrow_secured_at end,
             updated_at = now()
       where order_id = v_existing_order.id;

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
    listing_id, buyer_id, seller_id, amount_cents, fee_cents,
    status, fulfillment_status, payment_method, payment_status,
    shipping_method, shipping_fee_cents,
    shipping_address, delivery_notes, stripe_session_id
  ) values (
    v_listing.id, v_caller_id, v_listing.seller_id,
    v_item_price_cents, v_fee_cents,
    v_order_status, v_order_status, p_payment_method,
    case when p_payment_method = 'cod' then 'pending' else 'unpaid' end,
    v_shipping_method, v_shipping_fee_cents,
    p_shipping_address, p_delivery_notes, v_session_id
  )
  returning * into v_order;

  update public.listings set is_sold = true where id = v_listing.id;
  return v_order;
end;
$$;

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
    p_listing_id, p_buyer_id, 'cod',
    p_shipping_address, p_offer_amount, p_delivery_notes, p_shipping_method
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ADVANCE ORDER FULFILLMENT & LIFECYCLE RPCS
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

create or replace function public.mark_order_shipped(
  p_order_id uuid,
  p_courier text default 'Standard Delivery',
  p_tracking_number text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.advance_order_fulfillment(
    p_order_id, 'shifting', p_courier, p_tracking_number
  );
end;
$$;

create or replace function public.confirm_order_received(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
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
    raise exception 'Only the buyer can confirm receipt of this order' using errcode = '42501';
  end if;

  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  if v_order.status not in ('paid', 'packing', 'shifting', 'delivered', 'pending')
     and v_order.fulfillment_status not in ('pending', 'packing', 'shifting', 'delivered') then
    raise exception 'Order cannot be confirmed from current status: %', v_order.status using errcode = '22000';
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

  insert into public.transaction_event_logs (
    transaction_id, order_id, from_status, to_status,
    actor_id, action, notes, metadata
  )
  select
    t.id, p_order_id, 'IN_TRANSIT', 'COMPLETED_FUNDS_RELEASED',
    v_buyer_id, 'BUYER_CONFIRM_RECEIPT',
    'Buyer confirmed delivery and released escrow funds',
    jsonb_build_object('confirmed_at', v_now)
  from public.transactions t
  where t.order_id = p_order_id;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    ) values (
      v_conv_id, v_buyer_id,
      'Order Completed! 🎉 The buyer has confirmed delivery and released payment to the seller.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'completed',
        'fulfillment_status', 'completed',
        'completed_at', v_now
      )
    );
  end if;

  return v_order;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8b. RPC: complete_cod_order (Atomic Seller CoD Completion)
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

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default 'Buyer requested cancellation'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_caller_role text;
  v_target_status text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.buyer_id <> v_caller_id and v_order.seller_id <> v_caller_id then
    raise exception 'Only the buyer or seller can cancel this order' using errcode = '42501';
  end if;

  if v_order.status in ('completed', 'refunded', 'canceled', 'refund_due') then
    raise exception 'Order is already %', v_order.status using errcode = '22000';
  end if;

  if v_order.shipped_at is not null or v_order.fulfillment_status in ('shifting', 'delivered', 'completed') then
    raise exception 'Cannot cancel an order that has already been shipped or delivered' using errcode = '22000';
  end if;

  v_caller_role := case when v_caller_id = v_order.buyer_id then 'Buyer' else 'Seller' end;
  v_target_status := case when v_order.status = 'paid' then 'refund_due' else 'canceled' end;

  update public.orders
     set status = v_target_status,
         fulfillment_status = 'canceled',
         escrow_status = 'CANCELLED',
         cancel_reason = p_reason,
         cancelled_by = v_caller_id
   where id = p_order_id
  returning * into v_order;

  if v_order.listing_id is not null then
    update public.listings set is_sold = false where id = v_order.listing_id;
  end if;

  update public.transactions
     set status = 'CANCELLED',
         cancelled_at = coalesce(cancelled_at, v_now),
         cancel_reason = coalesce(p_reason, cancel_reason),
         cancelled_by = v_caller_id,
         updated_at = v_now
   where order_id = p_order_id
     and status not in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED');

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
      'Order cancelled by ' || v_caller_role || E'\nReason: ' || coalesce(p_reason, 'No reason specified') ||
      case when v_target_status = 'canceled' then E'\nThe item is now available again.' else '' end,
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', v_order.status,
        'reason', p_reason,
        'cancelled_by_role', v_caller_role
      )
    );
  end if;

  return v_order;
end;
$$;

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
  v_caller_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_tx public.transactions;
  v_order public.orders;
  v_valid_transition boolean := false;
  v_conv_id uuid;
  v_system_msg text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(is_admin, false) into v_is_admin
    from public.profiles where id = v_caller_id;

  select * into v_tx from public.transactions where order_id = p_order_id for update;
  if not found then
    raise exception 'Transaction not found for order %', p_order_id using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

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

  if not v_valid_transition then
    raise exception 'Illegal escrow state transition from % to %', v_tx.status, p_target_status using errcode = '22000';
  end if;

  if p_target_status = 'READY_FOR_PICKUP' then
    if v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Only seller or logistics admin can mark item ready for pickup' using errcode = '42501';
    end if;
  elsif p_target_status in ('IN_TRANSIT', 'DELIVERED') then
    if not v_is_admin and v_caller_id <> v_tx.seller_id then
      raise exception 'Only logistics operations, seller, or admins can advance shipment to %', p_target_status using errcode = '42501';
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
         logistics_agent_id = case when p_target_status in ('IN_TRANSIT', 'DELIVERED') then v_caller_id else logistics_agent_id end,
         updated_at = v_now
   where id = v_tx.id
  returning * into v_tx;

  insert into public.transaction_event_logs (
    transaction_id, order_id, from_status, to_status,
    actor_id, action, notes, metadata
  ) values (
    v_tx.id, p_order_id, v_order.escrow_status, p_target_status,
    v_caller_id, 'STATE_ADVANCE', p_notes,
    jsonb_build_object(
      'courier', p_courier,
      'tracking_number', p_tracking_number,
      'dispute_reason', p_dispute_reason,
      'cancel_reason', p_cancel_reason
    )
  );

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
           when p_target_status = 'PAYMENT_SECURED_ESCROW' and status in ('awaiting_payment', 'pending') then 'paid'
           else status
         end,
         packed_at = case when p_target_status = 'READY_FOR_PICKUP' then coalesce(packed_at, v_now) else packed_at end,
         shifted_at = case when p_target_status = 'IN_TRANSIT' then coalesce(shifted_at, v_now) else shifted_at end,
         shipped_at = case when p_target_status = 'IN_TRANSIT' then coalesce(shipped_at, v_now) else shipped_at end,
         delivered_at = case when p_target_status in ('DELIVERED', 'COMPLETED_FUNDS_RELEASED') then coalesce(delivered_at, v_now) else delivered_at end,
         completed_at = case when p_target_status = 'COMPLETED_FUNDS_RELEASED' then coalesce(completed_at, v_now) else completed_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number)
   where id = p_order_id;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    v_system_msg := case
      when p_target_status = 'PAYMENT_SECURED_ESCROW' then 'Escrow Secured! 🔒 Payment held safely. Order ready for seller fulfillment.'
      when p_target_status = 'READY_FOR_PICKUP' then 'Package Ready! 📦 Seller confirmed item availability. Pickup scheduled.'
      when p_target_status = 'IN_TRANSIT' then 'Package In Transit! 🚚 Shipping courier is en route to buyer.'
      when p_target_status = 'DELIVERED' then 'Package Delivered! 📬 Buyer has 48 hours to inspect item condition.'
      when p_target_status = 'COMPLETED_FUNDS_RELEASED' then 'Escrow Released! 💰 Buyer confirmed receipt. Payout dispatched to seller.'
      when p_target_status = 'DISPUTED' then 'Order Disputed ⚠️ Escrow hold frozen pending operations arbitration.'
      when p_target_status = 'CANCELLED' then 'Order Cancelled 🚫 Escrow payment refunded.'
      else null
    end;

    if v_system_msg is not null then
      insert into public.messages (
        conversation_id, sender_id, content, kind, metadata
      ) values (
        v_conv_id, v_caller_id, v_system_msg, 'system',
        jsonb_build_object(
          'order_id', p_order_id,
          'escrow_status', p_target_status,
          'courier', p_courier,
          'tracking_number', p_tracking_number,
          'updated_at', v_now
        )
      );
    end if;
  end if;

  return v_tx;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. SUPPORT BOT REPLY RPC
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

  select * into v_conv from public.conversations where id = p_conversation_id;
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
    conversation_id, sender_id, content, kind, created_at
  ) values (
    p_conversation_id, v_bot_id, p_content, 'text', now()
  )
  returning * into v_msg;

  update public.conversations set updated_at = now() where id = p_conversation_id;
  return v_msg;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. PERMISSIONS & RPC GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

grant execute on function public.upsert_shipping_address_with_default(jsonb) to authenticated, service_role;
grant execute on function public.set_default_payout(jsonb) to authenticated, service_role;
grant execute on function public.accept_chat_offer(uuid) to authenticated, service_role;
grant execute on function public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text) to authenticated, service_role;
grant execute on function public.create_cod_order(uuid, uuid, jsonb, numeric, text, text) to authenticated, service_role;
grant execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.complete_cod_order(uuid) to authenticated, service_role;
grant execute on function public.mark_order_shipped(uuid, text, text) to authenticated, service_role;
grant execute on function public.confirm_order_received(uuid) to authenticated, service_role;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;
grant execute on function public.advance_escrow_status(uuid, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.dispatch_support_bot_reply(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. REALTIME PUBLICATION SUBSCRIPTIONS
-- Ensure orders, listings, and transactions broadcast state transitions
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
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
    ) then
      execute 'alter publication supabase_realtime add table public.transactions';
    end if;
  end if;
end $$;
