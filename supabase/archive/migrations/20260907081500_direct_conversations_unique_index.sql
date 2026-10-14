-- Deduplicate existing direct conversations between the same user pair before creating the unique index.
-- Merges messages and message_reactions into the canonical conversation (prioritizing threads with messages / most recent activity),
-- then removes duplicate conversation rows so the unique index can be created cleanly.
do $$
declare
  has_offer_trigger boolean;
  has_reactions_table boolean;
begin
  -- Serialize direct-conversation deduplication and unique index creation against concurrent inserts
  lock table public.conversations in share row exclusive mode;

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

  -- Create unique index while retaining the table lock within the same transaction
  execute 'create unique index if not exists direct_conversations_participants_idx
    on public.conversations (least(buyer_id, seller_id), greatest(buyer_id, seller_id))
    where listing_id is null';
end $$;

-- Partial unique index on normalized participant pair for direct conversations (where listing_id is null).
-- Prevents duplicate conversations between the same two users regardless of who initiated (buyer_id vs seller_id),
-- and enables race-safe inserts via PostgreSQL error code 23505 (unique_violation).
create unique index if not exists direct_conversations_participants_idx
  on public.conversations (least(buyer_id, seller_id), greatest(buyer_id, seller_id))
  where listing_id is null;

