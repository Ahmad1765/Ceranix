-- Migration: Chat-to-Order Bridge RPC & Concurrency Lock
-- File: supabase/migrations/20260911225000_chat_to_order_bridge_rpc.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- Update validate_offer_status_update() to support 'proposed' and 'countered'
-- and permit atomic transaction-level bypass for cross-conversation auto-decline
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Transaction-local bypass for atomic offer acceptance routines
  if current_setting('ceranix.in_accept_offer', true) = 'on' then
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
    if caller is distinct from counterparty then
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

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: accept_chat_offer (Atomic Chat-to-Order Bridge)
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
  v_caller_id uuid;
  v_message record;
  v_conversation record;
  v_listing record;
  v_order public.orders;
  v_counterparty uuid;
  v_amount_cents int;
  v_fee_cents int := 0;
  v_item_price numeric;
begin
  -- 1. MANDATORY AUTHENTICATION CHECK
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Set transaction-local setting for clean cross-conversation auto-declines
  perform set_config('ceranix.in_accept_offer', 'on', true);

  -- 2. LOCK & VERIFY OFFER MESSAGE
  select *
    into v_message
    from public.messages
   where id = p_offer_message_id
     for update;

  if not found then
    raise exception 'Offer message not found' using errcode = 'P0002';
  end if;

  if v_message.kind <> 'offer' then
    raise exception 'Message is not an offer' using errcode = '22000';
  end if;

  if v_message.offer_status not in ('proposed', 'pending') then
    raise exception 'Offer is no longer active (current status: %)', v_message.offer_status using errcode = '22000';
  end if;

  -- 3. LOCK & VERIFY CONVERSATION
  select *
    into v_conversation
    from public.conversations
   where id = v_message.conversation_id;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conversation.listing_id is null then
    raise exception 'Cannot accept offer on direct conversation without listing' using errcode = '22000';
  end if;

  -- Counterparty verification
  v_counterparty := case
    when v_message.sender_id = v_conversation.buyer_id then v_conversation.seller_id
    else v_conversation.buyer_id
  end;

  if v_caller_id <> v_counterparty then
    raise exception 'Only the offer recipient may accept this offer' using errcode = '42501';
  end if;

  -- 4. ROW-LEVEL LOCK ON LISTING TO PREVENT DOUBLE-BOOKING CONCURRENCY
  select *
    into v_listing
    from public.listings
   where id = v_conversation.listing_id
     for update;

  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;

  if v_listing.is_sold then
    raise exception 'Listing has already been sold or committed to another order' using errcode = '23505';
  end if;

  -- Verify no existing non-terminal orders on this listing
  if exists (
    select 1 from public.orders
     where listing_id = v_listing.id
       and status in ('awaiting_payment', 'pending', 'paid', 'packing', 'shifting', 'delivered')
  ) then
    raise exception 'Listing already has an active order' using errcode = '23505';
  end if;

  -- 5. COMPUTE PRICING
  v_item_price := (v_message.metadata->>'amount')::numeric;
  if v_item_price is null or v_item_price <= 0 then
    v_item_price := v_listing.price;
  end if;

  v_amount_cents := round(v_item_price * 100)::integer;
  if v_amount_cents <= 0 then
    raise exception 'Invalid offer amount' using errcode = '22000';
  end if;

  -- 6. TRANSITION ACCEPTED OFFER
  update public.messages
     set offer_status = 'accepted',
         updated_at = now()
   where id = p_offer_message_id;

  -- 7. AUTO-DECLINE COMPETING ACTIVE OFFERS ON THIS LISTING
  update public.messages m
     set offer_status = 'declined',
         updated_at = now()
    from public.conversations c
   where m.conversation_id = c.id
     and c.listing_id = v_listing.id
     and m.id <> p_offer_message_id
     and m.kind = 'offer'
     and m.offer_status in ('proposed', 'pending');

  -- 8. LOCK LISTING INVENTORY
  update public.listings
     set is_sold = true
   where id = v_listing.id;

  -- 9. CREATE ACTIVE ORDER RECORD (Awaiting Payment Gate)
  insert into public.orders (
    listing_id,
    buyer_id,
    seller_id,
    amount_cents,
    fee_cents,
    currency,
    offer_message_id,
    status,
    fulfillment_status,
    payment_method
  ) values (
    v_listing.id,
    v_conversation.buyer_id,
    v_conversation.seller_id,
    v_amount_cents,
    v_fee_cents,
    'pkr',
    p_offer_message_id,
    'awaiting_payment',
    'awaiting_payment',
    'card'
  )
  returning * into v_order;

  -- 10. POST REALTIME NOTIFICATION IN CHAT CONVERSATION
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    kind,
    metadata
  ) values (
    v_conversation.id,
    v_caller_id,
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

revoke execute on function public.accept_chat_offer(uuid) from public, anon;
grant execute on function public.accept_chat_offer(uuid) to authenticated, service_role;
