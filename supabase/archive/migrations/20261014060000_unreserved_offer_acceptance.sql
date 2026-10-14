-- Migration: 20261014060000_unreserved_offer_acceptance.sql
-- Description: Unreserved offer acceptance.
-- Accepting an offer only transitions offer/message status to 'accepted'.
-- It NEVER reserves the listing, NEVER sets is_sold = true, and NEVER creates an order.
-- Orders and sold state are ONLY created upon completed checkout.

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
    raise exception 'Listing has already been sold' using errcode = '23505';
  end if;

  if v_offer.amount > v_listing.price and not v_is_admin then
    raise exception 'Offer amount cannot exceed listing price' using errcode = '22000';
  end if;

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

  -- NOTE: Listing inventory is NOT RESERVED NOR MARKED SOLD.
  -- NO ORDER ROW IS CREATED.
  -- The listing remains fully active and purchasable until buyer completes checkout.

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
