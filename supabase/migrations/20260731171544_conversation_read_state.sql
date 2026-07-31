-- Read state for conversations.
--
-- The inbox has been showing its unread dot purely from "the last message
-- wasn't mine", so opening a thread never cleared it — the only way to lose the
-- dot was to reply. This records when each side last read the thread, so
-- unread becomes: they spoke last, and they spoke after I last looked.
--
-- Two columns rather than a conversation_reads table: a conversation has
-- exactly two participants by construction (buyer_id / seller_id), so a join
-- table would carry a row per side and buy nothing.

alter table public.conversations
  add column if not exists buyer_last_read_at timestamptz,
  add column if not exists seller_last_read_at timestamptz;

comment on column public.conversations.buyer_last_read_at is
  'When the buyer last opened this thread. NULL means never. Written only via public.mark_conversation_read().';
comment on column public.conversations.seller_last_read_at is
  'When the seller last opened this thread. NULL means never. Written only via public.mark_conversation_read().';

-- Why an RPC and not a plain UPDATE: the existing "Participants can update
-- conversations" policy is row-level, not column-level, so either participant
-- could otherwise advance the *other* side's read stamp and silently clear the
-- unread dot on someone else's inbox. This narrows the write to "my own column,
-- on a thread I'm actually in".
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_buyer  uuid;
  v_seller uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select c.buyer_id, c.seller_id
    into v_buyer, v_seller
    from public.conversations c
   where c.id = p_conversation_id;

  if v_buyer is null then
    raise exception 'conversation not found';
  end if;

  if v_caller = v_buyer then
    update public.conversations
       set buyer_last_read_at = now()
     where id = p_conversation_id;
  elsif v_caller = v_seller then
    update public.conversations
       set seller_last_read_at = now()
     where id = p_conversation_id;
  else
    raise exception 'not a participant in this conversation';
  end if;
end;
$$;

-- Same lockdown as the other RPCs in this project: never reachable
-- unauthenticated (see 20260611223243_revoke_public_execute_on_rpcs).
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
