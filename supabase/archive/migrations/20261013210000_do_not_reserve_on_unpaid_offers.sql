-- Migration: 20261013210000_do_not_reserve_on_unpaid_offers.sql
-- Description: Prevents listings from being reserved or marked sold when an offer is sent or accepted.
-- Listings remain active, public, and available for any buyer until payment is actually fulfilled.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. UPDATE accept_chat_offer: Do NOT reserve listing or set is_sold = true
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
  -- Bypass trigger locks during atomic transaction
  perform set_config('ceranix.in_accept_offer', 'on', true);

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
  else
    if v_offer.message_id is not null then
      select * into v_message
        from public.messages
       where id = v_offer.message_id;
    end if;
  end if;

  -- 2. Validate offer state
  if v_offer.status not in ('pending', 'proposed') then
    raise exception 'Offer is no longer active (current status: %)', v_offer.status using errcode = '22000';
  end if;

  if v_offer.expires_at < v_now then
    update public.offers set status = 'expired', updated_at = v_now where id = v_offer.id;
    raise exception 'Offer has expired' using errcode = '22000';
  end if;

  -- 3. Lock listing row
  select * into v_listing
    from public.listings
   where id = v_offer.listing_id
     for update;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  -- 4. Authorize caller: must be participant (buyer or seller) or admin, and cannot accept their own offer
  if v_caller_id <> v_offer.buyer_id and v_caller_id <> v_offer.seller_id and not v_is_admin then
    raise exception 'Not authorized to accept an offer in this conversation' using errcode = '42501';
  end if;

  if v_message.id is not null and v_message.sender_id is not null and v_caller_id = v_message.sender_id and not v_is_admin then
    raise exception 'Cannot accept your own offer' using errcode = '22000';
  end if;

  if v_listing.is_sold then
    raise exception 'Listing has already been sold or committed to another order' using errcode = '23505';
  end if;

  if v_offer.amount > v_listing.price and not v_is_admin then
    raise exception 'Offer amount cannot exceed listing price' using errcode = '22000';
  end if;

  v_amount_cents := round(v_offer.amount * 100)::integer;

  -- 5. Mark offer accepted in public.offers and public.messages
  update public.offers
     set status = 'accepted',
         accepted_at = v_now,
         updated_at = v_now
   where id = v_offer.id;

  if v_offer.message_id is not null then
    update public.messages
       set offer_status = 'accepted',
           updated_at = v_now
     where id = v_offer.message_id;
  end if;

  -- NOTE: Listing inventory is INTENTIONALLY NOT RESERVED NOR MARKED SOLD.
  -- The listing remains fully available to all buyers until payment is fulfilled.
  -- Competing offers also remain open so other buyers are not blocked.

  -- 6. Check for existing awaiting_payment order or create one for this buyer
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
-- 2. UPDATE process_checkout: Only block if listing is actually paid/sold
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) cascade;

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
  v_caller_id uuid := coalesce(auth.uid(), p_buyer_id);
  v_listing public.listings;
  v_seller_id uuid;
  v_order public.orders;
  v_existing_order public.orders;
  v_accepted_offer public.offers;
  v_item_price_cents integer;
  v_shipping_fee_cents integer;
  v_fee_cents integer := 0;
  v_total_cents integer;
  v_order_status text;
  v_session_id text;
  v_all_listing_ids uuid[];
  v_ordered_listing_ids uuid[];
  v_bundle_count integer;
  v_is_seller_mismatch boolean;
  v_bundle_subtotal_cents integer;
  v_bundle_discount_pct integer := 0;
  v_bundle_savings_cents integer := 0;
  v_shipping_method text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_payment_method not in ('card', 'cod') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;

  v_shipping_method := coalesce(p_shipping_method, 'managed');
  if v_shipping_method not in ('managed', 'self_ship') then
    raise exception 'Invalid shipping method: %', v_shipping_method using errcode = '22000';
  end if;

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

  -- 4. Check whether single listing is sold
  if v_bundle_count = 1 then
    if v_listing.is_sold then
      raise exception 'Listing is already sold' using errcode = '22000';
    end if;

    -- Check for an accepted offer in public.offers for the calling buyer
    select * into v_accepted_offer
      from public.offers
     where listing_id = p_listing_id
       and buyer_id = v_caller_id
       and status = 'accepted'
       and (expires_at > v_now or accepted_at > (v_now - interval '24 hours'))
     order by accepted_at desc nulls last, created_at desc
     limit 1;

    if v_accepted_offer.id is not null then
      v_item_price_cents := round(v_accepted_offer.amount * 100)::integer;
    elsif p_offer_amount is not null and p_offer_amount > 0 and p_offer_amount < v_listing.price then
      -- Fallback if client passed authorized offer amount
      v_item_price_cents := round(p_offer_amount * 100)::integer;
    else
      v_item_price_cents := round(v_listing.price * 100)::integer;
    end if;

  else
    -- Bundle purchase: verify none of the items are sold
    if exists (select 1 from public.listings where id = any(v_ordered_listing_ids) and is_sold = true) then
      raise exception 'One or more items in the bundle are already sold' using errcode = '22000';
    end if;

    -- Calculate bundle discount server-side in SQL
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

  -- 5. Price-change protection
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
    v_order_status := 'paid';
    v_session_id := 'pay_' || gen_random_uuid()::text;
  end if;

  -- 6. Check existing order for this buyer
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

    -- FULFILLMENT REACHED: Mark listing(s) sold
    update public.listings
       set is_sold = true,
           reserved_until = null
     where id = any(v_ordered_listing_ids);

    -- Cancel all other pending/accepted offers across other conversations on these sold items
    update public.offers
       set status = 'declined',
           updated_at = v_now
     where listing_id = any(v_ordered_listing_ids)
       and id <> coalesce(v_accepted_offer.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and status in ('pending', 'proposed', 'accepted');

    -- Cancel other buyers' awaiting_payment orders for the same listing
    update public.orders
       set status = 'canceled',
           cancel_reason = 'Item sold to another buyer',
           cancelled_by = 'system'
     where listing_id = any(v_ordered_listing_ids)
       and id <> v_existing_order.id
       and status = 'awaiting_payment';

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
    case when p_payment_method = 'cod' then 'pending' else 'paid' end,
    v_shipping_method, v_shipping_fee_cents,
    p_shipping_address, p_delivery_notes, v_session_id,
    case when v_bundle_count > 1 then p_bundle_item_ids else null end,
    v_bundle_count
  ) returning * into v_order;

  -- FULFILLMENT REACHED: Mark listing(s) sold
  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = any(v_ordered_listing_ids);

  -- Cancel all other pending/accepted offers on these sold items
  update public.offers
     set status = 'declined',
         updated_at = v_now
   where listing_id = any(v_ordered_listing_ids)
     and id <> coalesce(v_accepted_offer.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and status in ('pending', 'proposed', 'accepted');

  -- Cancel other buyers' awaiting_payment orders for the same listing
  update public.orders
     set status = 'canceled',
         cancel_reason = 'Item sold to another buyer',
         cancelled_by = 'system'
   where listing_id = any(v_ordered_listing_ids)
     and id <> v_order.id
     and status = 'awaiting_payment';

  return v_order;
end;
$$;

revoke execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) from public, anon;
grant execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UNLOCK ANY PREVIOUSLY LOCKED LISTINGS TIED TO UNPAID OFFERS
-- ─────────────────────────────────────────────────────────────────────────────
update public.listings
   set is_sold = false,
       reserved_until = null
 where is_sold = true
   and id in (
     select listing_id from public.orders where status = 'awaiting_payment'
   )
   and id not in (
     select listing_id from public.orders where status in ('paid', 'pending', 'packing', 'picked', 'shifting', 'delivered', 'completed')
   );
