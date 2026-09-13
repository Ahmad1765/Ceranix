-- Migration: Allow users to delete their own messages and images from chat
-- Idempotent and safe to run multiple times.

-- 1. Enable DELETE policy for senders on public.messages
drop policy if exists "Senders can delete own messages" on public.messages;
create policy "Senders can delete own messages" on public.messages
  for delete using (
    (select auth.uid()) = sender_id
  );

-- 2. Secure RPC function for message deletion with caller validation
create or replace function public.delete_chat_message(
  p_message_id uuid,
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid;
begin
  select sender_id into v_sender_id
  from public.messages
  where id = p_message_id and conversation_id = p_conversation_id;

  if v_sender_id is null then
    return false;
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'Unauthorized to delete message';
  end if;

  delete from public.messages
  where id = p_message_id and conversation_id = p_conversation_id;

  return true;
end;
$$;

revoke execute on function public.delete_chat_message(uuid, uuid) from public, anon;
grant execute on function public.delete_chat_message(uuid, uuid) to authenticated;

-- 3. Recalculate conversation last_message if the deleted message was the latest
create or replace function public.handle_message_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last record;
  v_preview text;
begin
  select id, content, kind, metadata, sender_id, created_at
  into v_last
  from public.messages
  where conversation_id = old.conversation_id
  order by created_at desc
  limit 1;

  if v_last.id is not null then
    if v_last.kind = 'offer' then
      v_preview := 'Offer: Rs ' || coalesce((v_last.metadata->>'amount'), '?');
    else
      v_preview := left(v_last.content, 140);
    end if;
    update public.conversations
      set last_message = v_preview,
          last_sender_id = v_last.sender_id,
          updated_at = v_last.created_at
      where id = old.conversation_id;
  else
    update public.conversations
      set last_message = null,
          last_sender_id = null
      where id = old.conversation_id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_recalc_conversation_on_delete on public.messages;
create trigger trg_recalc_conversation_on_delete
  after delete on public.messages
  for each row
  execute function public.handle_message_delete();

revoke execute on function public.handle_message_delete() from public, anon, authenticated;

