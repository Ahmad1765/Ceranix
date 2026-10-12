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
  v_caller uuid := auth.uid();
  v_seller_id uuid;
  v_is_sold boolean;
  v_canceled_ids text[];
begin
  if v_caller is null then
    raise exception 'authenticated caller required';
  end if;

  if p_sold_listing_id is null or p_sold_listing_id = '' then
    return array[]::text[];
  end if;

  -- Verify the listing exists and is marked sold
  select l.seller_id, l.is_sold
  into v_seller_id, v_is_sold
  from public.listings l
  where l.id::text = p_sold_listing_id;

  if not found or v_is_sold is not true then
    return array[]::text[];
  end if;

  -- Require caller to be related to the listing as its seller or buyer
  if v_caller <> v_seller_id and not exists (
    select 1
    from public.orders o
    where o.listing_id::text = p_sold_listing_id
      and o.buyer_id = v_caller
  ) then
    raise exception 'caller is not related to listing';
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

revoke execute on function public.cancel_bundle_offers_for_sold_item(text) from public, anon;
grant execute on function public.cancel_bundle_offers_for_sold_item(text) to authenticated;
