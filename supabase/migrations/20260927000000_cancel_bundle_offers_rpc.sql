-- Ceranix: Cancel active bundle offers for sold items server-side.
-- Security definer so it cancels all active offers referencing the sold item
-- regardless of caller RLS visibility across conversations.

create or replace function public.cancel_bundle_offers_for_sold_item(p_sold_listing_id text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canceled_ids text[];
begin
  if p_sold_listing_id is null or p_sold_listing_id = '' then
    return array[]::text[];
  end if;

  select coalesce(array_agg(id::text), array[]::text[])
  into v_canceled_ids
  from public.messages
  where kind = 'offer'
    and offer_status in ('pending', 'proposed')
    and (
      metadata->>'base_listing_id' = p_sold_listing_id
      or metadata->'bundle_item_ids' ? p_sold_listing_id
    );

  if array_length(v_canceled_ids, 1) > 0 then
    update public.messages
    set offer_status = 'canceled',
        updated_at = now()
    where id::text = any(v_canceled_ids);
  end if;

  return v_canceled_ids;
end;
$$;

grant execute on function public.cancel_bundle_offers_for_sold_item(text) to authenticated, anon;
