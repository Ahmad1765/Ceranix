-- Migration: Allow counterparty to accept & counter chat offers
-- 1. Updates validate_offer_status_update trigger to allow 'countered' state and transaction bypass.
-- 2. Updates counter_chat_offer RPC to enable atomic parent offer transitioning without trigger collision.
-- 3. Updates accept_chat_offer RPC to authorize whichever party received the offer (counterparty) to accept.

-- 1. UPDATE TRIGGER TO PERMIT 'countered' STATUS & TRANSACTION BYPASS ─────────
create or replace function public.validate_offer_status_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  buyer  uuid;
  seller uuid;
  counterparty uuid;
begin
  if old.kind <> 'offer' then
    return new;
  end if;

  -- Transaction-local bypass for atomic offer acceptance and counter-offer routines
  if current_setting('ceranix.in_accept_offer', true) = 'on'
     or current_setting('ceranix.in_counter_offer', true) = 'on' then
    return new;
  end if;

  -- Block mutation of any column other than offer_status / updated_at / parent_offer_id
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id      is distinct from old.sender_id
     or new.content        is distinct from old.content
     or new.kind           is distinct from old.kind
     or new.metadata       is distinct from old.metadata
     or new.created_at     is distinct from old.created_at then
    raise exception 'offer messages: only offer_status may be updated';
  end if;

  -- Short-circuit on metadata-only no-op
  if new.offer_status is not distinct from old.offer_status then
    return new;
  end if;

  -- Only proposed or pending offers may transition
  if old.offer_status not in ('proposed', 'pending') then
    raise exception 'offer is no longer active (current: %)', old.offer_status;
  end if;

  -- Valid target states
  if new.offer_status not in ('accepted', 'declined', 'countered', 'expired', 'withdrawn') then
    raise exception 'invalid offer_status transition: % -> %',
      old.offer_status, new.offer_status;
  end if;

  select c.buyer_id, c.seller_id
    into buyer, seller
    from public.conversations c
   where c.id = old.conversation_id;

  if buyer is null then
    raise exception 'conversation not found for message';
  end if;

  -- Counterparty = participant who did NOT send the offer
  counterparty := case when old.sender_id = buyer then seller else buyer end;

  if new.offer_status = 'withdrawn' then
    if caller is distinct from old.sender_id then
      raise exception 'only the offer sender may withdraw';
    end if;
  elsif new.offer_status in ('accepted', 'declined', 'countered') then
    if caller is not null and caller is distinct from counterparty then
      raise exception 'only the counterparty may accept, decline, or counter this offer';
    end if;
  elsif new.offer_status = 'expired' then
    if caller is not null then
      raise exception 'only service role may mark offers expired';
    end if;
  end if;

  return new;
end;
$$;

-- 2. HARDENED ATOMIC counter_chat_offer RPC ──────────────────────────────────
drop function if exists public.counter_chat_offer(uuid, numeric) cascade;
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
  v_caller_id uuid := auth.uid();
  v_sender_id uuid;
  v_parent public.messages;
  v_conversation public.conversations;
  v_child_msg public.messages;
  v_content text;
  v_amount_val numeric;
  v_now timestamptz := clock_timestamp();
begin
  -- Bypass trigger locks during atomic transaction
  perform set_config('ceranix.in_counter_offer', 'on', true);

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

  -- Transition parent offer to countered in messages
  update public.messages
     set offer_status = 'countered', updated_at = v_now
   where id = p_parent_offer_id;

  -- Transition parent offer in public.offers
  update public.offers
     set status = 'countered', updated_at = v_now
   where message_id = p_parent_offer_id or id = p_parent_offer_id;

  v_content := coalesce(
    nullif(trim(p_content), ''),
    nullif(trim(p_note), ''),
    'Counter-Offer: ' || v_amount_val::text || ' PKR'
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
    jsonb_build_object(
      'amount', v_amount_val,
      'currency', 'PKR',
      'note', nullif(trim(p_note), ''),
      'parent_offer_id', p_parent_offer_id,
      'counter_to', p_parent_offer_id
    ),
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

-- 3. HARDENED ATOMIC accept_chat_offer RPC ───────────────────────────────────
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

  -- 5. Mark offer accepted
  update public.offers
     set status = 'accepted',
         accepted_at = v_now,
         updated_at = v_now
   where id = v_offer.id;

  update public.offers
     set status = 'declined',
         updated_at = v_now
   where listing_id = v_listing.id
     and id <> v_offer.id
     and status in ('pending', 'proposed');

  if v_offer.message_id is not null then
    update public.messages
       set offer_status = 'accepted',
           updated_at = v_now
     where id = v_offer.message_id;
  end if;

  -- 6. Lock inventory with a 24-hour reservation
  update public.listings
     set is_sold = true,
         reserved_until = v_now + interval '24 hours'
   where id = v_listing.id;

  -- 7. Check for existing awaiting_payment order or create one
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
