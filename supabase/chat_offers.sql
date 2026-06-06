-- Chat + Offers backend.
-- Run after setup.sql. Idempotent: safe to re-run.
--
-- Adds the columns + triggers needed by the in-app messaging and
-- "make an offer" flows. Conversations and messages already exist
-- in setup.sql; this migration only layers the bits the UI now uses.

-- ─────────────────────────────────────────────────────────────────────────────
-- conversations: keep updated_at fresh, allow upsert by (listing_id, buyer_id)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists last_sender_id uuid references public.profiles(id) on delete set null;

create index if not exists conversations_buyer_idx
  on public.conversations(buyer_id, updated_at desc);
create index if not exists conversations_seller_idx
  on public.conversations(seller_id, updated_at desc);
create index if not exists conversations_last_sender_idx
  on public.conversations(last_sender_id);

-- Allow buyers to start a conversation. The "Participants can view" policy
-- already exists; we also need INSERT and UPDATE policies so the client can
-- create and bump conversations from the app.
-- auth.uid() is wrapped in (select ...) so it's evaluated once per query
-- instead of once per row.
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

-- Allow participants to update offer_status on offer messages (accept / decline).
-- The policy is just an authorization gate; the BEFORE UPDATE trigger below
-- enforces who can change what (counterparty accepts/declines, sender withdraws)
-- and that no other columns are mutated.
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
-- Validate offer_status updates: only counterparty can accept/decline,
-- only sender can withdraw, no other columns may be mutated, valid transitions only.
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

  -- Short-circuit if status itself didn't change (e.g. metadata-only no-op).
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
    -- Only the original sender can withdraw their offer.
    if caller is distinct from old.sender_id then
      raise exception 'only the offer sender may withdraw';
    end if;
  elsif new.offer_status in ('accepted','declined') then
    -- Only the counterparty can accept or decline.
    if caller is distinct from counterparty then
      raise exception 'only the counterparty may accept or decline this offer';
    end if;
  end if;
  -- 'expired' is reserved for system / scheduled jobs running as service role
  -- (auth.uid() is null), which bypasses the caller checks above.

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
    preview := 'Offer: $' || coalesce((new.metadata->>'amount'), '?');
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

-- Trigger function only — not callable via PostgREST RPC.
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
