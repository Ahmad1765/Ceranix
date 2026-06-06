-- Carrinex — upsert + default-flag management for shipping_addresses.
-- Idempotent: safe to re-run.
--
-- SECURITY:
--   - SECURITY DEFINER with `set search_path = ''` and schema-qualified
--     identifiers to block search-path hijack.
--   - Derives the owner from `auth.uid()`, NOT the caller-supplied payload,
--     so the function cannot be coerced into rewriting another user's row.
--   - Execute revoked from `public`/`anon`; granted to `authenticated`.
--
-- ORDERING:
--   The partial unique index `shipping_addresses_one_default_idx`
--   (UNIQUE user_id WHERE is_default = true) means only one default row per
--   user can exist at any moment. We clear other defaults BEFORE the upsert
--   so the new/updated row doesn't collide with the previous default. The
--   caller's transaction rolls the clear back automatically if the upsert
--   raises.

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
