-- Previous revoke only targeted anon, but Postgres grants EXECUTE to PUBLIC
-- by default and anon inherits from PUBLIC. Revoke from PUBLIC too, then
-- grant back explicitly to the roles that should call each RPC.
revoke execute on function public.ensure_save_lists(uuid) from public, anon;
revoke execute on function public.toggle_follow(uuid) from public, anon;
revoke execute on function public.get_follow_state(uuid) from public, anon;
revoke execute on function public.saved_search_new_matches(uuid) from public, anon;
revoke execute on function public.upsert_shipping_address_with_default(jsonb) from public, anon;

grant execute on function public.ensure_save_lists(uuid) to authenticated, service_role;
grant execute on function public.toggle_follow(uuid) to authenticated, service_role;
grant execute on function public.get_follow_state(uuid) to authenticated, service_role;
grant execute on function public.saved_search_new_matches(uuid) to authenticated, service_role;
grant execute on function public.upsert_shipping_address_with_default(jsonb) to authenticated, service_role;
