-- =============================================================================
-- Migration: 20260929210000_foolproof_lifecycle_and_escrow_fixes.sql
-- Description: Foolproof Escrow, Fulfillment, Receipt Confirmation & State Sync
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RPC: confirm_order_received (Permits Active Delivery States & Syncs Escrow)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.confirm_order_received(
  p_order_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
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

  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;

  -- Allow confirmation from any active fulfillment or paid/pending state
  if v_order.status not in ('paid', 'packing', 'shifting', 'delivered', 'pending')
     and v_order.fulfillment_status not in ('pending', 'packing', 'shifting', 'delivered') then
    raise exception 'Order cannot be confirmed from current status: %', v_order.status using errcode = '22000';
  end if;

  update public.orders
     set status = 'completed',
         fulfillment_status = 'completed',
         escrow_status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         completed_at = coalesce(completed_at, v_now),
         cod_paid_at = case when payment_method = 'cod' then coalesce(cod_paid_at, v_now) else cod_paid_at end,
         payment_status = case when payment_method = 'cod' then 'paid' else payment_status end
   where id = p_order_id
  returning * into v_order;

  -- Sync formal escrow transactions ledger
  update public.transactions
     set status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         funds_released_at = coalesce(funds_released_at, v_now),
         updated_at = v_now
   where order_id = p_order_id
     and status in ('PENDING_PAYMENT', 'PAYMENT_SECURED_ESCROW', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED');

  -- Record audit log in transaction_event_logs if transaction exists
  insert into public.transaction_event_logs (
    transaction_id,
    order_id,
    from_status,
    to_status,
    actor_id,
    action,
    notes,
    metadata
  )
  select
    t.id,
    p_order_id,
    'IN_TRANSIT',
    'COMPLETED_FUNDS_RELEASED',
    v_buyer_id,
    'BUYER_CONFIRM_RECEIPT',
    'Buyer confirmed delivery and released escrow funds',
    jsonb_build_object('confirmed_at', v_now)
  from public.transactions t
  where t.order_id = p_order_id;

  -- Post delivery confirmation message into conversation
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
      'Order Completed! 🎉 The buyer has confirmed delivery and released payment to the seller.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'completed',
        'fulfillment_status', 'completed',
        'completed_at', v_now
      )
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.confirm_order_received(uuid) from public, anon;
grant execute on function public.confirm_order_received(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC: advance_escrow_status (Supports IN_TRANSIT -> COMPLETED_FUNDS_RELEASED)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.advance_escrow_status(
  p_order_id uuid,
  p_target_status text,
  p_notes text default null,
  p_courier text default null,
  p_tracking_number text default null,
  p_dispute_reason text default null,
  p_cancel_reason text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_is_admin boolean := false;
  v_tx public.transactions;
  v_order public.orders;
  v_valid_transition boolean := false;
  v_conv_id uuid;
  v_system_msg text;
  v_now timestamptz := clock_timestamp();
begin
  -- 1. Authentication check
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(is_admin, false) into v_is_admin
    from public.profiles where id = v_caller_id;

  -- 2. Lock Transaction & Order Rows atomically
  select * into v_tx
    from public.transactions
   where order_id = p_order_id
     for update;

  if not found then
    raise exception 'Transaction not found for order %', p_order_id using errcode = 'P0002';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  -- 3. State Machine Transition Guardrails
  if v_tx.status = 'PENDING_PAYMENT' and p_target_status in ('PAYMENT_SECURED_ESCROW', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'PAYMENT_SECURED_ESCROW' and p_target_status in ('READY_FOR_PICKUP', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'READY_FOR_PICKUP' and p_target_status in ('IN_TRANSIT', 'CANCELLED') then
    v_valid_transition := true;
  elsif v_tx.status = 'IN_TRANSIT' and p_target_status in ('DELIVERED', 'DISPUTED', 'COMPLETED_FUNDS_RELEASED') then
    v_valid_transition := true;
  elsif v_tx.status = 'DELIVERED' and p_target_status in ('COMPLETED_FUNDS_RELEASED', 'DISPUTED') then
    v_valid_transition := true;
  elsif v_tx.status = 'DISPUTED' and p_target_status in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED') then
    v_valid_transition := true;
  end if;

  if not v_valid_transition then
    raise exception 'Illegal escrow state transition from % to %', v_tx.status, p_target_status using errcode = '22000';
  end if;

  -- 4. Actor Permission Enforcement
  if p_target_status = 'READY_FOR_PICKUP' then
    if v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Only seller or logistics admin can mark item ready for pickup' using errcode = '42501';
    end if;
  elsif p_target_status in ('IN_TRANSIT', 'DELIVERED') then
    if not v_is_admin and v_caller_id <> v_tx.seller_id then
      raise exception 'Only logistics operations, seller, or admins can advance shipment to %', p_target_status using errcode = '42501';
    end if;
  elsif p_target_status = 'COMPLETED_FUNDS_RELEASED' then
    if v_caller_id <> v_tx.buyer_id and not v_is_admin then
      raise exception 'Only buyer or platform admin can release escrow funds' using errcode = '42501';
    end if;
  elsif p_target_status = 'DISPUTED' then
    if v_caller_id <> v_tx.buyer_id and v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Only transaction participants or admin can open a dispute' using errcode = '42501';
    end if;
  elsif p_target_status = 'CANCELLED' then
    if v_tx.status = 'DISPUTED' and not v_is_admin then
      raise exception 'Only platform admin can cancel and refund a disputed order' using errcode = '42501';
    elsif v_caller_id <> v_tx.buyer_id and v_caller_id <> v_tx.seller_id and not v_is_admin then
      raise exception 'Unauthorized to cancel this transaction' using errcode = '42501';
    end if;
  end if;

  -- 5. Update Transaction Record & Timestamps
  update public.transactions
     set status = p_target_status,
         escrow_secured_at = case when p_target_status = 'PAYMENT_SECURED_ESCROW' then coalesce(escrow_secured_at, v_now) else escrow_secured_at end,
         ready_for_pickup_at = case when p_target_status = 'READY_FOR_PICKUP' then coalesce(ready_for_pickup_at, v_now) else ready_for_pickup_at end,
         picked_up_at = case when p_target_status = 'IN_TRANSIT' then coalesce(picked_up_at, v_now) else picked_up_at end,
         delivered_at = case when p_target_status in ('DELIVERED', 'COMPLETED_FUNDS_RELEASED') then coalesce(delivered_at, v_now) else delivered_at end,
         funds_released_at = case when p_target_status = 'COMPLETED_FUNDS_RELEASED' then coalesce(funds_released_at, v_now) else funds_released_at end,
         disputed_at = case when p_target_status = 'DISPUTED' then coalesce(disputed_at, v_now) else disputed_at end,
         cancelled_at = case when p_target_status = 'CANCELLED' then coalesce(cancelled_at, v_now) else cancelled_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         dispute_reason = coalesce(p_dispute_reason, dispute_reason),
         cancel_reason = coalesce(p_cancel_reason, cancel_reason),
         logistics_notes = coalesce(p_notes, logistics_notes),
         logistics_agent_id = case when p_target_status in ('IN_TRANSIT', 'DELIVERED') then v_caller_id else logistics_agent_id end,
         updated_at = v_now
   where id = v_tx.id
  returning * into v_tx;

  -- 6. Insert Immutable Audit Log
  insert into public.transaction_event_logs (
    transaction_id,
    order_id,
    from_status,
    to_status,
    actor_id,
    action,
    notes,
    metadata
  ) values (
    v_tx.id,
    p_order_id,
    v_order.escrow_status,
    p_target_status,
    v_caller_id,
    'STATE_ADVANCE',
    p_notes,
    jsonb_build_object(
      'courier', p_courier,
      'tracking_number', p_tracking_number,
      'dispute_reason', p_dispute_reason,
      'cancel_reason', p_cancel_reason
    )
  );

  -- 7. Sync with public.orders
  update public.orders
     set escrow_status = p_target_status,
         fulfillment_status = case
           when p_target_status = 'READY_FOR_PICKUP' then 'packing'
           when p_target_status = 'IN_TRANSIT' then 'shifting'
           when p_target_status = 'DELIVERED' then 'delivered'
           when p_target_status = 'COMPLETED_FUNDS_RELEASED' then 'completed'
           when p_target_status = 'DISPUTED' then 'disputed'
           when p_target_status = 'CANCELLED' then 'canceled'
           else fulfillment_status
         end,
         status = case
           when p_target_status = 'COMPLETED_FUNDS_RELEASED' then 'completed'
           when p_target_status = 'CANCELLED' then 'canceled'
           when p_target_status = 'DISPUTED' then 'disputed'
           when p_target_status = 'PAYMENT_SECURED_ESCROW' and status in ('awaiting_payment', 'pending') then 'paid'
           else status
         end,
         packed_at = case when p_target_status = 'READY_FOR_PICKUP' then coalesce(packed_at, v_now) else packed_at end,
         shifted_at = case when p_target_status = 'IN_TRANSIT' then coalesce(shifted_at, v_now) else shifted_at end,
         shipped_at = case when p_target_status = 'IN_TRANSIT' then coalesce(shipped_at, v_now) else shipped_at end,
         delivered_at = case when p_target_status in ('DELIVERED', 'COMPLETED_FUNDS_RELEASED') then coalesce(delivered_at, v_now) else delivered_at end,
         completed_at = case when p_target_status = 'COMPLETED_FUNDS_RELEASED' then coalesce(completed_at, v_now) else completed_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number)
   where id = p_order_id;

  -- 8. Post real-time audit notice into buyer/seller chat conversation thread
  select id
    into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    v_system_msg := case
      when p_target_status = 'PAYMENT_SECURED_ESCROW' then 'Escrow Secured! 🔒 Payment held safely. Order ready for seller fulfillment.'
      when p_target_status = 'READY_FOR_PICKUP' then 'Package Ready! 📦 Seller confirmed item availability. Pickup scheduled.'
      when p_target_status = 'IN_TRANSIT' then 'Package In Transit! 🚚 Shipping courier is en route to buyer.'
      when p_target_status = 'DELIVERED' then 'Package Delivered! 📬 Buyer has 48 hours to inspect item condition.'
      when p_target_status = 'COMPLETED_FUNDS_RELEASED' then 'Escrow Released! 💰 Buyer confirmed receipt. Payout dispatched to seller.'
      when p_target_status = 'DISPUTED' then 'Order Disputed ⚠️ Escrow hold frozen pending operations arbitration.'
      when p_target_status = 'CANCELLED' then 'Order Cancelled 🚫 Escrow payment refunded.'
      else null
    end;

    if v_system_msg is not null then
      insert into public.messages (
        conversation_id,
        sender_id,
        content,
        kind,
        metadata
      ) values (
        v_conv_id,
        v_caller_id,
        v_system_msg,
        'system',
        jsonb_build_object(
          'order_id', p_order_id,
          'escrow_status', p_target_status,
          'courier', p_courier,
          'tracking_number', p_tracking_number,
          'updated_at', v_now
        )
      );
    end if;
  end if;

  return v_tx;
end;
$$;

revoke execute on function public.advance_escrow_status(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.advance_escrow_status(uuid, text, text, text, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: advance_order_fulfillment (Syncs with transactions ledger)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.advance_order_fulfillment(
  p_order_id uuid,
  p_target_status text,
  p_courier text default null,
  p_tracking_number text default null,
  p_supplier_order_id text default null,
  p_supplier_name text default null,
  p_seller_pickup_address jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_system_msg text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_is_admin := coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if p_target_status in ('packing', 'shifting') then
    if v_caller_id <> v_order.seller_id and not v_is_admin then
      raise exception 'Only the verified seller or admin may advance fulfillment to %', p_target_status using errcode = '42501';
    end if;
  elsif p_target_status in ('delivered', 'completed') then
    if v_caller_id <> v_order.buyer_id and not v_is_admin then
      raise exception 'Only the verified buyer or admin may confirm delivery or completion' using errcode = '42501';
    end if;
  else
    raise exception 'Invalid target fulfillment status: %', p_target_status using errcode = '22000';
  end if;

  if p_target_status = 'packing' then
    if v_order.fulfillment_status <> 'pending' then
      raise exception 'Cannot advance to packing from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'shifting' then
    if v_order.fulfillment_status not in ('pending', 'packing') then
      raise exception 'Cannot advance to shifting from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'delivered' then
    if v_order.fulfillment_status not in ('packing', 'shifting') then
      raise exception 'Cannot mark delivered from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'completed' then
    if v_order.fulfillment_status not in ('delivered', 'shifting') then
      raise exception 'Cannot complete order from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  end if;

  update public.orders
     set fulfillment_status = p_target_status,
         status = case
           when p_target_status = 'completed' then 'completed'
           when p_target_status = 'shifting' and status = 'pending' then 'paid'
           else status
         end,
         escrow_status = case
           when p_target_status = 'packing' then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else escrow_status
         end,
         packed_at = case when p_target_status = 'packing' then coalesce(packed_at, v_now) else packed_at end,
         shifted_at = case when p_target_status = 'shifting' then coalesce(shifted_at, v_now) else shifted_at end,
         shipped_at = case when p_target_status = 'shifting' then coalesce(shipped_at, v_now) else shipped_at end,
         delivered_at = case when p_target_status in ('delivered', 'completed') then coalesce(delivered_at, v_now) else delivered_at end,
         completed_at = case when p_target_status = 'completed' then coalesce(completed_at, v_now) else completed_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         supplier_order_id = coalesce(p_supplier_order_id, supplier_order_id),
         supplier_name = coalesce(p_supplier_name, supplier_name)
   where id = p_order_id
  returning * into v_order;

  if p_seller_pickup_address is not null then
    insert into public.order_seller_pickups (order_id, seller_id, pickup_address)
    values (p_order_id, v_order.seller_id, p_seller_pickup_address)
    on conflict (order_id) do update
      set pickup_address = excluded.pickup_address,
          updated_at = v_now;
  end if;

  -- Synchronize public.transactions row
  update public.transactions
     set status = case
           when p_target_status = 'packing' then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else status
         end,
         ready_for_pickup_at = case when p_target_status = 'packing' then coalesce(ready_for_pickup_at, v_now) else ready_for_pickup_at end,
         picked_up_at = case when p_target_status = 'shifting' then coalesce(picked_up_at, v_now) else picked_up_at end,
         delivered_at = case when p_target_status in ('delivered', 'completed') then coalesce(delivered_at, v_now) else delivered_at end,
         funds_released_at = case when p_target_status = 'completed' then coalesce(funds_released_at, v_now) else funds_released_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         updated_at = v_now
   where order_id = p_order_id;

  -- Real-time conversation message
  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    v_system_msg := case
      when p_target_status = 'packing' then 'Seller has begun packing! 📦 Pickup scheduled.'
      when p_target_status = 'shifting' then 'Package Shifting / Dispatched! 🚚' ||
        case when v_order.courier_name is not null then E'\nCourier: ' || v_order.courier_name else '' end ||
        case when v_order.tracking_number is not null and length(trim(v_order.tracking_number)) > 0 then E'\nTracking #: ' || v_order.tracking_number else '' end
      when p_target_status = 'delivered' then 'Package Delivered! 📬 Please inspect your item within 48 hours.'
      when p_target_status = 'completed' then 'Order Completed! 🎉 Buyer confirmed receipt and condition.'
      else null
    end;

    if v_system_msg is not null then
      insert into public.messages (
        conversation_id, sender_id, content, kind, metadata
      ) values (
        v_conv_id, v_caller_id, v_system_msg, 'system',
        jsonb_build_object(
          'order_id', p_order_id,
          'fulfillment_status', p_target_status,
          'courier', v_order.courier_name,
          'tracking_number', v_order.tracking_number,
          'updated_at', v_now
        )
      );
    end if;
  end if;

  return v_order;
end;
$$;

revoke execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.advance_order_fulfillment(uuid, text, text, text, text, text, jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: mark_order_shipped (Sets fulfillment_status and in_transit escrow)
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_seller_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_seller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.seller_id <> v_seller_id then
    raise exception 'Only the seller can mark this order as shipped' using errcode = '42501';
  end if;

  if v_order.shipped_at is not null and v_order.fulfillment_status = 'shifting' then
    return v_order;
  end if;

  if v_order.status in ('refund_due', 'refunded', 'failed', 'completed', 'canceled') then
    raise exception 'Cannot ship order with status: %', v_order.status using errcode = '22000';
  end if;

  update public.orders
     set courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         shipped_at = coalesce(shipped_at, v_now),
         shifted_at = coalesce(shifted_at, v_now),
         fulfillment_status = 'shifting',
         status = case when status in ('pending', 'paid', 'packing') then 'shifting' else status end,
         escrow_status = 'IN_TRANSIT'
   where id = p_order_id
  returning * into v_order;

  update public.transactions
     set status = 'IN_TRANSIT',
         picked_up_at = coalesce(picked_up_at, v_now),
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         updated_at = v_now
   where order_id = p_order_id
     and status in ('PENDING_PAYMENT', 'PAYMENT_SECURED_ESCROW', 'READY_FOR_PICKUP');

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    ) values (
      v_conv_id, v_seller_id,
      'Package Shipped! 📦' ||
      case when p_courier is not null then E'\nCourier: ' || p_courier else '' end ||
      case when p_tracking_number is not null and length(trim(p_tracking_number)) > 0 then E'\nTracking #: ' || p_tracking_number else '' end,
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'courier', p_courier,
        'tracking_number', p_tracking_number,
        'shipped_at', v_now
      )
    );
  end if;

  return v_order;
end;
$$;

revoke execute on function public.mark_order_shipped(uuid, text, text) from public, anon;
grant execute on function public.mark_order_shipped(uuid, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: cancel_order (Cancels fulfillment and escrow hold)
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_caller_role text;
  v_target_status text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.buyer_id <> v_caller_id and v_order.seller_id <> v_caller_id then
    raise exception 'Only the buyer or seller can cancel this order' using errcode = '42501';
  end if;

  if v_order.status in ('completed', 'refunded', 'canceled', 'refund_due') then
    raise exception 'Order is already %', v_order.status using errcode = '22000';
  end if;

  if v_order.shipped_at is not null or v_order.fulfillment_status in ('shifting', 'delivered', 'completed') then
    raise exception 'Cannot cancel an order that has already been shipped or delivered' using errcode = '22000';
  end if;

  v_caller_role := case when v_caller_id = v_order.buyer_id then 'Buyer' else 'Seller' end;
  v_target_status := case when v_order.status = 'paid' then 'refund_due' else 'canceled' end;

  update public.orders
     set status = v_target_status,
         fulfillment_status = 'canceled',
         escrow_status = 'CANCELLED',
         cancel_reason = p_reason,
         cancelled_by = v_caller_id
   where id = p_order_id
  returning * into v_order;

  -- Relist the item so others can buy
  if v_order.listing_id is not null then
    update public.listings
       set is_sold = false
     where id = v_order.listing_id;
  end if;

  -- Cancel escrow transaction hold
  update public.transactions
     set status = 'CANCELLED',
         cancelled_at = coalesce(cancelled_at, v_now),
         cancel_reason = coalesce(p_reason, cancel_reason),
         cancelled_by = v_caller_id,
         updated_at = v_now
   where order_id = p_order_id
     and status not in ('COMPLETED_FUNDS_RELEASED', 'CANCELLED');

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    ) values (
      v_conv_id, v_caller_id,
      'Order cancelled by ' || v_caller_role || E'\nReason: ' || coalesce(p_reason, 'No reason specified') ||
      case when v_target_status = 'canceled' then E'\nThe item is now available again.' else '' end,
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

revoke execute on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;
