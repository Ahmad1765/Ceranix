-- Migration: ensure upsert_shipping_address_with_default RPC is defined
-- Resolves ON CONFLICT specification errors when saving shipping addresses
-- by coordinating default flag clearing and atomic insert/update.

create or replace function public.upsert_shipping_address_with_default(p_payload jsonb)
returns public.shipping_addresses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address public.shipping_addresses;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  update public.shipping_addresses
     set is_default = false
   where user_id = v_user_id
     and is_default = true
     and (v_id is null or id <> v_id);

  if v_id is not null then
    update public.shipping_addresses
       set recipient_name = p_payload->>'recipient_name',
           line1          = p_payload->>'line1',
           line2          = p_payload->>'line2',
           city           = p_payload->>'city',
           state          = p_payload->>'state',
           postal_code    = p_payload->>'postal_code',
           country        = p_payload->>'country',
           phone          = p_payload->>'phone',
           is_default     = true
     where id = v_id and user_id = v_user_id
    returning * into v_address;

    if v_address.id is null then
      raise exception 'address not found or not owned by caller';
    end if;
  else
    insert into public.shipping_addresses (
      user_id, recipient_name, line1, line2, city, state, postal_code, country, phone, is_default
    ) values (
      v_user_id,
      p_payload->>'recipient_name',
      p_payload->>'line1',
      p_payload->>'line2',
      p_payload->>'city',
      p_payload->>'state',
      p_payload->>'postal_code',
      p_payload->>'country',
      p_payload->>'phone',
      true
    )
    returning * into v_address;
  end if;

  return v_address;
end;
$$;

revoke execute on function public.upsert_shipping_address_with_default(jsonb) from public, anon;
grant  execute on function public.upsert_shipping_address_with_default(jsonb) to authenticated;
