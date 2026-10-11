-- =============================================================================
-- Dual COD Payment Confirmation (Atomic Handshake for Cash on Delivery)
-- Both Buyer and Seller must select "Confirm COD Payment" to finalize the order.
-- =============================================================================

-- 1. Ensure columns exist on public.orders
alter table public.orders
  add column if not exists cod_paid_at timestamptz,
  add column if not exists cod_buyer_confirmed_at timestamptz,
  add column if not exists cod_seller_confirmed_at timestamptz;

-- 2. Drop existing complete_cod_order overloads
drop function if exists public.complete_cod_order(uuid) cascade;
drop function if exists public.complete_cod_order(uuid, text) cascade;

-- 3. Create hardened complete_cod_order supporting dual confirmation handshake
create or replace function public.complete_cod_order(
  p_order_id uuid,
  p_role text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := false;
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
  v_is_buyer boolean := false;
  v_is_seller boolean := false;
begin
  v_is_service_role := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');

  if v_caller_id is null and not v_is_service_role then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_is_admin := v_is_service_role
    or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if v_order.payment_method <> 'cod' then
    raise exception 'Order is not Cash on Delivery' using errcode = '22000';
  end if;

  -- Idempotent return if already completed
  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  if v_order.status in ('canceled', 'refunded') or v_order.fulfillment_status = 'canceled' then
    raise exception 'Order is canceled or refunded and cannot be completed' using errcode = '22000';
  end if;

  -- Verify caller authorization
  v_is_buyer := (v_caller_id = v_order.buyer_id);
  v_is_seller := (v_caller_id = v_order.seller_id);

  if not v_is_admin and not v_is_service_role and not v_is_buyer and not v_is_seller then
    raise exception 'Unauthorized to confirm COD payment for this order' using errcode = '42501';
  end if;

  -- Record confirmation timestamp based on role
  if v_is_admin or v_is_service_role then
    if p_role = 'buyer' then
      v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
    elsif p_role = 'seller' then
      v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
    else
      -- Admin or courier service role confirming full completion
      v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
      v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
    end if;
  else
    if v_is_buyer or p_role = 'buyer' then
      v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
    end if;
    if v_is_seller or p_role = 'seller' then
      v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
    end if;
  end if;

  -- Both buyer and seller must confirm COD payment to finalize the order
  if v_order.cod_buyer_confirmed_at is not null and v_order.cod_seller_confirmed_at is not null then
    update public.orders
       set cod_buyer_confirmed_at = v_order.cod_buyer_confirmed_at,
           cod_seller_confirmed_at = v_order.cod_seller_confirmed_at,
           status = 'completed',
           fulfillment_status = 'completed',
           payment_status = 'paid',
           cod_paid_at = coalesce(cod_paid_at, v_now),
           delivered_at = coalesce(delivered_at, v_now),
           completed_at = coalesce(completed_at, v_now),
           escrow_status = 'COMPLETED_FUNDS_RELEASED'
     where id = p_order_id
    returning * into v_order;

    update public.transactions
       set status = 'COMPLETED_FUNDS_RELEASED',
           delivered_at = coalesce(delivered_at, v_now),
           funds_released_at = coalesce(funds_released_at, v_now),
           updated_at = v_now
     where order_id = p_order_id;

    update public.listings
       set is_sold = true,
           reserved_until = null
     where id = v_order.listing_id;

    select id into v_conv_id
      from public.conversations
     where listing_id = v_order.listing_id
       and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
     limit 1;

    if v_conv_id is not null then
      insert into public.messages (
        conversation_id, sender_id, content, kind, metadata
      ) values (
        v_conv_id, coalesce(v_caller_id, v_order.seller_id), 'Cash on Delivery confirmed by both buyer and seller! 💵 Order completed successfully.', 'system',
        jsonb_build_object(
          'order_id', p_order_id,
          'fulfillment_status', 'completed',
          'status', 'completed',
          'cod_paid_at', v_now,
          'updated_at', v_now
        )
      );
    end if;
  else
    -- Only one party has confirmed so far: persist confirmation timestamp & waiting state
    update public.orders
       set cod_buyer_confirmed_at = v_order.cod_buyer_confirmed_at,
           cod_seller_confirmed_at = v_order.cod_seller_confirmed_at,
           delivered_at = coalesce(delivered_at, v_now)
     where id = p_order_id
    returning * into v_order;

    select id into v_conv_id
      from public.conversations
     where listing_id = v_order.listing_id
       and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
     limit 1;

    if v_conv_id is not null then
      insert into public.messages (
        conversation_id, sender_id, content, kind, metadata
      ) values (
        v_conv_id, coalesce(v_caller_id, v_order.seller_id),
        case
          when v_order.cod_seller_confirmed_at is not null and v_order.cod_buyer_confirmed_at is null then
            'Seller has selected Confirm COD Payment. ⏳ Waiting for buyer to confirm COD payment to finalize.'
          else
            'Buyer has selected Confirm COD Payment. ⏳ Waiting for seller to confirm COD payment to finalize.'
        end,
        'system',
        jsonb_build_object(
          'order_id', p_order_id,
          'cod_seller_confirmed_at', v_order.cod_seller_confirmed_at,
          'cod_buyer_confirmed_at', v_order.cod_buyer_confirmed_at,
          'updated_at', v_now
        )
      );
    end if;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.complete_cod_order(uuid, text) from public, anon;
grant execute on function public.complete_cod_order(uuid, text) to authenticated, service_role;
