-- Message reactions.
--
-- One emoji per person per message (the Plick / Instagram model, not Slack's
-- multi-reaction pile): a second tap replaces the first, tapping the same emoji
-- again clears it. That keeps the bubble decoration to a single chip and makes
-- the write path an upsert on one unique key.
--
-- `conversation_id` is denormalised off the message on purpose. Supabase
-- realtime can only filter `postgres_changes` on columns of the table itself,
-- so without it a thread would have to subscribe to every reaction in the
-- database and filter client-side. A BEFORE trigger owns the column so a client
-- can never set it to a conversation it doesn't belong to.

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_reactions_emoji_len check (char_length(emoji) between 1 and 16),
  constraint message_reactions_one_per_user unique (message_id, user_id)
);

comment on table public.message_reactions is
  'One emoji reaction per user per message. conversation_id is trigger-maintained for realtime filtering.';

-- Postgres evaluates a policy's WITH CHECK against the row as it stands after
-- BEFORE triggers, so the insert policy below sees the conversation_id this
-- sets rather than whatever the client sent.
create or replace function public.set_message_reaction_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select m.conversation_id
    into new.conversation_id
    from public.messages m
   where m.id = new.message_id;

  if new.conversation_id is null then
    raise exception 'message % not found', new.message_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists message_reactions_set_conversation on public.message_reactions;
create trigger message_reactions_set_conversation
  before insert or update on public.message_reactions
  for each row execute function public.set_message_reaction_conversation();

-- The unique constraint already indexes (message_id, user_id), which serves
-- every per-message lookup; this one backs the thread-wide fetch.
create index if not exists message_reactions_conversation_idx
  on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;

drop policy if exists "Participants can view reactions" on public.message_reactions;
create policy "Participants can view reactions"
  on public.message_reactions for select
  using (
    exists (
      select 1
        from public.conversations c
       where c.id = message_reactions.conversation_id
         and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

drop policy if exists "Participants can react" on public.message_reactions;
create policy "Participants can react"
  on public.message_reactions for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
       where m.id = message_reactions.message_id
         and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

drop policy if exists "Users can change their own reaction" on public.message_reactions;
create policy "Users can change their own reaction"
  on public.message_reactions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own reaction" on public.message_reactions;
create policy "Users can remove their own reaction"
  on public.message_reactions for delete
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.message_reactions to authenticated;

-- A DELETE payload carries only the replica identity, and the thread needs to
-- know *which message* lost a reaction — the primary key alone doesn't say.
alter table public.message_reactions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end
$$;
