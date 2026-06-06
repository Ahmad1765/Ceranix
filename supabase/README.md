# Supabase migrations

Snapshot of the live project `ttxestvncdynsssmjqhk`.
Every file is idempotent (`if not exists` / `create or replace` / `drop policy if exists`), so re-running on an already-migrated database is a no-op.

## Run order

Run from top to bottom on a fresh project. Each later file assumes the earlier ones are already applied.

1. `setup.sql` — base tables (`profiles`, `listings`, `conversations`, `messages`, `listing_likes`), `handle_new_user` trigger on `auth.users`, storage buckets `listing-images` + `avatars` with RLS.
2. `profile_features.sql` — extra `profiles` columns (`vacation_mode`, `bundle_discount_pct`, `is_verified`, `is_pro`, `expo_push_token`), `shipping_addresses`, `payout_methods`, `verifications`, `account_deletion_requests`, trust-field guards.
3. `chat_offers.sql` — `messages.kind`/`metadata`/`offer_status`/`updated_at`, `conversations.last_sender_id`, offer-status validation trigger, conversation bump trigger, realtime publication wiring.
4. `listing_price_history.sql` — price-change log table + trigger.
5. `follows.sql` — `user_follows` table, denormalized counters on `profiles`, atomic `toggle_follow` + `get_follow_state` RPCs.
6. `saved_searches.sql` — `saved_searches` table, `saved_search_new_matches(uuid)` RPC, `set_updated_at` shared trigger.
7. `listings_tags.sql` — `listings.tags` array + GIN index, `pg_trgm` extension + title index, `find_seller_other_listings` and `find_similar_listings` RPCs.
8. `save_lists.sql` — Pinterest-style `save_lists` + `save_list_items` + `ensure_save_lists(uuid)` seeding RPC.
9. `perf_cleanup.sql` — partial indexes for the active feed hot paths, policy rewrites that wrap `auth.uid()` in `(select …)` so it's evaluated once per query.
10. `upsert_shipping_address.sql` — hardened upsert RPC for shipping addresses (derives owner from `auth.uid()`, locked search path, ordered to dodge the partial-unique-index collision).

## Conventions

- **No destructive operations.** No file drops a table or column; the worst they do is `drop policy if exists` followed by an immediate replacement.
- **Strict 3-color palette is enforced in app code, not SQL.** Don't add palette constraints here.
- **SECURITY DEFINER functions** lock `search_path` and either revoke `execute` from `public` / `anon` / `authenticated` (triggers, internal helpers) or explicitly `grant execute` to the role that should call them (RPCs).
- **`pg_trgm` lives in `public`** (legacy). Moving it to `extensions` is a separate cleanup.
