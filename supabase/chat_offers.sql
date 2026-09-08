-- Ceranix — chat + offers backend (mirrors live).
-- Run after setup.sql. Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- conversations: track last sender, allow buyers to start + participants to update
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists last_sender_id uuid references public.profiles(id) on delete set null;

create index if not exists conversations_buyer_idx
  on public.conversations(buyer_id, updated_at desc);
create index if not exists conversations_seller_idx
  on public.conversations(seller_id, updated_at desc);
create index if not exists conversations_last_sender_idx
  on public.conversations(last_sender_id);
-- Deduplicate any existing direct conversations between the same participant pair before creating the unique index
do $$
declare
  has_offer_trigger boolean;
  has_reactions_table boolean;
begin
  drop table if exists _conv_duplicates;
  create temp table _conv_duplicates on commit drop as
  with ranked as (
    select
      id,
      least(buyer_id, seller_id) as p1,
      greatest(buyer_id, seller_id) as p2,
      row_number() over (
        partition by least(buyer_id, seller_id), greatest(buyer_id, seller_id)
        order by
          (exists (select 1 from public.messages m where m.conversation_id = c.id)) desc,
          updated_at desc nulls last,
          id asc
      ) as rn,
      first_value(id) over (
        partition by least(buyer_id, seller_id), greatest(buyer_id, seller_id)
        order by
          (exists (select 1 from public.messages m where m.conversation_id = c.id)) desc,
          updated_at desc nulls last,
          id asc
      ) as canonical_id
    from public.conversations c
    where listing_id is null
  )
  select id as duplicate_id, canonical_id
  from ranked
  where rn > 1;

  if exists (select 1 from _conv_duplicates) then
    select exists (
      select 1 from pg_trigger where tgname = 'trg_validate_offer_status_update'
    ) into has_offer_trigger;

    if has_offer_trigger then
      execute 'alter table public.messages disable trigger trg_validate_offer_status_update';
    end if;

    update public.messages m
    set conversation_id = d.canonical_id
    from _conv_duplicates d
    where m.conversation_id = d.duplicate_id;

    if has_offer_trigger then
      execute 'alter table public.messages enable trigger trg_validate_offer_status_update';
    end if;

    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'message_reactions'
    ) into has_reactions_table;

    if has_reactions_table then
      execute '
        update public.message_reactions mr
        set conversation_id = d.canonical_id
        from _conv_duplicates d
        where mr.conversation_id = d.duplicate_id';
    end if;

    delete from public.conversations c
    using _conv_duplicates d
    where c.id = d.duplicate_id;

    update public.conversations c
    set
      updated_at = sub.latest_created_at,
      last_message = left(sub.content, 140),
      last_sender_id = sub.sender_id
    from (
      select distinct on (conversation_id)
        conversation_id, content, sender_id, created_at as latest_created_at
      from public.messages
      where conversation_id in (select canonical_id from _conv_duplicates)
      order by conversation_id, created_at desc
    ) sub
    where c.id = sub.conversation_id
      and (c.updated_at is null or sub.latest_created_at > c.updated_at);
  end if;
end $$;

create unique index if not exists direct_conversations_participants_idx
  on public.conversations (least(buyer_id, seller_id), greatest(buyer_id, seller_id))
  where listing_id is null;

-- The "Participants can view" policy already exists in setup.sql; INSERT/UPDATE
-- are added here so the client can create and bump conversations from the app.
-- auth.uid() is wrapped in (select ...) so it's evaluated once per query.
drop policy if exists "Buyers can create conversations" on public.conversations;
create policy "Buyers can create conversations" on public.conversations
  for insert with check ((select auth.uid()) = buyer_id);

drop policy if exists "Participants can update conversations" on public.conversations;
create policy "Participants can update conversations" on public.conversations
  for update using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id)
  with check ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- messages: support text + offer messages
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text','offer','system')),
  add column if not exists metadata jsonb,
  add column if not exists offer_status text
    check (offer_status in ('pending','accepted','declined','expired','withdrawn')),
  add column if not exists updated_at timestamptz default now() not null;

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at);
create index if not exists messages_sender_idx
  on public.messages(sender_id);

-- Allow participants to update offer_status on offer messages (accept / decline).
-- The policy is just an authorization gate; the BEFORE UPDATE trigger below
-- enforces who can change what and that no other columns are mutated.
drop policy if exists "Participants can update offer status" on public.messages;
create policy "Participants can update offer status" on public.messages
  for update using (
    kind = 'offer' and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  ) with check (
    kind = 'offer' and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate offer_status updates: only counterparty accepts/declines, only
-- sender withdraws, only service_role can mark expired, no other columns may
-- be mutated, valid transitions only.
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

  -- Block mutation of any column other than offer_status / updated_at.
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id      is distinct from old.sender_id
     or new.content        is distinct from old.content
     or new.kind           is distinct from old.kind
     or new.metadata       is distinct from old.metadata
     or new.created_at     is distinct from old.created_at then
    raise exception 'offer messages: only offer_status may be updated';
  end if;

  -- Short-circuit on metadata-only no-op.
  if new.offer_status is not distinct from old.offer_status then
    return new;
  end if;

  -- Only pending offers may transition.
  if old.offer_status is distinct from 'pending' then
    raise exception 'offer is no longer pending (current: %)', old.offer_status;
  end if;

  -- Valid target states.
  if new.offer_status not in ('accepted','declined','expired','withdrawn') then
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

  -- Counterparty = whichever participant did NOT send the offer.
  counterparty := case when old.sender_id = buyer then seller else buyer end;

  if new.offer_status = 'withdrawn' then
    if caller is distinct from old.sender_id then
      raise exception 'only the offer sender may withdraw';
    end if;
  elsif new.offer_status in ('accepted','declined') then
    if caller is distinct from counterparty then
      raise exception 'only the counterparty may accept or decline this offer';
    end if;
  elsif new.offer_status = 'expired' then
    -- Reserved for service / scheduled jobs (auth.uid() is null). Authenticated
    -- callers must use withdrawn/declined instead.
    if caller is not null then
      raise exception 'only service role may mark offers expired';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_offer_status_update on public.messages;
create trigger trg_validate_offer_status_update
  before update on public.messages
  for each row execute procedure public.validate_offer_status_update();

revoke execute on function public.validate_offer_status_update() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bump conversation.last_message + updated_at when a new message lands
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview text;
begin
  if new.kind = 'offer' then
    preview := 'Offer: Rs ' || coalesce((new.metadata->>'amount'), '?');
  else
    preview := left(new.content, 140);
  end if;
  update public.conversations
    set last_message = preview,
        last_sender_id = new.sender_id,
        updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_insert_bump_conversation on public.messages;
create trigger on_message_insert_bump_conversation
  after insert on public.messages
  for each row execute procedure public.bump_conversation_on_message();

revoke execute on function public.bump_conversation_on_message() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Touch messages.updated_at on any update (offer accept/decline tracking)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_message_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_messages_touch on public.messages;
create trigger trg_messages_touch
  before update on public.messages
  for each row execute procedure public.touch_message_updated_at();

revoke execute on function public.touch_message_updated_at() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime: make sure conversations + messages publish change events
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.messages';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.conversations';
    exception when duplicate_object then null;
    end;
  end if;
end$$;
