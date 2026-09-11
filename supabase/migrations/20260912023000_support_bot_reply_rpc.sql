-- Migration: Add dispatch_support_bot_reply RPC
-- Allows authenticated conversation participants to trigger automated support bot replies
-- Enforces sender identity and authorization securely on the server via SECURITY DEFINER.

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

  -- 1. Verify conversation exists and caller is an active participant
  select * into v_conv
    from public.conversations
   where id = p_conversation_id;

  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_caller_id and v_conv.seller_id <> v_caller_id then
    raise exception 'Not authorized to request support reply in this conversation' using errcode = '42501';
  end if;

  -- 2. Verify that this conversation is indeed with the official support bot
  if v_conv.buyer_id <> v_bot_id and v_conv.seller_id <> v_bot_id then
    raise exception 'Target conversation is not a support conversation' using errcode = '22000';
  end if;

  -- 3. Insert automated support bot message
  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    kind,
    created_at
  ) values (
    p_conversation_id,
    v_bot_id,
    p_content,
    'text',
    now()
  )
  returning * into v_msg;

  -- 4. Bump conversation updated_at
  update public.conversations
     set updated_at = now()
   where id = p_conversation_id;

  return v_msg;
end;
$$;

revoke execute on function public.dispatch_support_bot_reply(uuid, text) from public, anon;
grant execute on function public.dispatch_support_bot_reply(uuid, text) to authenticated;
