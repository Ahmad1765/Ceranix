-- Covering index for message_reactions_user_id_fkey (advisor 0001).
-- The unique key is (message_id, user_id), so its index can't serve a lookup
-- by user_id alone — which is what cascading a profile delete has to do.
create index if not exists message_reactions_user_idx
  on public.message_reactions (user_id);
