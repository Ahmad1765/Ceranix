-- Partial unique index on normalized participant pair for direct conversations (where listing_id is null).
-- Prevents duplicate conversations between the same two users regardless of who initiated (buyer_id vs seller_id),
-- and enables race-safe inserts via PostgreSQL error code 23505 (unique_violation).
create unique index if not exists direct_conversations_participants_idx
  on public.conversations (least(buyer_id, seller_id), greatest(buyer_id, seller_id))
  where listing_id is null;
