-- Security: profiles is publicly readable (SELECT using true), so any column
-- on it is world-visible. expo_push_token would let anyone harvest push tokens
-- and send arbitrary notifications. No code reads or writes it and all rows
-- were null, so drop it. When push notifications are built, store tokens in a
-- private table (e.g. user_devices) with owner-only RLS.
alter table public.profiles drop column if exists expo_push_token;
