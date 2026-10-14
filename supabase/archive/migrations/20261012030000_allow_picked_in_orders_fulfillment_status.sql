-- =============================================================================
-- Migration: Allow 'picked' in public.orders fulfillment_status check constraint
-- Fixes: new row for relation "orders" violates check constraint "orders_fulfillment_status_check"
-- =============================================================================

alter table public.orders drop constraint if exists orders_fulfillment_status_check;

alter table public.orders add constraint orders_fulfillment_status_check
  check (fulfillment_status in (
    'awaiting_payment',
    'pending',
    'packing',
    'picked',
    'shifting',
    'delivered',
    'completed',
    'disputed',
    'canceled'
  ));
