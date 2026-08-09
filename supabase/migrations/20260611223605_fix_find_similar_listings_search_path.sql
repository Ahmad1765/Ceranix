-- pg_trgm moved from public to the extensions schema (advisor_quick_wins),
-- which broke find_similar_listings: its pinned search_path=public could no
-- longer resolve similarity(). Add extensions to the pinned path.
alter function public.find_similar_listings(uuid, integer)
  set search_path = public, extensions;
