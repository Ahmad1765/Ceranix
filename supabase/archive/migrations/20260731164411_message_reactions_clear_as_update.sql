-- Clearing a reaction is an UPDATE, not a DELETE.
--
-- Supabase Realtime has two hard limitations that together make DELETE useless
-- for this table (https://supabase.com/docs/guides/realtime/postgres-changes):
--
--   1. "You can't filter Delete events when tracking Postgres Changes."  Our
--      subscription filters on conversation_id, so DELETEs were never even
--      delivered to the thread.
--   2. "RLS policies are not applied to DELETE statements" — so on an
--      RLS-enabled table the `old` record is trimmed to the primary key alone,
--      even under REPLICA IDENTITY FULL. message_id/user_id never arrive, so
--      there is no way to tell which bubble lost its reaction.
--
-- Net effect before this change: the *other* participant removing a reaction
-- never reached your client, and the emoji stayed on screen until a reload.
--
-- So the row is kept and `emoji` goes NULL instead — a tombstone meaning "this
-- person has no reaction here". That's an UPDATE, which carries the whole new
-- record and honours the conversation_id filter, so one subscription covers
-- set / swap / clear alike. The row count is bounded by (messages × 2
-- participants) and each one is a handful of bytes.
--
-- NULL passes the existing char_length CHECK (a NULL result is not a
-- violation), so the constraint stays as-is and still rejects '' and overlong
-- values.

alter table public.message_reactions alter column emoji drop not null;

comment on column public.message_reactions.emoji is
  'NULL means the user cleared their reaction. Rows are never deleted — see the migration that introduced this for why (Realtime cannot filter DELETEs and strips their payload under RLS).';

-- REPLICA IDENTITY FULL bought nothing: under RLS the DELETE payload is cut
-- back to the primary key regardless, and FULL writes every old row to the WAL.
alter table public.message_reactions replica identity default;
