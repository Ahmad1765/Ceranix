-- Migration: Add atomic counter_chat_offer RPC
-- Atomically locks and validates the parent offer, transitions it to 'countered',
-- and inserts the child counter-offer in a single database transaction.

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
  -- 1. Authentication & sender check
  v_sender_id := coalesce(v_caller_id, p_sender_id);
  if v_sender_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid offer amount' using errcode = '22000';
  end if;
  v_amount_val := round(p_amount, 2);

  -- 2. Lock & validate parent offer message
  select *
    into v_parent
    from public.messages
   where id = p_parent_offer_id
     for update;

  if not found then
    raise exception 'Parent offer message not found' using errcode = 'P0002';
  end if;

  if v_parent.kind <> 'offer' then
    raise exception 'Target message is not an offer' using errcode = '22000';
  end if;

  if v_parent.offer_status not in ('proposed', 'pending') then
    raise exception 'Offer is no longer active (current status: %)', v_parent.offer_status using errcode = '22000';
  end if;

  -- 3. Lock & validate conversation
  select *
    into v_conversation
    from public.conversations
   where id = v_parent.conversation_id;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if p_conversation_id is not null and p_conversation_id <> v_parent.conversation_id then
    raise exception 'Conversation mismatch' using errcode = '22000';
  end if;

  -- Verify sender is a conversation participant and counterparty to parent offer sender
  if v_sender_id <> v_conversation.buyer_id and v_sender_id <> v_conversation.seller_id then
    raise exception 'Not authorized to make an offer in this conversation' using errcode = '42501';
  end if;

  if v_sender_id = v_parent.sender_id then
    raise exception 'Cannot counter your own offer' using errcode = '22000';
  end if;

  -- 4. Transition parent offer to 'countered'
  update public.messages
     set offer_status = 'countered',
         updated_at = now()
   where id = p_parent_offer_id;

  -- 5. Format child offer message content
  v_content := coalesce(
    nullif(trim(p_content), ''),
    nullif(trim(p_note), ''),
    'Counter-Offer: PKR ' || to_char(v_amount_val, 'FM999,999,999.00')
  );

  -- 6. Insert new child counter-offer
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    kind,
    parent_offer_id,
    metadata,
    offer_status,
    created_at,
    updated_at
  ) values (
    v_parent.conversation_id,
    v_sender_id,
    v_content,
    'offer',
    p_parent_offer_id,
    jsonb_build_object(
      'amount', v_amount_val,
      'currency', 'PKR',
      'note', nullif(trim(p_note), ''),
      'counter_to', p_parent_offer_id
    ),
    'pending',
    now(),
    now()
  )
  returning * into v_child_msg;

  -- 7. Touch conversation updated_at
  update public.conversations
     set updated_at = now()
   where id = v_parent.conversation_id;

  return v_child_msg;
end;
$$;

revoke execute on function public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) from public, anon;
grant execute on function public.counter_chat_offer(uuid, numeric, text, text, uuid, uuid) to authenticated, service_role;
