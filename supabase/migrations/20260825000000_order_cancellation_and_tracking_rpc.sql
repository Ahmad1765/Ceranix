-- Migration: Order cancellation, shipment tracking, and order completion RPCs.

-- 1. Extend public.orders table with tracking columns if not present
alter table public.orders
  add column if not exists courier_name text,
  add column if not exists tracking_number text,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists shipped_at timestamptz,
  add column if not exists completed_at timestamptz;

-- 2. Atomic RPC: cancel_order
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default 'Buyer requested cancellation'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_order public.orders;
  v_conv_id uuid;
  v_caller_role text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- 1. Lock order row
  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- 2. Verify caller is buyer or seller
  if v_order.buyer_id <> v_caller_id and v_order.seller_id <> v_caller_id then
    raise exception 'Only the buyer or seller can cancel this order' using errcode = '42501';
  end if;

  if v_order.status in ('completed', 'refunded', 'canceled', 'refund_due') then
    raise exception 'Order is already %', v_order.status using errcode = '22000';
  end if;

  if v_order.shipped_at is not null then
    raise exception 'Cannot cancel an order that has already been shipped' using errcode = '22000';
  end if;

  if v_caller_id = v_order.buyer_id then
    v_caller_role := 'Buyer';
  else
    v_caller_role := 'Seller';
  end if;

  -- 3. Update order status: for paid orders, set to refund_due; for unpaid/pending, set to canceled
  if v_order.status = 'paid' then
    update public.orders
       set status = 'refund_due',
           cancel_reason = p_reason,
           cancelled_by = v_caller_id
     where id = p_order_id
    returning * into v_order;
  else
    update public.orders
       set status = 'canceled',
           cancel_reason = p_reason,
           cancelled_by = v_caller_id
     where id = p_order_id
    returning * into v_order;
  end if;

  -- 4. Re-list the item so it is available again
  if v_order.listing_id is not null then
    update public.listings
       set is_sold = false
     where id = v_order.listing_id;
  end if;

  -- 5. Send cancellation notice in conversation thread
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id,
      sender_id,
      content,
      kind,
      metadata
    ) values (
      v_conv_id,
      v_caller_id,
      'Order cancelled by ' || v_caller_role || E'\nReason: ' || coalesce(p_reason, 'No reason specified') || E'\nThe item is now available again.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', v_order.status,
        'reason', p_reason,
        'cancelled_by_role', v_caller_role
      )
    );
  end if;

  return v_order;
end;
$$;

-- 3. Atomic RPC: mark_order_shipped
create or replace function public.mark_order_shipped(
  p_order_id uuid,
  p_courier text default 'Standard Delivery',
  p_tracking_number text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid;
  v_order public.orders;
  v_conv_id uuid;
begin
  v_seller_id := auth.uid();
  if v_seller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.seller_id <> v_seller_id then
    raise exception 'Only the seller can mark this order as shipped' using errcode = '42501';
  end if;

  if v_order.status = 'canceled' then
    raise exception 'Cannot ship a cancelled order' using errcode = '22000';
  end if;

  update public.orders
     set courier_name = p_courier,
         tracking_number = p_tracking_number,
         shipped_at = now()
   where id = p_order_id
  returning * into v_order;

  -- Send shipping notification in conversation
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id,
      sender_id,
      content,
      kind,
      metadata
    ) values (
      v_conv_id,
      v_seller_id,
      'Package Shipped! 📦' ||
      case when p_courier is not null then E'\nCourier: ' || p_courier else '' end ||
      case when p_tracking_number is not null and length(trim(p_tracking_number)) > 0 then E'\nTracking #: ' || p_tracking_number else '' end,
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'courier', p_courier,
        'tracking_number', p_tracking_number,
        'shipped_at', now()
      )
    );
  end if;

  return v_order;
end;
$$;

-- 4. Atomic RPC: confirm_order_received
create or replace function public.confirm_order_received(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_order public.orders;
  v_conv_id uuid;
begin
  v_buyer_id := auth.uid();
  if v_buyer_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.buyer_id <> v_buyer_id then
    raise exception 'Only the buyer can confirm receipt of this order' using errcode = '42501';
  end if;

  if v_order.status = 'completed' then
    return v_order;
  end if;

  if v_order.status <> 'paid' then
    raise exception 'Order cannot be confirmed from current status: %', v_order.status using errcode = '22000';
  end if;

  update public.orders
     set status = 'completed',
         completed_at = now()
   where id = p_order_id
  returning * into v_order;

  -- Send delivery confirmation in conversation
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id,
      sender_id,
      content,
      kind,
      metadata
    ) values (
      v_conv_id,
      v_buyer_id,
      'Order Completed! 🎉 The buyer has confirmed delivery and everything is OK.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'completed',
        'completed_at', now()
      )
    );
  end if;

  return v_order;
end;
$$;

-- Grant execution to authenticated users
revoke execute on function public.cancel_order(uuid, text) from public, anon;
revoke execute on function public.mark_order_shipped(uuid, text, text) from public, anon;
revoke execute on function public.confirm_order_received(uuid) from public, anon;

grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.mark_order_shipped(uuid, text, text) to authenticated;
grant execute on function public.confirm_order_received(uuid) to authenticated;
