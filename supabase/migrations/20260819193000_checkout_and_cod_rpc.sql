-- Migration: Add payment_method, shipping_address, and atomic RPCs for checkout & CoD fulfillment.

-- 1. Extend public.orders schema
alter table public.orders
  add column if not exists payment_method text not null default 'card'
    check (payment_method in ('card', 'cod')),
  add column if not exists shipping_address jsonb,
  add column if not exists delivery_notes text;

-- 2. Update status check constraint to include 'failed' if not already present
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'refunded', 'canceled', 'refund_due', 'failed'));

-- 3. Atomic RPC: process_checkout
-- Locks the listing row, verifies is_sold is false, inserts order into public.orders, updates listing is_sold to true.
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
  v_fee_cents integer := 10000; -- Rs 100 flat Buyer Protection fee in paisa (100 * 100)
  v_order public.orders;
  v_order_status text;
  v_offer_message_id uuid := null;
  v_session_id text;
  v_payment_intent text;
begin
  -- 1. Verify caller
  v_caller_id := auth.uid();
  if v_caller_id is null and p_buyer_id is not null then
    v_caller_id := p_buyer_id;
  end if;

  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_payment_method not in ('cod', 'card') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;

  -- 2. Lock listing row to prevent double-booking race conditions
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

  if v_listing.is_sold then
    raise exception 'Listing is already sold' using errcode = '23505';
  end if;

  -- 3. Check for existing active or paid order on this listing
  if exists (
    select 1 from public.orders
     where listing_id = p_listing_id
       and status in ('paid', 'pending')
  ) then
    raise exception 'Listing already has an active order' using errcode = '23505';
  end if;

  -- 4. Calculate item price (check accepted offer if hint provided)
  if p_offer_amount is not null and p_offer_amount > 0 then
    select m.id
      into v_offer_message_id
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
     where c.listing_id = p_listing_id
       and c.buyer_id = v_caller_id
       and m.kind = 'offer'
       and m.offer_status = 'accepted'
     order by m.updated_at desc
     limit 1;

    v_item_price_cents := round(p_offer_amount * 100)::integer;
  else
    v_item_price_cents := round(v_listing.price * 100)::integer;
  end if;

  if v_item_price_cents <= 0 then
    raise exception 'Invalid order amount' using errcode = '22000';
  end if;

  -- 5. Determine initial order status
  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
    v_payment_intent := null;
  else
    v_order_status := 'paid';
    v_session_id := 'cs_mock_' || gen_random_uuid()::text;
    v_payment_intent := 'pi_mock_' || gen_random_uuid()::text;
  end if;

  -- 6. Insert order row
  insert into public.orders (
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    fee_cents,
    currency,
    stripe_session_id,
    stripe_payment_intent,
    offer_message_id,
    payment_method,
    status,
    shipping_address,
    delivery_notes
  ) values (
    p_listing_id,
    v_caller_id,
    v_listing.seller_id,
    v_item_price_cents,
    v_fee_cents,
    'pkr',
    v_session_id,
    v_payment_intent,
    v_offer_message_id,
    p_payment_method,
    v_order_status,
    p_shipping_address,
    p_delivery_notes
  )
  returning * into v_order;

  -- 7. Mark listing sold atomically
  update public.listings
     set is_sold = true
   where id = p_listing_id;

  return v_order;
end;
$$;

-- Alias create_cod_order to process_checkout for backward compatibility
create or replace function public.create_cod_order(
  p_listing_id uuid,
  p_shipping_address jsonb,
  p_delivery_notes text default null,
  p_offer_amount numeric default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.process_checkout(
    p_listing_id,
    auth.uid(),
    'cod',
    p_shipping_address,
    p_offer_amount,
    p_delivery_notes
  );
end;
$$;

-- 4. Atomic RPC: complete_cod_order
-- Allows seller to mark Cash on Delivery order as collected and fulfilled.
create or replace function public.complete_cod_order(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid;
  v_order public.orders;
begin
  v_seller_id := auth.uid();
  if v_seller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Lock order row
  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.seller_id <> v_seller_id then
    raise exception 'Only the seller can mark a CoD order as completed' using errcode = '42501';
  end if;

  if v_order.payment_method <> 'cod' then
    raise exception 'Order is not Cash on Delivery' using errcode = '22000';
  end if;

  if v_order.status = 'paid' then
    return v_order; -- already completed
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Order cannot be completed from current status: %', v_order.status using errcode = '22000';
  end if;

  update public.orders
     set status = 'paid'
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- Grant execution to authenticated and anon users
grant execute on function public.process_checkout to authenticated;
grant execute on function public.create_cod_order to authenticated;
grant execute on function public.complete_cod_order to authenticated;
