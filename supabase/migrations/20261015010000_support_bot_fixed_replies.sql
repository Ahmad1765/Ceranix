-- ─────────────────────────────────────────────────────────────────────────────
-- Support bot can no longer be made to say arbitrary text.
--
-- dispatch_support_bot_reply used to insert whatever p_content the client sent,
-- as the official "Grabsty Support" account. Any user could make the bot post
-- e.g. "Refund approved" in their own support chat and screenshot it.
--
-- Now the bot only posts texts stored in public.support_bot_replies (seeded from
-- lib/supportReplies.ts; lib/supportReplies.test.ts fails if they drift). The
-- RPC signature is unchanged, so already-installed app versions keep working:
-- they send exactly these texts.
--
-- Dispute notices are built server-side by post_dispute_support_notice from the
-- order's own stored dispute reason. (The client used to insert that notice as
-- the bot directly, which RLS always rejected, so it never appeared.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.support_bot_replies (
  key text primary key,
  content text not null unique
);

-- Read only through the SECURITY DEFINER functions below.
alter table public.support_bot_replies enable row level security;
revoke all on table public.support_bot_replies from anon, authenticated;

insert into public.support_bot_replies (key, content) values
  (E'welcome', E'👋 Welcome to Grabsty Support!\n\nHow can we assist you today? Feel free to ask about your orders, Buyer Protection, payments, or selling on Grabsty.'),
  (E'default', E'👋 **Hi there! I\'m the Grabsty Support Assistant.**\n\nThank you for reaching out. Here are the most common things I can assist you with right away:\n\n• **"Track my order"** — Live status, courier info and delivery estimates\n• **"Buyer Protection"** — Refunds, damaged items & safety policies\n• **"Seller Payouts"** — Bank, JazzCash, Easypaisa withdrawal timelines\n• **"Shipping Guide"** — Packaging, labels & drop-off points\n\nPlease type your question or specify what you need help with, and our team will ensure you\'re taken care of!'),
  (E'order_tracking_delivery', E'📦 **Tracking Your Order**\n\n1. Head to your **Profile** > **My Orders**.\n2. Tap on your active order to view live courier status, tracking number, and estimated delivery date.\n3. Sellers have up to **5 business days** to dispatch. Once shipped, standard delivery takes 2–4 business days across Pakistan.\n\nNeed help with a delayed parcel? Feel free to reply with your order details.'),
  (E'buyer_protection_guarantee', E'🛡️ **Grabsty Buyer Protection**\n\nEvery transaction processed through Grabsty is 100% protected:\n\n• **Safe Escrow**: We hold your payment securely until you receive and inspect your parcel.\n• **48-Hour Inspection Window**: You have 2 days from delivery to verify your item. If it’s damaged or not as described, tap "I have an issue" to pause payout.\n• **Full Refund Guarantee**: If an item never arrives or is counterfeit, you get a full refund including shipping fees.'),
  (E'seller_payouts_wallet', E'💳 **Seller Payouts**\n\n• Once the buyer confirms delivery (or 48h after courier delivery), funds are released to your **Grabsty Balance**.\n• You can instantly withdraw to any Pakistani Bank Account, JazzCash, or Easypaisa.\n• Withdrawals are processed within 24 business hours with zero hidden deduction fees.'),
  (E'bundles_combined_shipping', E'🛍️ **Bundle Discounts & Combined Shipping**\n\n• You can bundle up to 10 items from the same seller to save on shipping fees.\n• Tap **Shop Bundle** on any listing to add more pieces from that seller\'s closet.\n• You can send a single bundle offer with your desired total price!'),
  (E'safety_reporting', E'🚫 **Safety & Reporting Policy**\n\n• Grabsty maintains a zero-tolerance policy against scams, replicas, and harassment.\n• Tap the **•••** menu at the top right of any chat or listing to report.\n• Our moderation team reviews all reports within 2 hours. Never transfer money outside the Grabsty checkout system.'),
  (E'offers_negotiations', E'🤝 **Making & Countering Offers**\n\n• Buyers can offer up to 25 times per day to keep closet discussions active.\n• When a seller accepts your offer, you have 24 hours to complete checkout before the item is unlocked for other buyers.\n• Sellers can accept, decline, or counter with their preferred price directly in chat.')
on conflict (key) do update set content = excluded.content;

-- App builds from before the Ceranix → Grabsty rename send the same replies
-- with the old name. Keep those builds' bot working by allowing the exact texts
-- they have already posted (no-op on a fresh database).
insert into public.support_bot_replies (key, content)
select distinct 'legacy_' || md5(content), content
  from public.messages
 where sender_id = '00000000-0000-0000-0000-000000000001'
   and content like '%Ceranix%'
on conflict do nothing;

create or replace function public.dispatch_support_bot_reply(p_conversation_id uuid, p_content text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_conv public.conversations;
  v_msg public.messages;
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_caller_id and v_conv.seller_id <> v_caller_id then
    raise exception 'Not authorized to request support reply in this conversation' using errcode = '42501';
  end if;

  if v_conv.buyer_id <> v_bot_id and v_conv.seller_id <> v_bot_id then
    raise exception 'Target conversation is not a support conversation' using errcode = '22000';
  end if;

  if not exists (select 1 from public.support_bot_replies where content = p_content) then
    raise exception 'Support bot can only send its built-in replies' using errcode = '42501';
  end if;

  insert into public.messages (
    conversation_id, sender_id, content, kind, created_at
  ) values (
    p_conversation_id, v_bot_id, p_content, 'text', now()
  )
  returning * into v_msg;

  update public.conversations set updated_at = now() where id = p_conversation_id;
  return v_msg;
end;
$$;

revoke all on function public.dispatch_support_bot_reply(uuid, text) from public, anon;
grant execute on function public.dispatch_support_bot_reply(uuid, text) to authenticated, service_role;

create or replace function public.post_dispute_support_notice(p_order_id uuid)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_msg public.messages;
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_ref text;
  v_reason text;
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.buyer_id <> v_caller_id then
    raise exception 'Only the buyer can open a support ticket for this order' using errcode = '42501';
  end if;

  if v_order.status <> 'disputed' and v_order.fulfillment_status <> 'disputed' then
    raise exception 'This order is not under dispute' using errcode = '22000';
  end if;

  select id into v_conv_id
    from public.conversations
   where listing_id is null
     and ((buyer_id = v_caller_id and seller_id = v_bot_id) or (buyer_id = v_bot_id and seller_id = v_caller_id))
   order by updated_at desc
   limit 1;
  if v_conv_id is null then
    raise exception 'Support conversation not found' using errcode = 'P0002';
  end if;

  -- One notice per order.
  select * into v_msg
    from public.messages
   where conversation_id = v_conv_id
     and sender_id = v_bot_id
     and metadata->>'dispute_order_id' = p_order_id::text
   limit 1;
  if found then
    return v_msg;
  end if;

  v_ref := upper(left(replace(p_order_id::text, '-', ''), 8));
  v_reason := left(coalesce(nullif(btrim(v_order.dispute_reason), ''), 'Not specified'), 500);

  insert into public.messages (
    conversation_id, sender_id, content, kind, metadata, created_at
  ) values (
    v_conv_id,
    v_bot_id,
    E'🚨 **Support Ticket Opened: Order Dispute**\n\n'
      || 'Order **#' || v_ref || E'** has been placed under dispute.\n'
      || '**Reason:** ' || v_reason || E'\n\n'
      || E'Our administration team has been notified and escrow funds are placed securely on hold. An administrator will review your case and personally respond to you here shortly.\n\n'
      || 'You can reply directly in this chat to provide photo evidence, courier receipts, or additional notes.',
    'text',
    jsonb_build_object('dispute_order_id', p_order_id),
    now()
  )
  returning * into v_msg;

  update public.conversations set updated_at = now() where id = v_conv_id;
  return v_msg;
end;
$$;

revoke all on function public.post_dispute_support_notice(uuid) from public, anon;
grant execute on function public.post_dispute_support_notice(uuid) to authenticated, service_role;
