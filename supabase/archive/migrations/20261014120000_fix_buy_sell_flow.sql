-- =============================================================================
-- Migration: Fix buy/sell flow correctness and money-movement holes
-- Date: 2026-10-14
--
-- 1. process_checkout
--    - Always failed: `cancelled_by = 'system'` into a uuid column raises
--      "invalid input syntax for type uuid" at parse time, on every call.
--    - Trusted a client-supplied p_offer_amount: any buyer could pick their own
--      price. Only an accepted offer in public.offers may lower the price now.
--    - Created status='paid' card orders with no payment. Card orders are
--      created by the Stripe webhook (service role); clients may only use COD.
--    - Recorded fee_cents = 0 and a flat Rs 250 delivery while the checkout
--      screen charges 6% Buyer Protection + Rs 130/180 by parcel size (lib/fees.ts).
--    - Bundles used fixed 5/10/15/20% tiers; the checkout screen uses the
--      seller's bundle_discount_pct (lib/bundle.ts computeBundlePricing).
--    - Accepted bundle offers were ignored at checkout.
-- 2. trg_fn_auto_create_order_transaction: deducted the buyer's protection fee
--    from the seller payout. Buyer Protection is paid by the buyer on top.
-- 3. accept_chat_offer / offer sync trigger: bundle offers were capped at the
--    single base item's price, so a bundle offer could never be accepted.
-- 4. counter_chat_offer: countering a bundle offer dropped its bundle items.
-- 5. complete_cod_order: trusted p_role from non-admin callers (a buyer could
--    confirm as seller and complete alone) and allowed completion before the
--    package shipped.
-- 6. confirm_order_received: completed orders in any state, including unpaid
--    card orders and COD orders (bypassing the dual COD confirmation).
-- 7. cancel_order: allowed cancelling after courier pickup / during a dispute,
--    and only relisted the primary item of a bundle.
-- 8. Listing anti-tamper policies missed the 'picked' and 'disputed' states.
-- 9. A legacy advance_order_fulfillment(…, p_next_status, …) overload let a
--    seller walk their own order to 'completed' alone; it is dropped.
-- 10. Money RPCs were executable by anon; restricted to signed-in users.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. process_checkout
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) cascade;

create or replace function public.process_checkout(
  p_listing_id uuid,
  p_buyer_id uuid default null,
  p_payment_method text default 'cod',
  p_shipping_address jsonb default null,
  p_offer_amount numeric default null, -- ignored: kept for signature compatibility
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
  v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');
  v_caller_id uuid := case
    when (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role')
      then coalesce(p_buyer_id, auth.uid())
    else auth.uid()
  end;
  v_listing public.listings;
  v_seller_id uuid;
  v_order public.orders;
  v_existing_order public.orders;
  v_accepted_offer public.offers;
  v_item_price_cents integer;
  v_shipping_fee_cents integer;
  v_fee_cents integer;
  v_total_cents integer;
  v_order_status text;
  v_session_id text;
  v_ordered_listing_ids uuid[];
  v_addon_ids uuid[];
  v_addon_ids_text text[];
  v_bundle_count integer;
  v_is_seller_mismatch boolean;
  v_bundle_subtotal_cents integer;
  v_bundle_discount_pct integer := 0;
  v_shipping_method text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_payment_method not in ('card', 'cod') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;

  if p_shipping_address is null then
    raise exception 'Shipping address is required' using errcode = '22000';
  end if;

  -- A card order is only real once Stripe has taken the money; the webhook
  -- creates those rows itself. A client-created card order would be "paid"
  -- with nothing collected.
  if p_payment_method = 'card' and not v_is_service_role then
    raise exception 'Card payments must be completed through secure checkout' using errcode = '42501';
  end if;

  v_shipping_method := coalesce(p_shipping_method, 'managed');
  if v_shipping_method not in ('managed', 'self_ship') then
    raise exception 'Invalid shipping method: %', v_shipping_method using errcode = '22000';
  end if;

  -- 1. Add-on items (everything except the primary listing), deduplicated
  v_addon_ids := array(
    select distinct x from unnest(coalesce(p_bundle_item_ids, '{}'::uuid[])) as x
     where x is not null and x <> p_listing_id
  );
  v_addon_ids_text := array(select x::text from unnest(v_addon_ids) as x order by 1);

  -- 2. Sorted IDs so concurrent checkouts lock rows in the same order
  v_ordered_listing_ids := array(
    select x from unnest(array_append(v_addon_ids, p_listing_id)) as x order by x
  );
  v_bundle_count := cardinality(v_ordered_listing_ids);

  perform 1 from public.listings where id = any(v_ordered_listing_ids) order by id for update;

  if (select count(*) from public.listings where id = any(v_ordered_listing_ids)) <> v_bundle_count then
    raise exception 'One or more items in the order were not found' using errcode = 'P0002';
  end if;

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

  if exists (select 1 from public.listings where id = any(v_ordered_listing_ids) and is_sold) then
    raise exception '%', case when v_bundle_count = 1 then 'Listing is already sold'
                              else 'One or more items in the bundle are already sold' end
      using errcode = '22000';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;

  -- 3. Accepted offer from this buyer covering exactly this set of items
  select o.* into v_accepted_offer
    from public.offers o
    left join public.messages m on m.id = o.message_id
   where o.listing_id = p_listing_id
     and o.buyer_id = v_caller_id
     and o.status = 'accepted'
     and (o.expires_at > v_now or o.accepted_at > (v_now - interval '24 hours'))
     and array(
           select distinct x
             from jsonb_array_elements_text(
                    case when jsonb_typeof(m.metadata->'bundle_item_ids') = 'array'
                         then m.metadata->'bundle_item_ids' else '[]'::jsonb end) as x
            where x <> p_listing_id::text
            order by x
         ) = v_addon_ids_text
   order by o.accepted_at desc nulls last, o.created_at desc
   limit 1;

  -- 4. Item price: accepted offer, else list price (minus the seller's bundle discount)
  select sum(round(price * 100))::integer
    into v_bundle_subtotal_cents
    from public.listings
   where id = any(v_ordered_listing_ids);

  if v_accepted_offer.id is not null then
    v_item_price_cents := round(v_accepted_offer.amount * 100)::integer;
  elsif v_bundle_count > 1 then
    -- Mirrors lib/bundle.ts computeBundlePricing: the seller's own discount, capped at 30%.
    select least(30, greatest(0, coalesce(bundle_discount_pct, 0)))
      into v_bundle_discount_pct
      from public.profiles
     where id = v_seller_id;
    v_item_price_cents := v_bundle_subtotal_cents
      - round(v_bundle_subtotal_cents * coalesce(v_bundle_discount_pct, 0) / 100.0)::integer;
  else
    v_item_price_cents := v_bundle_subtotal_cents;
  end if;

  -- 5. Fees — must match lib/fees.ts (6% Buyer Protection; Rs 130 / Rs 180 large parcel)
  v_fee_cents := round(v_item_price_cents * 6 / 100.0)::integer;
  v_shipping_fee_cents := case
    when v_shipping_method = 'self_ship' then 0
    when v_listing.parcel_size = 'large' then 18000
    else 13000
  end;
  v_total_cents := v_item_price_cents + v_fee_cents + v_shipping_fee_cents;

  -- 6. Never charge a total the buyer wasn't shown
  if p_expected_total is not null and abs(round(p_expected_total * 100) - v_total_cents) > 5 then
    raise exception 'Price has changed: expected total % PKR but calculated % PKR. Please review before proceeding.',
      p_expected_total, (v_total_cents / 100.0)
      using errcode = '22000';
  end if;

  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
  else
    v_order_status := 'paid';
    v_session_id := 'pay_' || gen_random_uuid()::text;
  end if;

  -- 7. Reuse this buyer's open order for the listing, else create one
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
           fee_cents = v_fee_cents,
           payment_method = p_payment_method,
           payment_status = case when p_payment_method = 'cod' then 'pending' else 'paid' end,
           status = v_order_status,
           fulfillment_status = 'pending',
           shipping_method = v_shipping_method,
           shipping_fee_cents = v_shipping_fee_cents,
           shipping_address = p_shipping_address,
           delivery_notes = coalesce(p_delivery_notes, delivery_notes),
           stripe_session_id = v_session_id,
           bundle_item_ids = case when v_bundle_count > 1 then v_addon_ids else null end,
           bundle_count = v_bundle_count
     where id = v_existing_order.id
    returning * into v_order;
  else
    insert into public.orders (
      listing_id, buyer_id, seller_id, amount_cents, fee_cents,
      status, fulfillment_status, payment_method, payment_status,
      shipping_method, shipping_fee_cents,
      shipping_address, delivery_notes, stripe_session_id,
      bundle_item_ids, bundle_count
    ) values (
      p_listing_id, v_caller_id, v_seller_id,
      v_item_price_cents, v_fee_cents,
      v_order_status, 'pending', p_payment_method,
      case when p_payment_method = 'cod' then 'pending' else 'paid' end,
      v_shipping_method, v_shipping_fee_cents,
      p_shipping_address, p_delivery_notes, v_session_id,
      case when v_bundle_count > 1 then v_addon_ids else null end,
      v_bundle_count
    ) returning * into v_order;
  end if;

  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = any(v_ordered_listing_ids);

  -- Close every other open offer on the sold items
  update public.offers
     set status = 'declined',
         updated_at = v_now
   where listing_id = any(v_ordered_listing_ids)
     and id is distinct from v_accepted_offer.id
     and status in ('pending', 'accepted');

  -- Other buyers' unpaid orders for these items can no longer be fulfilled.
  -- cancelled_by is a uuid; a system cancellation leaves it null.
  update public.orders
     set status = 'canceled',
         fulfillment_status = 'canceled',
         cancel_reason = 'Item sold to another buyer',
         cancelled_by = null
   where listing_id = any(v_ordered_listing_ids)
     and id <> v_order.id
     and status = 'awaiting_payment';

  return v_order;
end;
$$;

revoke execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) from public, anon;
grant execute on function public.process_checkout(uuid, uuid, text, jsonb, numeric, text, text, uuid[], numeric) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ledger row: Buyer Protection is charged on top, never taken from the seller
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_fn_auto_create_order_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_price integer := greatest(0, coalesce(new.amount_cents, 0));
  v_fee integer := greatest(0, coalesce(new.fee_cents, 0));
  v_shipping_fee integer := greatest(0, coalesce(new.shipping_fee_cents, 0));
  v_total_amount integer;
  v_initial_status text;
begin
  v_total_amount := greatest(1, v_item_price + v_fee + v_shipping_fee);

  v_initial_status := case
    when new.status = 'paid' or new.payment_method = 'cod' then 'PAYMENT_SECURED_ESCROW'
    else 'PENDING_PAYMENT'
  end;

  insert into public.transactions (
    order_id, listing_id, buyer_id, seller_id,
    amount_cents, platform_fee_cents, shipping_fee_cents, payout_amount_cents,
    currency, payment_method, status, escrow_secured_at
  ) values (
    new.id, new.listing_id, new.buyer_id, new.seller_id,
    v_total_amount, v_fee, v_shipping_fee, v_item_price,
    coalesce(new.currency, 'pkr'), coalesce(new.payment_method, 'cod'),
    v_initial_status,
    case when v_initial_status = 'PAYMENT_SECURED_ESCROW' then clock_timestamp() else null end
  )
  on conflict (order_id) do nothing;

  update public.orders
     set payout_amount_cents = v_item_price,
         escrow_status = v_initial_status
   where id = new.id;

  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Offer price ceiling: base item, or base + add-ons for a bundle offer
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.offer_price_ceiling(p_listing_id uuid, p_metadata jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select sum(l.price)
    from public.listings l
   where l.id = p_listing_id
      or l.id::text in (
           select x from jsonb_array_elements_text(
             case when jsonb_typeof(p_metadata->'bundle_item_ids') = 'array'
                  then p_metadata->'bundle_item_ids' else '[]'::jsonb end) as x
         );
$$;

revoke execute on function public.offer_price_ceiling(uuid, jsonb) from public, anon;
grant execute on function public.offer_price_ceiling(uuid, jsonb) to authenticated, service_role;

create or replace function public.trg_fn_sync_offer_on_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv record;
  v_amount numeric;
  v_ceiling numeric;
begin
  if new.kind = 'offer' and coalesce(new.offer_status, 'pending') = 'pending' then
    select * into v_conv from public.conversations where id = new.conversation_id;
    if v_conv.id is not null and v_conv.listing_id is not null then
      if (new.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
        v_amount := (new.metadata->>'amount')::numeric;
      else
        v_amount := null;
      end if;

      v_ceiling := public.offer_price_ceiling(v_conv.listing_id, new.metadata);

      if v_amount is not null and v_amount > 0 and (v_ceiling is null or v_amount <= v_ceiling) then
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

drop function if exists public.accept_chat_offer(uuid) cascade;

create or replace function public.accept_chat_offer(
  p_offer_message_id uuid
)
returns jsonb
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
  v_amount numeric;
  v_is_admin boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  perform set_config('ceranix.in_accept_offer', 'on', true);

  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

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
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Offer has no valid amount' using errcode = '22000';
    end if;

    insert into public.offers (
      id, listing_id, buyer_id, seller_id, amount, status, expires_at,
      conversation_id, message_id, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_conversation.listing_id,
      v_conversation.buyer_id,
      v_conversation.seller_id,
      v_amount,
      coalesce(v_message.offer_status, 'pending'),
      coalesce(v_message.created_at, v_now) + interval '24 hours',
      v_conversation.id,
      v_message.id,
      coalesce(v_message.created_at, v_now),
      v_now
    ) returning * into v_offer;
  elsif v_offer.message_id is not null then
    select * into v_message
      from public.messages
     where id = v_offer.message_id;
  end if;

  if v_offer.status not in ('pending', 'proposed') then
    raise exception 'Offer is no longer active (current status: %)', v_offer.status using errcode = '22000';
  end if;

  if v_offer.expires_at < v_now then
    update public.offers set status = 'expired', updated_at = v_now where id = v_offer.id;
    raise exception 'Offer has expired' using errcode = '22000';
  end if;

  select * into v_listing
    from public.listings
   where id = v_offer.listing_id
     for update;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  if v_caller_id <> v_offer.buyer_id and v_caller_id <> v_offer.seller_id and not v_is_admin then
    raise exception 'Not authorized to accept an offer in this conversation' using errcode = '42501';
  end if;

  if v_message.id is not null and v_message.sender_id is not null and v_caller_id = v_message.sender_id and not v_is_admin then
    raise exception 'Cannot accept your own offer' using errcode = '22000';
  end if;

  if v_listing.is_sold or exists (
       select 1 from public.listings l
        where l.is_sold
          and l.id::text in (
                select x from jsonb_array_elements_text(
                  case when jsonb_typeof(v_message.metadata->'bundle_item_ids') = 'array'
                       then v_message.metadata->'bundle_item_ids' else '[]'::jsonb end) as x)
     ) then
    raise exception 'Listing has already been sold' using errcode = '23505';
  end if;

  if v_offer.amount > coalesce(public.offer_price_ceiling(v_listing.id, v_message.metadata), v_listing.price)
     and not v_is_admin then
    raise exception 'Offer amount cannot exceed listing price' using errcode = '22000';
  end if;

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

  -- The listing stays available; checkout is what sells it.
  return jsonb_build_object(
    'success', true,
    'offer_id', v_offer.id,
    'listing_id', v_listing.id,
    'buyer_id', v_offer.buyer_id,
    'amount', v_offer.amount,
    'status', 'accepted'
  );
end;
$$;

revoke execute on function public.accept_chat_offer(uuid) from public, anon;
grant execute on function public.accept_chat_offer(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. counter_chat_offer: keep the bundle the parent offer was for
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_sender_id uuid := auth.uid();
  v_parent public.messages;
  v_conversation public.conversations;
  v_child_msg public.messages;
  v_content text;
  v_amount_val numeric;
  v_now timestamptz := clock_timestamp();
begin
  perform set_config('ceranix.in_counter_offer', 'on', true);

  -- p_sender_id is ignored: the sender is always the authenticated caller.
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
     set offer_status = 'countered', updated_at = v_now
   where id = p_parent_offer_id;

  update public.offers
     set status = 'countered', updated_at = v_now
   where message_id = p_parent_offer_id or id = p_parent_offer_id;

  v_content := coalesce(
    nullif(trim(p_content), ''),
    nullif(trim(p_note), ''),
    'Counter-Offer: PKR ' || to_char(v_amount_val, 'FM999,999,999.00')
  );

  insert into public.messages (
    conversation_id, sender_id, content, kind, offer_status, parent_offer_id, metadata, created_at, updated_at
  ) values (
    v_conversation.id,
    v_sender_id,
    v_content,
    'offer',
    'pending',
    p_parent_offer_id,
    jsonb_strip_nulls(jsonb_build_object(
      'amount', v_amount_val,
      'offer_amount', v_amount_val,
      'currency', 'PKR',
      'note', nullif(trim(p_note), ''),
      'parent_offer_id', p_parent_offer_id,
      'counter_to', p_parent_offer_id,
      'is_bundle', v_parent.metadata->'is_bundle',
      'base_listing_id', v_parent.metadata->'base_listing_id',
      'bundle_item_ids', v_parent.metadata->'bundle_item_ids',
      'bundle_count', v_parent.metadata->'bundle_count'
    )),
    v_now,
    v_now
  ) returning * into v_child_msg;

  update public.conversations
     set updated_at = v_now
   where id = v_conversation.id;

  return v_child_msg;
end;
$$;

revoke execute on function public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) from public, anon;
grant execute on function public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. complete_cod_order: each party confirms only for themselves, after shipping
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.complete_cod_order(uuid, text) cascade;

create or replace function public.complete_cod_order(
  p_order_id uuid,
  p_role text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
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

  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  if v_order.status in ('canceled', 'refunded', 'refund_due', 'failed', 'disputed')
     or v_order.fulfillment_status in ('canceled', 'disputed') then
    raise exception 'Order is % and cannot be completed', v_order.status using errcode = '22000';
  end if;

  if not v_is_admin then
    if v_caller_id is distinct from v_order.buyer_id and v_caller_id is distinct from v_order.seller_id then
      raise exception 'Unauthorized to confirm COD payment for this order' using errcode = '42501';
    end if;
    -- Cash changes hands on delivery; it can't be confirmed before the parcel ships.
    if v_order.fulfillment_status not in ('shifting', 'delivered') then
      raise exception 'COD payment can only be confirmed once the order has been dispatched' using errcode = '22000';
    end if;
    -- A participant confirms for themselves only; p_role is honoured for admins alone.
    if v_caller_id = v_order.buyer_id then
      v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
    end if;
    if v_caller_id = v_order.seller_id then
      v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
    end if;
  elsif p_role = 'buyer' then
    v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
  elsif p_role = 'seller' then
    v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
  else
    v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
    v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
  end if;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_order.cod_buyer_confirmed_at is not null and v_order.cod_seller_confirmed_at is not null then
    update public.orders
       set cod_buyer_confirmed_at = v_order.cod_buyer_confirmed_at,
           cod_seller_confirmed_at = v_order.cod_seller_confirmed_at,
           status = 'completed',
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

    if v_conv_id is not null then
      insert into public.messages (conversation_id, sender_id, content, kind, metadata)
      values (
        v_conv_id, coalesce(v_caller_id, v_order.seller_id),
        'Cash on Delivery confirmed by both buyer and seller! 💵 Order completed successfully.', 'system',
        jsonb_build_object('order_id', p_order_id, 'fulfillment_status', 'completed', 'status', 'completed',
                           'cod_paid_at', v_now, 'updated_at', v_now)
      );
    end if;
  else
    update public.orders
       set cod_buyer_confirmed_at = v_order.cod_buyer_confirmed_at,
           cod_seller_confirmed_at = v_order.cod_seller_confirmed_at
     where id = p_order_id
    returning * into v_order;

    if v_conv_id is not null then
      insert into public.messages (conversation_id, sender_id, content, kind, metadata)
      values (
        v_conv_id, coalesce(v_caller_id, v_order.seller_id),
        case
          when v_order.cod_seller_confirmed_at is not null then
            'Seller has selected Confirm COD Payment. ⏳ Waiting for buyer to confirm COD payment to finalize.'
          else
            'Buyer has selected Confirm COD Payment. ⏳ Waiting for seller to confirm COD payment to finalize.'
        end,
        'system',
        jsonb_build_object('order_id', p_order_id,
                           'cod_seller_confirmed_at', v_order.cod_seller_confirmed_at,
                           'cod_buyer_confirmed_at', v_order.cod_buyer_confirmed_at,
                           'updated_at', v_now)
      );
    end if;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.complete_cod_order(uuid, text) from public, anon;
grant execute on function public.complete_cod_order(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. confirm_order_received: only a paid, dispatched, non-COD order
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

  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  if v_order.payment_method = 'cod' then
    raise exception 'Cash on Delivery orders are completed by confirming COD payment' using errcode = '22000';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'Cannot confirm receipt of an order that is %', v_order.status using errcode = '22000';
  end if;

  if v_order.fulfillment_status not in ('shifting', 'delivered') then
    raise exception 'Cannot confirm receipt before the order has been dispatched' using errcode = '22000';
  end if;

  update public.orders
     set status = 'completed',
         fulfillment_status = 'completed',
         escrow_status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         completed_at = coalesce(completed_at, v_now)
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
    transaction_id, order_id, from_status, to_status, actor_id, action, notes, metadata
  )
  select t.id, p_order_id, 'IN_TRANSIT', 'COMPLETED_FUNDS_RELEASED', v_buyer_id,
         'BUYER_CONFIRM_RECEIPT', 'Buyer confirmed delivery and released escrow funds',
         jsonb_build_object('confirmed_at', v_now)
    from public.transactions t
   where t.order_id = p_order_id;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (
      v_conv_id, v_buyer_id, 'Order Completed! 🎉 The buyer has confirmed delivery and released payment to the seller.', 'system',
      jsonb_build_object('order_id', p_order_id, 'status', 'completed',
                         'fulfillment_status', 'completed', 'updated_at', v_now)
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.confirm_order_received(uuid) from public, anon;
grant execute on function public.confirm_order_received(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. cancel_order: not after courier pickup or during a dispute; relist bundles
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.cancel_order(uuid, text) cascade;

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default 'Buyer requested cancellation'
)
returns public.orders
language plpgsql
security definer
set search_path = ''
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

  if v_order.status in ('completed', 'refunded', 'canceled', 'refund_due', 'failed') then
    raise exception 'Order is already %', v_order.status using errcode = '22000';
  end if;

  if v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then
    raise exception 'This order is under dispute review and cannot be cancelled' using errcode = '22000';
  end if;

  if v_order.shipped_at is not null
     or v_order.fulfillment_status in ('picked', 'shifting', 'delivered', 'completed') then
    raise exception 'Cannot cancel an order that has already been picked up or shipped' using errcode = '22000';
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

  -- Relist every item the order covered (primary + bundle add-ons)
  update public.listings
     set is_sold = false,
         reserved_until = null
   where id = v_order.listing_id
      or id = any(coalesce(v_order.bundle_item_ids, '{}'::uuid[]));

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
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (
      v_conv_id, v_caller_id,
      'Order cancelled by ' || v_caller_role || E'\nReason: ' || coalesce(p_reason, 'No reason specified') ||
      case when v_target_status = 'canceled' then E'\nThe item is now available again.' else '' end,
      'system',
      jsonb_build_object('order_id', p_order_id, 'status', v_order.status,
                         'reason', p_reason, 'cancelled_by_role', v_caller_role)
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Listing anti-tamper: cover every in-flight order state
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Sellers can update own listings" on public.listings;
create policy "Sellers can update own listings" on public.listings
  for update to authenticated
  using (
    (select auth.uid()) = seller_id
    and not exists (
      select 1 from public.orders o
       where (o.listing_id = listings.id or listings.id = any(coalesce(o.bundle_item_ids, '{}'::uuid[])))
         and o.status in ('awaiting_payment', 'pending', 'paid', 'packing', 'picked', 'shifting', 'delivered', 'disputed')
    )
  );

drop policy if exists "Sellers can delete own listings" on public.listings;
create policy "Sellers can delete own listings" on public.listings
  for delete to authenticated
  using (
    (select auth.uid()) = seller_id
    and not exists (
      select 1 from public.orders o
       where (o.listing_id = listings.id or listings.id = any(coalesce(o.bundle_item_ids, '{}'::uuid[])))
         and o.status in ('awaiting_payment', 'pending', 'paid', 'packing', 'picked', 'shifting', 'delivered', 'disputed')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Legacy fulfillment overload: no role rules, lets a seller complete alone.
--    The app calls only the (…, p_target_status, …, p_seller_pickup_address) form.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.advance_order_fulfillment(uuid, text, text, text, text, text[]);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Money RPCs are for signed-in users (and cron/service role) only
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb)',
    'public.advance_escrow_status(uuid, text, text, text, text, text, text)',
    'public.create_cod_order(uuid, uuid, jsonb, numeric, text, text)',
    'public.mark_order_shipped(uuid, text, text)',
    'public.upsert_shipping_address_with_default(jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;

  -- Scheduled jobs: no reason for any client to trigger them.
  foreach f in array array[
    'public.auto_complete_delivered_orders()',
    'public.release_expired_reservations()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Legacy order path (live only): created orders from an accepted offer with
--     the Buyer Protection fee waived, bypassing process_checkout. Unused by the app.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.create_order_from_accepted_offer(uuid, uuid);

do $$
declare f text;
begin
  foreach f in array array['public.set_default_payout(jsonb)'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
    end if;
  end loop;
  -- Trigger functions and scheduled sweeps are never called through the API.
  -- (EXECUTE is checked when a trigger is created, not when it fires.)
  foreach f in array array[
    'public.trg_fn_auto_create_order_transaction()',
    'public.trg_fn_sync_offer_on_message_insert()',
    'public.sweep_expired_offers_and_reservations()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
