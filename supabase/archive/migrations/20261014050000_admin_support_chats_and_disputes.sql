-- Migration: Connect support chats to admin team and enable admin replies
-- Allows administrators to view all user support conversations and personally respond.

create or replace function public.admin_get_support_conversations(p_filter text default 'all')
returns table (
  id uuid,
  buyer_id uuid,
  seller_id uuid,
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  last_message text,
  updated_at timestamptz,
  message_count bigint,
  is_dispute boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.buyer_id,
    c.seller_id,
    case when c.buyer_id = v_bot_id then c.seller_id else c.buyer_id end as user_id,
    coalesce(p.username, 'member') as username,
    coalesce(p.full_name, 'Grabsty Member') as full_name,
    p.avatar_url,
    c.last_message,
    c.updated_at,
    coalesce(m.cnt, 0) as message_count,
    coalesce(c.last_message ilike '%dispute%' or exists (
      select 1 from public.messages msg
      where msg.conversation_id = c.id
      and msg.content ilike '%dispute%'
    ), false) as is_dispute
  from public.conversations c
  left join public.profiles p on p.id = (case when c.buyer_id = v_bot_id then c.seller_id else c.buyer_id end)
  left join (
    select conversation_id, count(*) as cnt
    from public.messages
    group by conversation_id
  ) m on m.conversation_id = c.id
  where (c.buyer_id = v_bot_id or c.seller_id = v_bot_id)
    and (
      p_filter = 'all'
      or (p_filter = 'disputes' and (c.last_message ilike '%dispute%' or exists (
        select 1 from public.messages msg where msg.conversation_id = c.id and msg.content ilike '%dispute%'
      )))
      or (p_filter = 'general' and not (c.last_message ilike '%dispute%' or exists (
        select 1 from public.messages msg where msg.conversation_id = c.id and msg.content ilike '%dispute%'
      )))
    )
  order by c.updated_at desc;
end;
$$;

revoke all on function public.admin_get_support_conversations(text) from public, anon;
grant execute on function public.admin_get_support_conversations(text) to authenticated, service_role;

-- Fetch support messages for admin
create or replace function public.admin_get_support_messages(p_conversation_id uuid)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  kind text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.kind,
    m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at asc;
end;
$$;

revoke all on function public.admin_get_support_messages(uuid) from public, anon;
grant execute on function public.admin_get_support_messages(uuid) to authenticated, service_role;

-- Allow admin to personally respond in support conversation
create or replace function public.admin_send_support_message(
  p_conversation_id uuid,
  p_content text
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_conv public.conversations;
  v_msg public.messages;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_bot_id and v_conv.seller_id <> v_bot_id then
    raise exception 'Not a support conversation' using errcode = '22000';
  end if;

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

  update public.conversations
     set last_message = p_content,
         updated_at = now()
   where id = p_conversation_id;

  return v_msg;
end;
$$;

revoke all on function public.admin_send_support_message(uuid, text) from public, anon;
grant execute on function public.admin_send_support_message(uuid, text) to authenticated, service_role;
