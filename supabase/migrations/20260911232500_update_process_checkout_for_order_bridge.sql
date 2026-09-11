-- Migration: Update process_checkout and create_cod_order RPCs
-- Supports finalizing in-chat offer orders (awaiting_payment) and idempotent COD checkouts
-- Prevents "Listing is already sold" collisions for the authorized buyer.

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
  v_fee_cents integer := 0; -- Waived Buyer Protection fee
  v_order public.orders;
  v_existing_order public.orders;
  v_is_authorized_offer_buyer boolean := false;
  v_order_status text;
  v_offer_message_id uuid := null;
  v_accepted_offer_amount numeric := null;
  v_session_id text;
  v_payment_intent text;
begin
  -- 1. Verify caller exclusively from auth.uid()
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

  -- 3. Check for existing order by THIS buyer on this listing (e.g. from in-chat offer bridge or retry)
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
    -- If order is in awaiting_payment (e.g. created by accept_chat_offer):
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

      -- Ensure listing remains marked sold
      update public.listings
         set is_sold = true
       where id = p_listing_id;

      return v_order;
    end if;

    -- If order is already in pending (e.g. COD re-submitted or retried by same buyer):
    if v_existing_order.status = 'pending' and v_existing_order.payment_method = 'cod' then
      update public.orders
         set shipping_address = coalesce(p_shipping_address, shipping_address),
             delivery_notes = coalesce(p_delivery_notes, delivery_notes)
       where id = v_existing_order.id
      returning * into v_order;

      return v_order;
    end if;
  end if;

  -- 4. If no existing order, check if caller is authorized by an accepted in-chat offer
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

  -- 5. Check for existing active or paid order by ANY user on this listing
  if exists (
    select 1 from public.orders
     where listing_id = p_listing_id
       and status in ('paid', 'pending', 'packing', 'shifting', 'delivered', 'completed')
  ) then
    raise exception 'Listing already has an active order' using errcode = '23505';
  end if;

  -- 6. Calculate item price (check accepted offer if hint provided)
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

  -- 7. Determine initial order status
  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
    v_payment_intent := null;
  else
    v_order_status := 'pending';
    v_session_id := null;
    v_payment_intent := null;
  end if;

  -- 8. Insert order row
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
    fulfillment_status,
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
    v_order_status,
    p_shipping_address,
    p_delivery_notes
  )
  returning * into v_order;

  -- 9. Mark listing sold atomically
  update public.listings
     set is_sold = true
   where id = p_listing_id;

  return v_order;
end;
$$;

revoke execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text) from public, anon;
grant execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text) to authenticated;

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

revoke execute on function public.create_cod_order(uuid, jsonb, text, numeric) from public, anon;
grant execute on function public.create_cod_order(uuid, jsonb, text, numeric) to authenticated;
