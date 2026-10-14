


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "push";


ALTER SCHEMA "push" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_chat_offer"("p_offer_message_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_caller_id uuid := auth.uid();
  v_offer public.offers;
  v_message public.messages;
  v_conversation public.conversations;
  v_listing public.listings;
  v_amount numeric;
  v_is_admin boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  perform set_config('ceranix.in_accept_offer', 'on', true);
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);
  select * into v_offer
    from public.offers
   where id = p_offer_message_id or message_id = p_offer_message_id
     for update;
  if v_offer.id is null then
    select * into v_message from public.messages where id = p_offer_message_id for update;
    if not found then
      raise exception 'Offer not found' using errcode = 'P0002';
    end if;
    if v_message.kind <> 'offer' then
      raise exception 'Message is not an offer' using errcode = '22000';
    end if;
    select * into v_conversation from public.conversations where id = v_message.conversation_id;
    if not found or v_conversation.listing_id is null then
      raise exception 'Conversation or listing not found' using errcode = 'P0002';
    end if;
    if (v_message.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
      v_amount := (v_message.metadata->>'amount')::numeric;
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Offer has no valid amount' using errcode = '22000';
    end if;
    insert into public.offers (
      id, listing_id, buyer_id, seller_id, amount, status, expires_at,
      conversation_id, message_id, created_at, updated_at
    ) values (
      gen_random_uuid(), v_conversation.listing_id, v_conversation.buyer_id, v_conversation.seller_id,
      v_amount, coalesce(v_message.offer_status, 'pending'),
      coalesce(v_message.created_at, v_now) + interval '24 hours',
      v_conversation.id, v_message.id, coalesce(v_message.created_at, v_now), v_now
    ) returning * into v_offer;
  elsif v_offer.message_id is not null then
    select * into v_message from public.messages where id = v_offer.message_id;
  end if;
  if v_offer.status not in ('pending', 'proposed') then
    raise exception 'Offer is no longer active (current status: %)', v_offer.status using errcode = '22000';
  end if;
  if v_offer.expires_at < v_now then
    update public.offers set status = 'expired', updated_at = v_now where id = v_offer.id;
    raise exception 'Offer has expired' using errcode = '22000';
  end if;
  select * into v_listing from public.listings where id = v_offer.listing_id for update;
  if not found then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  if v_caller_id <> v_offer.buyer_id and v_caller_id <> v_offer.seller_id and not v_is_admin then
    raise exception 'Not authorized to accept an offer in this conversation' using errcode = '42501';
  end if;
  if v_message.id is not null and v_message.sender_id is not null and v_caller_id = v_message.sender_id and not v_is_admin then
    raise exception 'Cannot accept your own offer' using errcode = '22000';
  end if;
  if v_listing.is_sold or exists (
       select 1 from public.listings l
        where l.is_sold
          and l.id::text in (
                select x from jsonb_array_elements_text(
                  case when jsonb_typeof(v_message.metadata->'bundle_item_ids') = 'array'
                       then v_message.metadata->'bundle_item_ids' else '[]'::jsonb end) as x)
     ) then
    raise exception 'Listing has already been sold' using errcode = '23505';
  end if;
  if v_offer.amount > coalesce(public.offer_price_ceiling(v_listing.id, v_message.metadata), v_listing.price)
     and not v_is_admin then
    raise exception 'Offer amount cannot exceed listing price' using errcode = '22000';
  end if;
  update public.offers set status = 'accepted', accepted_at = v_now, updated_at = v_now where id = v_offer.id;
  if v_offer.message_id is not null then
    update public.messages set offer_status = 'accepted', updated_at = v_now where id = v_offer.message_id;
  end if;
  return jsonb_build_object(
    'success', true, 'offer_id', v_offer.id, 'listing_id', v_listing.id,
    'buyer_id', v_offer.buyer_id, 'amount', v_offer.amount, 'status', 'accepted'
  );
end;
$_$;


ALTER FUNCTION "public"."accept_chat_offer"("p_offer_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_support_conversations"("p_filter" "text" DEFAULT 'all'::"text") RETURNS TABLE("id" "uuid", "buyer_id" "uuid", "seller_id" "uuid", "user_id" "uuid", "username" "text", "full_name" "text", "avatar_url" "text", "last_message" "text", "updated_at" timestamp with time zone, "message_count" bigint, "is_dispute" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.buyer_id,
    c.seller_id,
    case when c.buyer_id = v_bot_id then c.seller_id else c.buyer_id end as user_id,
    coalesce(p.username, 'member') as username,
    coalesce(p.full_name, 'Grabsty Member') as full_name,
    p.avatar_url,
    c.last_message,
    c.updated_at,
    coalesce(m.cnt, 0) as message_count,
    coalesce(c.last_message ilike '%dispute%' or exists (
      select 1 from public.messages msg
      where msg.conversation_id = c.id
      and msg.content ilike '%dispute%'
    ), false) as is_dispute
  from public.conversations c
  left join public.profiles p on p.id = (case when c.buyer_id = v_bot_id then c.seller_id else c.buyer_id end)
  left join (
    select conversation_id, count(*) as cnt
    from public.messages
    group by conversation_id
  ) m on m.conversation_id = c.id
  where (c.buyer_id = v_bot_id or c.seller_id = v_bot_id)
    and (
      p_filter = 'all'
      or (p_filter = 'disputes' and (c.last_message ilike '%dispute%' or exists (
        select 1 from public.messages msg where msg.conversation_id = c.id and msg.content ilike '%dispute%'
      )))
      or (p_filter = 'general' and not (c.last_message ilike '%dispute%' or exists (
        select 1 from public.messages msg where msg.conversation_id = c.id and msg.content ilike '%dispute%'
      )))
    )
  order by c.updated_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_get_support_conversations"("p_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_support_messages"("p_conversation_id" "uuid") RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "sender_id" "uuid", "content" "text", "kind" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.kind,
    m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at asc;
end;
$$;


ALTER FUNCTION "public"."admin_get_support_messages"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_users"("p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 100) RETURNS TABLE("id" "uuid", "username" "text", "full_name" "text", "avatar_url" "text", "rating" numeric, "total_sales" integer, "is_verified" boolean, "is_pro" boolean, "is_admin" boolean, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select p.id, p.username, p.full_name, p.avatar_url, p.rating, p.total_sales,
         p.is_verified, p.is_pro, p.is_admin, p.created_at
    from public.profiles p
   where p_search is null
      or length(trim(p_search)) = 0
      or p.username ilike '%' || p_search || '%'
      or p.full_name ilike '%' || p_search || '%'
      or p.id::text ilike '%' || p_search || '%'
   order by p.created_at desc
   limit least(coalesce(p_limit, 100), 200);
end;
$$;


ALTER FUNCTION "public"."admin_get_users"("p_search" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_verifications"("p_status" "text" DEFAULT 'all'::"text") RETURNS TABLE("user_id" "uuid", "status" "text", "legal_name" "text", "document_kind" "text", "document_number_last4" "text", "notes" "text", "submitted_at" timestamp with time zone, "reviewed_at" timestamp with time zone, "username" "text", "avatar_url" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select v.user_id, v.status, v.legal_name, v.document_kind, v.document_number_last4,
         v.notes, v.submitted_at, v.reviewed_at, p.username, p.avatar_url
    from public.verifications v
    left join public.profiles p on p.id = v.user_id
   where p_status = 'all' or v.status = p_status
   order by v.submitted_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_get_verifications"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_kyc"("p_user_id" "uuid", "p_decision" "text", "p_rejection_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: must be approved or rejected' using errcode = '22000';
  end if;

  perform set_config('app.auth_override_verification_status', 'authorized', true);
  update public.verifications
     set status = p_decision,
         notes = coalesce(p_rejection_reason, notes),
         reviewed_at = now()
   where user_id = p_user_id;
  if not found then
    raise exception 'No verification submitted for this user' using errcode = 'P0002';
  end if;
  perform set_config('app.auth_override_verification_status', 'off', true);

  perform set_config('app.auth_override_is_verified', 'authorized', true);
  update public.profiles set is_verified = (p_decision = 'approved') where id = p_user_id;
  perform set_config('app.auth_override_is_verified', 'off', true);
end;
$$;


ALTER FUNCTION "public"."admin_review_kyc"("p_user_id" "uuid", "p_decision" "text", "p_rejection_reason" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "kind" "text" DEFAULT 'text'::"text" NOT NULL,
    "metadata" "jsonb",
    "offer_status" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_offer_id" "uuid",
    CONSTRAINT "messages_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'offer'::"text", 'system'::"text"]))),
    CONSTRAINT "messages_offer_status_check" CHECK (("offer_status" = ANY (ARRAY['proposed'::"text", 'pending'::"text", 'accepted'::"text", 'declined'::"text", 'countered'::"text", 'expired'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_send_support_message"("p_conversation_id" "uuid", "p_content" "text") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bot_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_conv public.conversations;
  v_msg public.messages;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_bot_id and v_conv.seller_id <> v_bot_id then
    raise exception 'Not a support conversation' using errcode = '22000';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    kind,
    created_at
  ) values (
    p_conversation_id,
    v_bot_id,
    p_content,
    'text',
    now()
  )
  returning * into v_msg;

  update public.conversations
     set last_message = p_content,
         updated_at = now()
   where id = p_conversation_id;

  return v_msg;
end;
$$;


ALTER FUNCTION "public"."admin_send_support_message"("p_conversation_id" "uuid", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_toggle_pro_seller"("p_user_id" "uuid", "p_is_pro" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  perform set_config('app.auth_override_is_pro', 'authorized', true);
  update public.profiles set is_pro = p_is_pro where id = p_user_id;
  perform set_config('app.auth_override_is_pro', 'off', true);
end;
$$;


ALTER FUNCTION "public"."admin_toggle_pro_seller"("p_user_id" "uuid", "p_is_pro" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "platform_fee_cents" integer DEFAULT 0 NOT NULL,
    "shipping_fee_cents" integer DEFAULT 0 NOT NULL,
    "payout_amount_cents" integer DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'pkr'::"text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "status" "text" DEFAULT 'PENDING_PAYMENT'::"text" NOT NULL,
    "escrow_secured_at" timestamp with time zone,
    "ready_for_pickup_at" timestamp with time zone,
    "picked_up_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "funds_released_at" timestamp with time zone,
    "disputed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "dispute_reason" "text",
    "dispute_evidence_urls" "text"[] DEFAULT '{}'::"text"[],
    "cancel_reason" "text",
    "cancelled_by" "uuid",
    "courier_name" "text",
    "tracking_number" "text",
    "logistics_notes" "text",
    "logistics_agent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "transactions_escrow_balance_check" CHECK (("amount_cents" = (("platform_fee_cents" + "shipping_fee_cents") + "payout_amount_cents"))),
    CONSTRAINT "transactions_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['card'::"text", 'cod'::"text"]))),
    CONSTRAINT "transactions_payout_amount_cents_check" CHECK (("payout_amount_cents" >= 0)),
    CONSTRAINT "transactions_platform_fee_cents_check" CHECK (("platform_fee_cents" >= 0)),
    CONSTRAINT "transactions_shipping_fee_cents_check" CHECK (("shipping_fee_cents" >= 0)),
    CONSTRAINT "transactions_status_check" CHECK (("status" = ANY (ARRAY['PENDING_PAYMENT'::"text", 'PAYMENT_SECURED_ESCROW'::"text", 'READY_FOR_PICKUP'::"text", 'IN_TRANSIT'::"text", 'DELIVERED'::"text", 'COMPLETED_FUNDS_RELEASED'::"text", 'DISPUTED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_escrow_status"("p_order_id" "uuid", "p_target_status" "text", "p_notes" "text" DEFAULT NULL::"text", "p_courier" "text" DEFAULT NULL::"text", "p_tracking_number" "text" DEFAULT NULL::"text", "p_dispute_reason" "text" DEFAULT NULL::"text", "p_cancel_reason" "text" DEFAULT NULL::"text") RETURNS "public"."transactions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_tx public.transactions;
  v_order public.orders;
  v_valid_transition boolean := false;
  v_conv_id uuid;
  v_system_msg text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(is_admin, false) into v_is_admin
    from public.profiles where id = v_caller_id;

  select * into v_tx from public.transactions where order_id = p_order_id for update;
  if not found then
    raise exception 'Transaction not found for order %', p_order_id using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

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

  insert into public.transaction_event_logs (
    transaction_id, order_id, from_status, to_status,
    actor_id, action, notes, metadata
  ) values (
    v_tx.id, p_order_id, v_order.escrow_status, p_target_status,
    v_caller_id, 'STATE_ADVANCE', p_notes,
    jsonb_build_object(
      'courier', p_courier,
      'tracking_number', p_tracking_number,
      'dispute_reason', p_dispute_reason,
      'cancel_reason', p_cancel_reason
    )
  );

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

  select id into v_conv_id
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
        conversation_id, sender_id, content, kind, metadata
      ) values (
        v_conv_id, v_caller_id, v_system_msg, 'system',
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


ALTER FUNCTION "public"."advance_escrow_status"("p_order_id" "uuid", "p_target_status" "text", "p_notes" "text", "p_courier" "text", "p_tracking_number" "text", "p_dispute_reason" "text", "p_cancel_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'pkr'::"text" NOT NULL,
    "stripe_session_id" "text",
    "stripe_payment_intent" "text",
    "offer_message_id" "uuid",
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fee_cents" integer DEFAULT 0 NOT NULL,
    "payment_method" "text" DEFAULT 'card'::"text" NOT NULL,
    "shipping_address" "jsonb",
    "delivery_notes" "text",
    "courier_name" "text",
    "tracking_number" "text",
    "cancel_reason" "text",
    "cancelled_by" "uuid",
    "shipped_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "fulfillment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "fulfillment_type" "text" DEFAULT 'direct'::"text" NOT NULL,
    "supplier_name" "text",
    "supplier_order_id" "text",
    "dispute_reason" "text",
    "dispute_evidence_urls" "text"[] DEFAULT '{}'::"text"[],
    "disputed_at" timestamp with time zone,
    "dispute_resolved_at" timestamp with time zone,
    "payment_authorized_at" timestamp with time zone,
    "packed_at" timestamp with time zone,
    "shifted_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "carrier_handoff_at" timestamp with time zone,
    "refunded_at" timestamp with time zone,
    "cod_paid_at" timestamp with time zone,
    "tracking_url" "text",
    "buyer_inspection_period_hours" integer DEFAULT 48,
    "shipping_method" "text" DEFAULT 'managed'::"text" NOT NULL,
    "shipping_fee_cents" integer DEFAULT 0 NOT NULL,
    "escrow_status" "text" DEFAULT 'PENDING_PAYMENT'::"text",
    "payout_amount_cents" integer DEFAULT 0,
    "bundle_item_ids" "uuid"[],
    "bundle_count" integer DEFAULT 1,
    "cod_buyer_confirmed_at" timestamp with time zone,
    "cod_seller_confirmed_at" timestamp with time zone,
    CONSTRAINT "orders_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "orders_escrow_status_check" CHECK (("escrow_status" = ANY (ARRAY['PENDING_PAYMENT'::"text", 'PAYMENT_SECURED_ESCROW'::"text", 'READY_FOR_PICKUP'::"text", 'IN_TRANSIT'::"text", 'DELIVERED'::"text", 'COMPLETED_FUNDS_RELEASED'::"text", 'DISPUTED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "orders_fee_cents_check" CHECK (("fee_cents" >= 0)),
    CONSTRAINT "orders_fulfillment_status_check" CHECK (("fulfillment_status" = ANY (ARRAY['awaiting_payment'::"text", 'pending'::"text", 'packing'::"text", 'picked'::"text", 'shifting'::"text", 'delivered'::"text", 'completed'::"text", 'disputed'::"text", 'canceled'::"text"]))),
    CONSTRAINT "orders_fulfillment_type_check" CHECK (("fulfillment_type" = ANY (ARRAY['direct'::"text", 'dropship'::"text"]))),
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['card'::"text", 'cod'::"text"]))),
    CONSTRAINT "orders_shipping_method_check" CHECK (("shipping_method" = ANY (ARRAY['managed'::"text", 'self_ship'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['awaiting_payment'::"text", 'pending'::"text", 'paid'::"text", 'packing'::"text", 'shifting'::"text", 'delivered'::"text", 'completed'::"text", 'disputed'::"text", 'refund_due'::"text", 'refunded'::"text", 'canceled'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."amount_cents" IS 'Item price only, in minor units. Excludes Buyer Protection — see fee_cents.';



COMMENT ON COLUMN "public"."orders"."fee_cents" IS 'Buyer Protection fee in minor units. amount_cents + fee_cents = amount charged.';



CREATE OR REPLACE FUNCTION "public"."advance_order_fulfillment"("p_order_id" "uuid", "p_target_status" "text", "p_courier" "text" DEFAULT NULL::"text", "p_tracking_number" "text" DEFAULT NULL::"text", "p_supplier_order_id" "text" DEFAULT NULL::"text", "p_supplier_name" "text" DEFAULT NULL::"text", "p_seller_pickup_address" "jsonb" DEFAULT NULL::"jsonb") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  if p_target_status in ('packing', 'picked', 'shifting') then
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

  -- Validate state machine progression (permit idempotent calls & awaiting_payment)
  if p_target_status in ('packing', 'picked') then
    if v_order.fulfillment_status not in ('pending', 'awaiting_payment', 'packing', 'picked') then
      raise exception 'Cannot advance to % from %', p_target_status, v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'shifting' then
    if v_order.fulfillment_status not in ('pending', 'awaiting_payment', 'packing', 'picked', 'shifting') then
      raise exception 'Cannot advance to shifting from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'delivered' then
    if v_order.fulfillment_status not in ('packing', 'picked', 'shifting', 'delivered') then
      raise exception 'Cannot mark delivered from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  elsif p_target_status = 'completed' then
    if v_order.fulfillment_status not in ('delivered', 'shifting', 'completed') then
      raise exception 'Cannot complete order from %', v_order.fulfillment_status using errcode = '22000';
    end if;
  end if;

  update public.orders
     set fulfillment_status = p_target_status,
         status = case
           when p_target_status = 'completed' then 'completed'
           -- Only transition card/escrow orders to paid on dispatch; CoD is paid on delivery
           when p_target_status = 'shifting' and status in ('pending', 'awaiting_payment') and coalesce(payment_method, '') <> 'cod' then 'paid'
           else status
         end,
         escrow_status = case
           when p_target_status in ('packing', 'picked') then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else escrow_status
         end,
         packed_at = case when p_target_status in ('packing', 'picked') then coalesce(packed_at, v_now) else packed_at end,
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

  update public.transactions
     set status = case
           when p_target_status in ('packing', 'picked') then 'READY_FOR_PICKUP'
           when p_target_status = 'shifting' then 'IN_TRANSIT'
           when p_target_status = 'delivered' then 'DELIVERED'
           when p_target_status = 'completed' then 'COMPLETED_FUNDS_RELEASED'
           else status
         end,
         ready_for_pickup_at = case when p_target_status in ('packing', 'picked') then coalesce(ready_for_pickup_at, v_now) else ready_for_pickup_at end,
         picked_up_at = case when p_target_status in ('picked', 'shifting') then coalesce(picked_up_at, v_now) else picked_up_at end,
         delivered_at = case when p_target_status in ('delivered', 'completed') then coalesce(delivered_at, v_now) else delivered_at end,
         funds_released_at = case when p_target_status = 'completed' then coalesce(funds_released_at, v_now) else funds_released_at end,
         courier_name = coalesce(p_courier, courier_name),
         tracking_number = coalesce(p_tracking_number, tracking_number),
         updated_at = v_now
   where order_id = p_order_id;

  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;

  if v_conv_id is not null then
    v_system_msg := case
      when p_target_status = 'packing' then 'Seller has begun packing! 📦 Pickup scheduled.'
      when p_target_status = 'picked' then 'Package Picked Up by Courier! 📦 In transit shortly.'
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


ALTER FUNCTION "public"."advance_order_fulfillment"("p_order_id" "uuid", "p_target_status" "text", "p_courier" "text", "p_tracking_number" "text", "p_supplier_order_id" "text", "p_supplier_name" "text", "p_seller_pickup_address" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_complete_delivered_orders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer := 0;
  v_order record;
  v_now timestamptz := clock_timestamp();
begin
  for v_order in
    select id, listing_id, buyer_id, seller_id
      from public.orders
     where fulfillment_status = 'delivered'
       and status not in ('completed', 'canceled', 'refunded', 'disputed')
       and delivered_at is not null
       and delivered_at <= (v_now - interval '48 hours')
       and disputed_at is null
     for update skip locked
  loop
    update public.orders
       set status = 'completed',
           fulfillment_status = 'completed',
           escrow_status = 'COMPLETED_FUNDS_RELEASED',
           completed_at = v_now
     where id = v_order.id;

    update public.transactions
       set status = 'COMPLETED_FUNDS_RELEASED',
           funds_released_at = v_now,
           updated_at = v_now
     where order_id = v_order.id;

    insert into public.messages (
      conversation_id, sender_id, content, kind, metadata
    )
    select c.id, v_order.buyer_id,
      'Order Auto-Completed! ⏱️ The 48-hour inspection period has elapsed with no disputes. Funds have been released to the seller.',
      'system',
      jsonb_build_object(
        'order_id', v_order.id,
        'status', 'completed',
        'fulfillment_status', 'completed',
        'auto_completed', true,
        'completed_at', v_now
      )
    from public.conversations c
    where c.listing_id = v_order.listing_id
      and ((c.buyer_id = v_order.buyer_id and c.seller_id = v_order.seller_id) or (c.buyer_id = v_order.seller_id and c.seller_id = v_order.buyer_id))
    limit 1;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."auto_complete_delivered_orders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_conversation_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  preview text;
begin
  if new.kind = 'offer' then
    preview := 'Offer: Rs ' || coalesce((new.metadata->>'amount'), '?');
  else
    preview := left(new.content, 140);
  end if;
  update public.conversations
    set last_message = preview,
        last_sender_id = new.sender_id,
        updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."bump_conversation_on_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_listing_likes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.listings set likes = coalesce(likes, 0) + 1 where id = new.listing_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.listings set likes = greatest(coalesce(likes, 0) - 1, 0) where id = old.listing_id;
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."bump_listing_likes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_bundle_offers_for_sold_item"("p_sold_listing_id" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."cancel_bundle_offers_for_sold_item"("p_sold_listing_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_reason" "text" DEFAULT 'Buyer requested cancellation'::"text") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if v_order.status in ('completed', 'refunded', 'canceled', 'refund_due', 'failed') then
    raise exception 'Order is already %', v_order.status using errcode = '22000';
  end if;
  if v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then
    raise exception 'This order is under dispute review and cannot be cancelled' using errcode = '22000';
  end if;
  if v_order.shipped_at is not null
     or v_order.fulfillment_status in ('picked', 'shifting', 'delivered', 'completed') then
    raise exception 'Cannot cancel an order that has already been picked up or shipped' using errcode = '22000';
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
  -- Relist every item the order covered (primary + bundle add-ons)
  update public.listings
     set is_sold = false,
         reserved_until = null
   where id = v_order.listing_id
      or id = any(coalesce(v_order.bundle_item_ids, '{}'::uuid[]));
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
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (
      v_conv_id, v_caller_id,
      'Order cancelled by ' || v_caller_role || E'\nReason: ' || coalesce(p_reason, 'No reason specified') ||
      case when v_target_status = 'canceled' then E'\nThe item is now available again.' else '' end,
      'system',
      jsonb_build_object('order_id', p_order_id, 'status', v_order.status,
                         'reason', p_reason, 'cancelled_by_role', v_caller_role)
    );
  end if;
  return v_order;
end;
$$;


ALTER FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_cod_order"("p_order_id" "uuid", "p_role" "text" DEFAULT NULL::"text") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null and not v_is_service_role then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
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
  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;
  if v_order.status in ('canceled', 'refunded', 'refund_due', 'failed', 'disputed')
     or v_order.fulfillment_status in ('canceled', 'disputed') then
    raise exception 'Order is % and cannot be completed', v_order.status using errcode = '22000';
  end if;
  if not v_is_admin then
    if v_caller_id is distinct from v_order.buyer_id and v_caller_id is distinct from v_order.seller_id then
      raise exception 'Unauthorized to confirm COD payment for this order' using errcode = '42501';
    end if;
    if v_order.fulfillment_status not in ('shifting', 'delivered') then
      raise exception 'COD payment can only be confirmed once the order has been dispatched' using errcode = '22000';
    end if;
    -- A participant confirms for themselves only; p_role is honoured for admins alone.
    if v_caller_id = v_order.buyer_id then
      v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
    end if;
    if v_caller_id = v_order.seller_id then
      v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
    end if;
  elsif p_role = 'buyer' then
    v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
  elsif p_role = 'seller' then
    v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
  else
    v_order.cod_buyer_confirmed_at := coalesce(v_order.cod_buyer_confirmed_at, v_now);
    v_order.cod_seller_confirmed_at := coalesce(v_order.cod_seller_confirmed_at, v_now);
  end if;
  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;
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
    if v_conv_id is not null then
      insert into public.messages (conversation_id, sender_id, content, kind, metadata)
      values (
        v_conv_id, coalesce(v_caller_id, v_order.seller_id),
        'Cash on Delivery confirmed by both buyer and seller! 💵 Order completed successfully.', 'system',
        jsonb_build_object('order_id', p_order_id, 'fulfillment_status', 'completed', 'status', 'completed',
                           'cod_paid_at', v_now, 'updated_at', v_now)
      );
    end if;
  else
    update public.orders
       set cod_buyer_confirmed_at = v_order.cod_buyer_confirmed_at,
           cod_seller_confirmed_at = v_order.cod_seller_confirmed_at
     where id = p_order_id
    returning * into v_order;
    if v_conv_id is not null then
      insert into public.messages (conversation_id, sender_id, content, kind, metadata)
      values (
        v_conv_id, coalesce(v_caller_id, v_order.seller_id),
        case
          when v_order.cod_seller_confirmed_at is not null then
            'Seller has selected Confirm COD Payment. ⏳ Waiting for buyer to confirm COD payment to finalize.'
          else
            'Buyer has selected Confirm COD Payment. ⏳ Waiting for seller to confirm COD payment to finalize.'
        end,
        'system',
        jsonb_build_object('order_id', p_order_id,
                           'cod_seller_confirmed_at', v_order.cod_seller_confirmed_at,
                           'cod_buyer_confirmed_at', v_order.cod_buyer_confirmed_at,
                           'updated_at', v_now)
      );
    end if;
  end if;
  return v_order;
end;
$$;


ALTER FUNCTION "public"."complete_cod_order"("p_order_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_order_payment_authorization"("p_order_id" "uuid", "p_stripe_event_id" "text", "p_payment_intent" "text" DEFAULT NULL::"text") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order public.orders;
  v_conv_id uuid;
begin
  -- 1. Idempotency Check: Reject duplicate Stripe webhook dispatches
  if p_stripe_event_id is not null and length(trim(p_stripe_event_id)) > 0 then
    insert into public.processed_webhooks (event_id, event_type)
    values (p_stripe_event_id, 'payment_intent.succeeded')
    on conflict (event_id) do nothing;

    -- If the row was not inserted, the event has already been processed
    if not found then
      select * into v_order from public.orders where id = p_order_id;
      return v_order;
    end if;
  end if;

  -- 2. Lock Order row
  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- If already authorized / paid, exit idempotently
  if v_order.fulfillment_status not in ('awaiting_payment') then
    return v_order;
  end if;

  -- 3. Advance to Pending fulfillment and Paid status
  update public.orders
     set status = 'paid',
         fulfillment_status = 'pending',
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         payment_authorized_at = now()
   where id = p_order_id
  returning * into v_order;

  -- 4. Post system event into conversation
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
      v_order.seller_id,
      'Payment Authorized! 💳 Funds secured in Escrow. Order is now Pending fulfillment.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'pending',
        'fulfillment_status', 'pending',
        'payment_authorized_at', now()
      )
    );
  end if;

  return v_order;
end;
$$;


ALTER FUNCTION "public"."confirm_order_payment_authorization"("p_order_id" "uuid", "p_stripe_event_id" "text", "p_payment_intent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_order_received"("p_order_id" "uuid") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_buyer_id uuid := auth.uid();
  v_order public.orders;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_buyer_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.buyer_id <> v_buyer_id then
    raise exception 'Only the verified buyer can confirm receipt of this order' using errcode = '42501';
  end if;
  if v_order.status = 'completed' and v_order.fulfillment_status = 'completed' then
    return v_order;
  end if;
  if v_order.payment_method = 'cod' then
    raise exception 'Cash on Delivery orders are completed by confirming COD payment' using errcode = '22000';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Cannot confirm receipt of an order that is %', v_order.status using errcode = '22000';
  end if;
  if v_order.fulfillment_status not in ('shifting', 'delivered') then
    raise exception 'Cannot confirm receipt before the order has been dispatched' using errcode = '22000';
  end if;
  update public.orders
     set status = 'completed',
         fulfillment_status = 'completed',
         escrow_status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         completed_at = coalesce(completed_at, v_now)
   where id = p_order_id
  returning * into v_order;
  update public.transactions
     set status = 'COMPLETED_FUNDS_RELEASED',
         delivered_at = coalesce(delivered_at, v_now),
         funds_released_at = coalesce(funds_released_at, v_now),
         updated_at = v_now
   where order_id = p_order_id
     and status in ('PENDING_PAYMENT', 'PAYMENT_SECURED_ESCROW', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED');
  insert into public.transaction_event_logs (
    transaction_id, order_id, from_status, to_status, actor_id, action, notes, metadata
  )
  select t.id, p_order_id, 'IN_TRANSIT', 'COMPLETED_FUNDS_RELEASED', v_buyer_id,
         'BUYER_CONFIRM_RECEIPT', 'Buyer confirmed delivery and released escrow funds',
         jsonb_build_object('confirmed_at', v_now)
    from public.transactions t
   where t.order_id = p_order_id;
  select id into v_conv_id
    from public.conversations
   where listing_id = v_order.listing_id
     and ((buyer_id = v_order.buyer_id and seller_id = v_order.seller_id) or (buyer_id = v_order.seller_id and seller_id = v_order.buyer_id))
   limit 1;
  if v_conv_id is not null then
    insert into public.messages (conversation_id, sender_id, content, kind, metadata)
    values (
      v_conv_id, v_buyer_id, 'Order Completed! 🎉 The buyer has confirmed delivery and released payment to the seller.', 'system',
      jsonb_build_object('order_id', p_order_id, 'status', 'completed',
                         'fulfillment_status', 'completed', 'updated_at', v_now)
    );
  end if;
  return v_order;
end;
$$;


ALTER FUNCTION "public"."confirm_order_received"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."counter_chat_offer"("p_parent_offer_id" "uuid", "p_amount" numeric, "p_note" "text" DEFAULT NULL::"text", "p_content" "text" DEFAULT NULL::"text", "p_conversation_id" "uuid" DEFAULT NULL::"uuid", "p_sender_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_sender_id uuid := auth.uid();
  v_parent public.messages;
  v_conversation public.conversations;
  v_child_msg public.messages;
  v_content text;
  v_amount_val numeric;
  v_now timestamptz := clock_timestamp();
begin
  perform set_config('ceranix.in_counter_offer', 'on', true);
  -- p_sender_id is ignored: the sender is always the authenticated caller.
  if v_sender_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid offer amount' using errcode = '22000';
  end if;
  v_amount_val := round(p_amount, 2);
  select * into v_parent from public.messages where id = p_parent_offer_id for update;
  if not found then
    raise exception 'Parent offer message not found' using errcode = 'P0002';
  end if;
  if v_parent.kind <> 'offer' then
    raise exception 'Target message is not an offer' using errcode = '22000';
  end if;
  if v_parent.offer_status not in ('proposed', 'pending') then
    raise exception 'Offer is no longer active (current status: %)', v_parent.offer_status using errcode = '22000';
  end if;
  select * into v_conversation from public.conversations where id = v_parent.conversation_id;
  if not found then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if p_conversation_id is not null and p_conversation_id <> v_parent.conversation_id then
    raise exception 'Conversation mismatch' using errcode = '22000';
  end if;
  if v_sender_id <> v_conversation.buyer_id and v_sender_id <> v_conversation.seller_id then
    raise exception 'Not authorized to make an offer in this conversation' using errcode = '42501';
  end if;
  if v_sender_id = v_parent.sender_id then
    raise exception 'Cannot counter your own offer' using errcode = '22000';
  end if;
  update public.messages set offer_status = 'countered', updated_at = v_now where id = p_parent_offer_id;
  update public.offers set status = 'countered', updated_at = v_now
   where message_id = p_parent_offer_id or id = p_parent_offer_id;
  v_content := coalesce(
    nullif(trim(p_content), ''),
    nullif(trim(p_note), ''),
    'Counter-Offer: PKR ' || to_char(v_amount_val, 'FM999,999,999.00')
  );
  insert into public.messages (
    conversation_id, sender_id, content, kind, offer_status, parent_offer_id, metadata, created_at, updated_at
  ) values (
    v_conversation.id, v_sender_id, v_content, 'offer', 'pending', p_parent_offer_id,
    jsonb_strip_nulls(jsonb_build_object(
      'amount', v_amount_val,
      'offer_amount', v_amount_val,
      'currency', 'PKR',
      'note', nullif(trim(p_note), ''),
      'parent_offer_id', p_parent_offer_id,
      'counter_to', p_parent_offer_id,
      'is_bundle', v_parent.metadata->'is_bundle',
      'base_listing_id', v_parent.metadata->'base_listing_id',
      'bundle_item_ids', v_parent.metadata->'bundle_item_ids',
      'bundle_count', v_parent.metadata->'bundle_count'
    )),
    v_now, v_now
  ) returning * into v_child_msg;
  update public.conversations set updated_at = v_now where id = v_conversation.id;
  return v_child_msg;
end;
$$;


ALTER FUNCTION "public"."counter_chat_offer"("p_parent_offer_id" "uuid", "p_amount" numeric, "p_note" "text", "p_content" "text", "p_conversation_id" "uuid", "p_sender_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_cod_order"("p_listing_id" "uuid", "p_buyer_id" "uuid" DEFAULT NULL::"uuid", "p_shipping_address" "jsonb" DEFAULT NULL::"jsonb", "p_offer_amount" numeric DEFAULT NULL::numeric, "p_delivery_notes" "text" DEFAULT NULL::"text", "p_shipping_method" "text" DEFAULT 'managed'::"text") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return public.process_checkout(
    p_listing_id => p_listing_id,
    p_buyer_id => p_buyer_id,
    p_payment_method => 'cod',
    p_shipping_address => p_shipping_address,
    p_offer_amount => p_offer_amount,
    p_delivery_notes => p_delivery_notes,
    p_shipping_method => p_shipping_method,
    p_bundle_item_ids => null,
    p_expected_total => null
  );
end;
$$;


ALTER FUNCTION "public"."create_cod_order"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_chat_message"("p_message_id" "uuid", "p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_sender_id uuid;
begin
  select sender_id into v_sender_id
  from public.messages
  where id = p_message_id and conversation_id = p_conversation_id;

  if v_sender_id is null then
    return false;
  end if;

  if v_sender_id <> auth.uid() then
    raise exception 'Unauthorized to delete message';
  end if;

  delete from public.messages
  where id = p_message_id and conversation_id = p_conversation_id;

  return true;
end;
$$;


ALTER FUNCTION "public"."delete_chat_message"("p_message_id" "uuid", "p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_support_bot_reply"("p_conversation_id" "uuid", "p_content" "text") RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."dispatch_support_bot_reply"("p_conversation_id" "uuid", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_rate_limit"("p_action" "text", "p_limit" integer, "p_window" interval) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return;
  end if;

  -- Serialize rate-limit check per user and action to prevent race conditions
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext(p_action));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_uid
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'rate_limit_exceeded'
      using
        errcode = 'P0001',
        message = format('Rate limit reached for %s (max %s per %s).', p_action, p_limit, p_window),
        hint    = 'Please slow down and try again shortly.';
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);
end;
$$;


ALTER FUNCTION "public"."enforce_rate_limit"("p_action" "text", "p_limit" integer, "p_window" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_user_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window" interval) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count int;
begin
  if p_user_id is null then
    return true;
  end if;

  -- Serialize rate-limit check per user and action to prevent concurrency bypass
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_action));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = p_user_id
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'rate_limit_exceeded'
      using
        errcode = 'P0001',
        message = format('Rate limit reached for %s (max %s per %s).', p_action, p_limit, p_window),
        hint    = 'Please slow down and try again shortly.';
  end if;

  insert into public.rate_limit_events (user_id, action) values (p_user_id, p_action);
  return true;
end;
$$;


ALTER FUNCTION "public"."enforce_user_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_save_lists"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- SECURITY DEFINER bypasses RLS; pin the caller so a misbehaving client
  -- can't seed lists on another user's behalf. service_role exempt for
  -- backfill scripts.
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'ensure_save_lists may only seed the caller''s own user_id';
  end if;

  insert into public.save_lists (user_id, name, emoji, is_default)
  select p_user_id, 'Saved', '🔖', true
  where not exists (
    select 1 from public.save_lists where user_id = p_user_id and is_default
  );

  if not exists (
    select 1 from public.save_lists where user_id = p_user_id and not is_default
  ) then
    insert into public.save_lists (user_id, name, emoji)
    values
      (p_user_id, 'Wishlist', '⭐'),
      (p_user_id, 'Gift ideas', '🎁'),
      (p_user_id, 'Saved for later', '🔖');
  end if;
end;
$$;


ALTER FUNCTION "public"."ensure_save_lists"("p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "price" integer NOT NULL,
    "category" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "brand" "text",
    "size" "text",
    "condition" "text" NOT NULL,
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_sold" boolean DEFAULT false,
    "views" integer DEFAULT 0,
    "likes" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subcategory" "text",
    "color" "text",
    "material" "text",
    "parcel_size" "text",
    "thumbnails" "text"[],
    "authenticity" "text",
    "taxonomy_version" integer,
    "reserved_until" timestamp with time zone,
    CONSTRAINT "listings_authenticity_check" CHECK (("authenticity" = ANY (ARRAY['original'::"text", 'replica'::"text", 'inspired'::"text", 'not_sure'::"text"]))),
    CONSTRAINT "listings_category_check" CHECK (("category" = ANY (ARRAY['clothing'::"text", 'shoes'::"text", 'bags'::"text", 'accessories'::"text", 'electronics'::"text", 'beauty'::"text", 'other'::"text"]))),
    CONSTRAINT "listings_condition_check" CHECK (("condition" = ANY (ARRAY['new_with_tags'::"text", 'like_new'::"text", 'good'::"text", 'fair'::"text"]))),
    CONSTRAINT "listings_gender_check" CHECK (("gender" = ANY (ARRAY['all'::"text", 'men'::"text", 'women'::"text", 'unisex'::"text"]))),
    CONSTRAINT "listings_parcel_size_check" CHECK (("parcel_size" = ANY (ARRAY['small'::"text", 'medium'::"text", 'large'::"text"])))
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."listings"."subcategory" IS 'Optional category taxonomy subcategory slug.';



COMMENT ON COLUMN "public"."listings"."color" IS 'Optional color taxonomy slug.';



COMMENT ON COLUMN "public"."listings"."thumbnails" IS 'Card-sized copies of images[], index-aligned. NULL on rows predating the column; readers fall back to images[i].';



COMMENT ON COLUMN "public"."listings"."authenticity" IS 'Seller-declared authenticity: original, inspired (master copy), replica, or not_sure.';



COMMENT ON COLUMN "public"."listings"."taxonomy_version" IS 'Taxonomy version identifier (e.g. 3 for carrinex_taxonomy_v3).';



CREATE OR REPLACE FUNCTION "public"."find_seller_other_listings"("p_seller_id" "uuid", "p_exclude_id" "uuid", "p_limit" integer DEFAULT 6) RETURNS SETOF "public"."listings"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select l.*
  from public.listings l
  where l.seller_id = p_seller_id
    and l.is_sold = false
    and (p_exclude_id is null or l.id <> p_exclude_id)
  order by
    coalesce(l.likes, 0) desc,
    l.created_at desc
  limit greatest(1, least(p_limit, 24))
$$;


ALTER FUNCTION "public"."find_seller_other_listings"("p_seller_id" "uuid", "p_exclude_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_similar_listings"("p_listing_id" "uuid", "p_limit" integer DEFAULT 6) RETURNS SETOF "public"."listings"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  with target as (
    select id, seller_id, category, gender, brand, size, condition, price, title
    from public.listings
    where id = p_listing_id
  )
  select l.*
  from public.listings l
  join target t on true
  join public.profiles p on p.id = l.seller_id
  where l.id <> t.id
    and l.is_sold = false
    and coalesce(p.vacation_mode, false) = false
  order by
    (
      (case when l.category = t.category then 30 else 0 end)
      + (case when l.seller_id <> t.seller_id then 15 else 0 end)
      + (case when l.brand is not null and t.brand is not null
              and lower(l.brand) = lower(t.brand) then 40 else 0 end)
      + (case when l.gender = t.gender or l.gender = 'all' or t.gender = 'all' then 12 else 0 end)
      + (case when l.size is not null and t.size is not null
              and lower(l.size) = lower(t.size) then 10 else 0 end)
      + (case when l.condition = t.condition then 8 else 0 end)
      + greatest(
          0,
          (20 - (abs(l.price - t.price)::numeric / nullif(t.price, 0)) * 40)::int
        )
      + coalesce((similarity(coalesce(l.title,''), coalesce(t.title,'')) * 25)::int, 0)
      + least(8, coalesce(l.likes, 0))
      + (case when l.created_at > now() - interval '14 days' then 4 else 0 end)
    ) desc,
    l.likes desc nulls last,
    l.created_at desc
  limit greatest(1, least(p_limit, 24))
$$;


ALTER FUNCTION "public"."find_similar_listings"("p_listing_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_brand_index"("p_query" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 60) RETURNS TABLE("brand" "text", "item_count" bigint, "images" "text"[])
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with live as (
    select btrim(l.brand) as brand_name,
           l.images[1] as image,
           l.created_at
    from public.listings l
    where l.is_sold = false
      and l.brand is not null
      and btrim(l.brand) <> ''
  ),
  filtered as (
    select *
    from live
    where coalesce(btrim(p_query), '') = ''
       or brand_name ilike
          '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select
    (array_agg(brand_name order by created_at desc))[1] as brand,
    count(*)::bigint as item_count,
    coalesce(
      (array_agg(image order by created_at desc) filter (where image is not null))[1:3],
      '{}'::text[]
    ) as images
  from filtered
  group by lower(brand_name)
  order by item_count desc, brand asc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;


ALTER FUNCTION "public"."get_brand_index"("p_query" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_follow_state"("p_followee" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'is_following', EXISTS (
      SELECT 1 FROM public.user_follows
      WHERE follower_id = auth.uid() AND followee_id = p_followee
    ),
    'followers_count', COALESCE((SELECT followers_count FROM public.profiles WHERE id = p_followee), 0),
    'following_count', COALESCE((SELECT following_count FROM public.profiles WHERE id = p_followee), 0)
  );
$$;


ALTER FUNCTION "public"."get_follow_state"("p_followee" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_order_seller_pickup"("p_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_id uuid;
  v_order record;
  v_is_admin boolean := false;
  v_pickup jsonb;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select id, seller_id, buyer_id into v_order
    from public.orders
   where id = p_order_id;

  if not found then
    return null;
  end if;

  v_is_admin := coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if v_caller_id <> v_order.seller_id and not v_is_admin then
    raise exception 'Access denied to seller pickup address' using errcode = '42501';
  end if;

  select pickup_address into v_pickup
    from public.order_seller_pickups
   where order_id = p_order_id;

  return v_pickup;
end;
$$;


ALTER FUNCTION "public"."get_order_seller_pickup"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recommendations"("p_limit" integer DEFAULT 24) RETURNS TABLE("id" "uuid", "seller_id" "uuid", "title" "text", "brand" "text", "size" "text", "price" integer, "category" "text", "gender" "text", "condition" "text", "images" "text"[], "is_sold" boolean, "likes" integer, "tags" "text"[], "created_at" timestamp with time zone, "rec_score" numeric, "rec_reason" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
with me as (
  select auth.uid() as uid
),
signals as (
  select s.listing_id, s.weight, s.ts
  from me, lateral (
    select ll.listing_id, 2.5::numeric as weight, ll.created_at as ts
    from listing_likes ll where ll.user_id = me.uid
    union all
    select i.listing_id, 3.5, i.created_at
    from save_list_items i
    join save_lists sl on sl.id = i.list_id
    where sl.user_id = me.uid
    union all
    select o.listing_id, 6.0, o.created_at
    from orders o where o.buyer_id = me.uid
    union all
    select v.listing_id, least(v.view_count, 4) * 0.5, v.last_viewed_at
    from listing_views v where v.user_id = me.uid
  ) s
),
engaged as (
  select s.listing_id,
         sum(s.weight * exp(-extract(epoch from (now() - s.ts)) / 86400.0 / 30.0)) as w
  from signals s
  group by 1
),
profile_items as (
  select e.listing_id, e.w, l.category, lower(l.brand) as brand, l.gender, l.price
  from engaged e
  join listings l on l.id = e.listing_id
),
profile_total as (
  select coalesce(sum(w), 0) as tw from profile_items
),
cat_aff as (
  select category, sum(w) as w from profile_items group by 1
),
brand_aff as (
  select brand, sum(w) as w from profile_items where brand is not null group by 1
),
gender_aff as (
  select gender, sum(w) as w from profile_items where gender is not null and gender <> 'all' group by 1
),
price_profile as (
  select case when sum(w) > 0 then sum(price * w) / sum(w) end as avg_price
  from profile_items
),
neighbors as (
  select ll.user_id, count(*)::numeric as overlap
  from me, listing_likes ll
  join engaged e on e.listing_id = ll.listing_id
  where ll.user_id is distinct from me.uid
  group by ll.user_id
),
cf as (
  select ll.listing_id, sum(n.overlap) as raw
  from neighbors n
  join listing_likes ll on ll.user_id = n.user_id
  where not exists (select 1 from engaged e where e.listing_id = ll.listing_id)
  group by 1
),
cf_max as (
  select greatest(max(raw), 1) as m from cf
),
followed as (
  select uf.followee_id from me, user_follows uf where uf.follower_id = me.uid
),
intents as (
  select ss.query, ss.category, ss.gender
  from me, saved_searches ss where ss.user_id = me.uid
),
candidates as (
  select l.id, l.seller_id, l.title, l.brand, l.size, l.price, l.category,
         l.gender, l.condition, l.images, l.is_sold, l.likes, l.tags,
         l.created_at, l.views,
         p.is_verified, p.rating as seller_rating
  from me, listings l
  join profiles p on p.id = l.seller_id
  where l.is_sold = false
    and coalesce(p.vacation_mode, false) = false
    and l.seller_id is distinct from me.uid
    and not exists (select 1 from engaged e where e.listing_id = l.id)
  order by l.created_at desc
  limit 500   -- candidate pruning: newest 500; widen if catalog outgrows it
),
scored as (
  select c.*,
    -- taste affinity, each normalized by total profile weight
    coalesce((select ca.w from cat_aff ca where ca.category = c.category), 0)
      / nullif((select tw from profile_total), 0) as s_cat,
    coalesce((select ba.w from brand_aff ba where ba.brand = lower(c.brand)), 0)
      / nullif((select tw from profile_total), 0) as s_brand,
    coalesce((select ga.w from gender_aff ga where ga.gender = c.gender), 0)
      / nullif((select tw from profile_total), 0) as s_gender,
    case when (select avg_price from price_profile) is not null
         then exp(-abs(c.price - (select avg_price from price_profile))
                  / greatest((select avg_price from price_profile), 1))
         else 0 end as s_price,
    -- collaborative
    coalesce((select cf.raw from cf where cf.listing_id = c.id), 0)
      / (select m from cf_max) as s_cf,
    -- social
    case when exists (select 1 from followed f where f.followee_id = c.seller_id)
         then 1 else 0 end as s_social,
    -- explicit intent from saved searches
    case when exists (
      select 1 from intents i
      where (i.category is null or i.category = c.category)
        and (i.gender is null or i.gender = 'all' or i.gender = c.gender)
        and (i.query is null or i.query = ''
             or c.title ilike '%' || i.query || '%'
             or coalesce(c.brand, '') ilike '%' || i.query || '%')
        and not (i.category is null and (i.query is null or i.query = ''))
    ) then 1 else 0 end as s_intent,
    -- quality prior: bounded popularity + engagement rate + freshness + trust
    least(coalesce(c.likes, 0), 50) / 50.0 as s_pop,
    coalesce(c.likes, 0)::numeric / (coalesce(c.views, 0) + 20) as s_rate,
    exp(-extract(epoch from (now() - c.created_at)) / 86400.0 / 21.0) as s_fresh,
    (case when coalesce(c.is_verified, false) then 0.5 else 0 end
     + coalesce(c.seller_rating, 0) / 10.0) as s_trust,
    -- deterministic daily jitter for exploration
    (abs(hashtextextended(c.id::text || to_char(now(), 'YYYY-MM-DD'), 0)) % 1000) / 1000.0 as s_jitter
  from candidates c
),
weighted as (
  select s.*,
    ( 3.00 * s.s_intent
    + 2.50 * s.s_cf
    + 1.50 * coalesce(s.s_cat, 0)
    + 1.50 * coalesce(s.s_brand, 0)
    + 0.50 * coalesce(s.s_gender, 0)
    + 0.75 * s.s_price
    + 1.25 * s.s_social
    + 1.00 * s.s_pop
    + 1.50 * s.s_rate
    + 1.25 * s.s_fresh
    + 0.30 * s.s_trust
    + 0.35 * s.s_jitter
    ) as score,
    case greatest(
           3.00 * s.s_intent,
           2.50 * s.s_cf,
           1.50 * coalesce(s.s_cat, 0) + 1.50 * coalesce(s.s_brand, 0)
             + 0.50 * coalesce(s.s_gender, 0) + 0.75 * s.s_price,
           1.25 * s.s_social,
           1.00 * s.s_pop + 1.50 * s.s_rate + 1.25 * s.s_fresh)
      when 3.00 * s.s_intent then 'intent'
      when 2.50 * s.s_cf then 'cf'
      when 1.25 * s.s_social then 'social'
      when 1.50 * coalesce(s.s_cat, 0) + 1.50 * coalesce(s.s_brand, 0)
             + 0.50 * coalesce(s.s_gender, 0) + 0.75 * s.s_price then 'taste'
      else 'trending'
    end as reason
  from scored s
),
diversified as (
  select w.*,
         row_number() over (partition by w.seller_id order by w.score desc) as seller_rank
  from weighted w
)
select d.id, d.seller_id, d.title, d.brand, d.size, d.price, d.category,
       d.gender, d.condition, d.images, d.is_sold, d.likes, d.tags,
       d.created_at,
       round(d.score, 4) as rec_score,
       d.reason as rec_reason
from diversified d
where d.seller_rank <= 2
order by d.score desc
limit greatest(1, least(coalesce(p_limit, 24), 60));
$$;


ALTER FUNCTION "public"."get_recommendations"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tag_index"("p_query" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 100) RETURNS TABLE("tag" "text", "item_count" bigint, "image" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with live as (
    select t as tag_name, l.images[1] as image, l.created_at
    from public.listings l, unnest(l.tags) as t
    where l.is_sold = false
  ),
  filtered as (
    select *
    from live
    where coalesce(btrim(p_query), '') = ''
       or tag_name ilike
          '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select
    tag_name as tag,
    count(*)::bigint as item_count,
    (array_agg(image order by created_at desc) filter (where image is not null))[1] as image
  from filtered
  group by tag_name
  order by item_count desc, tag asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;


ALTER FUNCTION "public"."get_tag_index"("p_query" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tag_listings"("p_tag" "text", "p_limit" integer DEFAULT 60) RETURNS SETOF "public"."listings"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select l.*
  from public.listings l
  where p_tag is not null
    and btrim(p_tag) <> ''
    and lower(btrim(p_tag)) = any(l.tags)
    and l.is_sold = false
  order by l.likes desc nulls last, l.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;


ALTER FUNCTION "public"."get_tag_listings"("p_tag" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_platform_shipping"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.fulfillment_status is distinct from old.fulfillment_status
     and new.fulfillment_status in ('picked', 'shifting', 'delivered')
     and auth.uid() is not null
     and not coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
     and not coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
     and not coalesce((select is_admin from public.profiles where id = auth.uid()), false)
  then
    raise exception 'Only the Grabsty logistics team can mark an order picked up, in transit or delivered'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_platform_shipping"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_trust_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- Allow bypass for database administrators, service role, or direct SQL editor sessions
  if coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
     or session_user in ('postgres', 'supabase_admin', 'dashboard_user') then
    return new;
  end if;

  -- 1. INSERT PROTECTION: Prevent setting privileged flags on account registration
  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) is true then
      if coalesce(current_setting('app.auth_override_is_admin', true), '') <> 'authorized' then
        raise exception 'profile trust field (is_admin) cannot be set on insert';
      end if;
    end if;

    if coalesce(new.is_verified, false) is true then
      if coalesce(current_setting('app.auth_override_is_verified', true), '') <> 'authorized' then
        raise exception 'profile trust field (is_verified) cannot be set on insert';
      end if;
    end if;

    if coalesce(new.is_pro, false) is true then
      if coalesce(current_setting('app.auth_override_is_pro', true), '') <> 'authorized' then
        raise exception 'profile trust field (is_pro) cannot be set on insert';
      end if;
    end if;

    return new;
  end if;

  -- 2. UPDATE PROTECTION: Guard trust fields against unauthorized mutation
  if new.is_admin is distinct from old.is_admin then
    if coalesce(current_setting('app.auth_override_is_admin', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_admin) is read-only';
    end if;
  end if;

  if new.is_verified is distinct from old.is_verified then
    if coalesce(current_setting('app.auth_override_is_verified', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_verified) is read-only';
    end if;
  end if;

  if new.is_pro is distinct from old.is_pro then
    if coalesce(current_setting('app.auth_override_is_pro', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_pro) is read-only';
    end if;
  end if;

  if new.rating is distinct from old.rating then
    if coalesce(current_setting('app.auth_override_rating', true), '') <> 'authorized' then
      raise exception 'profile trust field (rating) is read-only';
    end if;
  end if;

  if new.total_sales is distinct from old.total_sales then
    if coalesce(current_setting('app.auth_override_total_sales', true), '') <> 'authorized' then
      raise exception 'profile trust field (total_sales) is read-only';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profile_trust_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_verification_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.auth_override_verification_status', true), '') = 'authorized' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'submitted' then
      raise exception 'new verifications must start as submitted';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      raise exception 'verification status may only be changed by reviewers';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_verification_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_follow_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if (tg_op = 'INSERT') then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."handle_follow_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_message_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_last record;
  v_preview text;
begin
  select id, content, kind, metadata, sender_id, created_at
  into v_last
  from public.messages
  where conversation_id = old.conversation_id
  order by created_at desc
  limit 1;

  if v_last.id is not null then
    if v_last.kind = 'offer' then
      v_preview := 'Offer: Rs ' || coalesce((v_last.metadata->>'amount'), '?');
    else
      v_preview := left(v_last.content, 140);
    end if;
    update public.conversations
      set last_message = v_preview,
          last_sender_id = v_last.sender_id,
          updated_at = v_last.created_at
      where id = old.conversation_id;
  else
    update public.conversations
      set last_message = null,
          last_sender_id = null
      where id = old.conversation_id;
  end if;
  return old;
end;
$$;


ALTER FUNCTION "public"."handle_message_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  base_username text;
  candidate text;
  attempts int := 0;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_username is null or length(base_username) = 0 then
    base_username := 'user';
  end if;

  loop
    candidate := base_username || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    begin
      insert into public.profiles (id, username, full_name)
      values (
        new.id,
        candidate,
        coalesce(new.raw_user_meta_data->>'full_name', base_username)
      )
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 5 then
        insert into public.profiles (id, username, full_name)
        values (
          new.id,
          'user_' || replace(new.id::text, '-', ''),
          coalesce(new.raw_user_meta_data->>'full_name', base_username)
        )
        on conflict (id) do nothing;
        return new;
      end if;
    end;
  end loop;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_wardrobe_swipe_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if (tg_op = 'INSERT') then
    if new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if old.direction = 'like' and new.direction <> 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = new.post_id;
    elsif old.direction <> 'like' and new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.direction = 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."handle_wardrobe_swipe_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1 from public.profiles where id = v_uid and is_admin = true
  ) or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false);
end;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_listing_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.price is distinct from old.price then
    insert into public.listing_price_history (listing_id, old_price, new_price)
    values (new.id, old.price, new.price);
  end if;
  return new;
end$$;


ALTER FUNCTION "public"."log_listing_price_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_listing_view"("p_listing_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_fresh boolean := false;
begin
  if v_uid is null then
    return; -- anonymous views aren't tracked
  end if;
  -- Don't count sellers viewing their own listing.
  if exists (select 1 from public.listings l where l.id = p_listing_id and l.seller_id = v_uid) then
    return;
  end if;

  insert into public.listing_views as lv (user_id, listing_id)
  values (v_uid, p_listing_id)
  on conflict (user_id, listing_id) do update
    set view_count = lv.view_count + 1,
        last_viewed_at = now()
    -- 30-min dedupe window: navigating back and forth isn't a new view
    where lv.last_viewed_at < now() - interval '30 minutes';

  -- FOUND is true only when a row was inserted or actually updated, i.e. a
  -- "fresh" view past the dedupe window — only then bump the public counter.
  v_fresh := found;
  if v_fresh then
    update public.listings set views = coalesce(views, 0) + 1 where id = p_listing_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."log_listing_view"("p_listing_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller uuid := (select auth.uid());
  v_buyer  uuid;
  v_seller uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select c.buyer_id, c.seller_id
    into v_buyer, v_seller
    from public.conversations c
   where c.id = p_conversation_id;

  if v_buyer is null then
    raise exception 'conversation not found';
  end if;

  if v_caller = v_buyer then
    update public.conversations
       set buyer_last_read_at = now()
     where id = p_conversation_id;
  elsif v_caller = v_seller then
    update public.conversations
       set seller_last_read_at = now()
     where id = p_conversation_id;
  else
    raise exception 'not a participant in this conversation';
  end if;
end;
$$;


ALTER FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_order_shipped"("p_order_id" "uuid", "p_courier" "text" DEFAULT 'Standard Delivery'::"text", "p_tracking_number" "text" DEFAULT NULL::"text") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return public.advance_order_fulfillment(
    p_order_id, 'shifting', p_courier, p_tracking_number
  );
end;
$$;


ALTER FUNCTION "public"."mark_order_shipped"("p_order_id" "uuid", "p_courier" "text", "p_tracking_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_contacts"("p_hashes" "text"[]) RETURNS TABLE("id" "uuid", "username" "text", "full_name" "text", "avatar_url" "text", "is_verified" boolean, "followers_count" integer, "matched_hash" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_viewer_id uuid;
begin
  v_viewer_id := auth.uid();
  if v_viewer_id is null then
    return;
  end if;

  -- 1) Retain existing null / empty array handling
  if p_hashes is null or array_length(p_hashes, 1) = 0 then
    return;
  end if;

  -- 2) Enforce documented 500-hash payload limit before performing any scan
  if array_length(p_hashes, 1) > 500 then
    raise exception 'Payload exceeds maximum limit of 500 hashes per request (got %)', array_length(p_hashes, 1)
      using
        errcode = '22000',
        hint = 'Batch contact hashes into chunks of 500 or fewer.';
  end if;

  -- 3) Enforce per-authenticated-user rate limit (max 30 match calls per 1 minute)
  perform public.enforce_rate_limit('match_contacts', 30, interval '1 minute');

  return query
  select distinct
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    coalesce(p.is_verified, false) as is_verified,
    coalesce(p.followers_count, 0) as followers_count,
    h.hash_value as matched_hash
  from public.user_contact_hashes h
  join public.profiles p on p.id = h.user_id
  where h.user_id <> v_viewer_id
    and h.hash_value = any(p_hashes)
  order by followers_count desc, p.username asc
  limit 250;
end;
$$;


ALTER FUNCTION "public"."match_contacts"("p_hashes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."offer_price_ceiling"("p_listing_id" "uuid", "p_metadata" "jsonb") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select sum(l.price)
    from public.listings l
   where l.id = p_listing_id
      or l.id::text in (
           select x from jsonb_array_elements_text(
             case when jsonb_typeof(p_metadata->'bundle_item_ids') = 'array'
                  then p_metadata->'bundle_item_ids' else '[]'::jsonb end) as x
         );
$$;


ALTER FUNCTION "public"."offer_price_ceiling"("p_listing_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_order_dispute"("p_order_id" "uuid", "p_reason" "text", "p_evidence_urls" "text"[] DEFAULT '{}'::"text"[]) RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
  v_order public.orders;
  v_is_admin boolean := false;
  v_conv_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
    or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
    or coalesce((select is_admin from public.profiles where id = v_caller_id), false);

  if v_order.buyer_id <> v_caller_id and not v_is_admin then
    raise exception 'Forbidden: only the buyer or admin may open a dispute for this order' using errcode = '42501';
  end if;

  -- Idempotency
  if v_order.status = 'disputed' or v_order.fulfillment_status = 'disputed' then
    return v_order;
  end if;

  -- Terminal orders cannot be disputed
  if v_order.status in ('completed', 'canceled', 'refunded') and not v_is_admin then
    raise exception 'Cannot dispute an order that has already been completed or canceled' using errcode = '22000';
  end if;

  -- Must be in transit or delivered
  if v_order.fulfillment_status not in ('shifting', 'delivered') and not v_is_admin then
    raise exception 'Disputes can only be opened while in transit or upon delivery (current status: %)', v_order.fulfillment_status
      using errcode = '22000';
  end if;

  -- Enforce 48-hour inspection window server-side
  if v_order.fulfillment_status = 'delivered' and v_order.delivered_at is not null and not v_is_admin then
    if (v_now - v_order.delivered_at) > interval '48 hours' then
      raise exception 'The 48-hour buyer inspection dispute window for this order has expired' using errcode = '22000';
    end if;
  end if;

  update public.orders
     set status = 'disputed',
         fulfillment_status = 'disputed',
         escrow_status = 'DISPUTED',
         dispute_reason = p_reason,
         dispute_evidence_urls = p_evidence_urls,
         disputed_at = v_now
   where id = p_order_id
  returning * into v_order;

  -- Freeze transaction ledger
  update public.transactions
     set status = 'DISPUTED',
         dispute_reason = p_reason,
         dispute_evidence_urls = p_evidence_urls,
         disputed_at = v_now,
         updated_at = v_now
   where order_id = p_order_id;

  -- Dispatch dispute alert in conversation
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
      '⚠️ Buyer Protection Dispute Opened' || E'\nReason: ' || coalesce(p_reason, 'Damaged / Defective item reported') || E'\nFunds have been placed on temporary hold pending resolution.',
      'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'status', 'disputed',
        'fulfillment_status', 'disputed',
        'reason', p_reason,
        'disputed_at', v_now
      )
    );
  end if;

  return v_order;
end;
$$;


ALTER FUNCTION "public"."open_order_dispute"("p_order_id" "uuid", "p_reason" "text", "p_evidence_urls" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_checkout"("p_listing_id" "uuid", "p_buyer_id" "uuid" DEFAULT NULL::"uuid", "p_payment_method" "text" DEFAULT 'cod'::"text", "p_shipping_address" "jsonb" DEFAULT NULL::"jsonb", "p_offer_amount" numeric DEFAULT NULL::numeric, "p_delivery_notes" "text" DEFAULT NULL::"text", "p_shipping_method" "text" DEFAULT 'managed'::"text", "p_bundle_item_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_expected_total" numeric DEFAULT NULL::numeric) RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_is_service_role boolean := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');
  v_caller_id uuid := case
    when (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role')
      then coalesce(p_buyer_id, auth.uid())
    else auth.uid()
  end;
  v_listing public.listings;
  v_seller_id uuid;
  v_order public.orders;
  v_existing_order public.orders;
  v_accepted_offer public.offers;
  v_item_price_cents integer;
  v_shipping_fee_cents integer;
  v_fee_cents integer;
  v_total_cents integer;
  v_order_status text;
  v_session_id text;
  v_ordered_listing_ids uuid[];
  v_addon_ids uuid[];
  v_addon_ids_text text[];
  v_bundle_count integer;
  v_is_seller_mismatch boolean;
  v_bundle_subtotal_cents integer;
  v_bundle_discount_pct integer := 0;
  v_shipping_method text;
  v_now timestamptz := clock_timestamp();
begin
  if v_caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_payment_method not in ('card', 'cod') then
    raise exception 'Invalid payment method: %', p_payment_method using errcode = '22000';
  end if;
  if p_shipping_address is null then
    raise exception 'Shipping address is required' using errcode = '22000';
  end if;
  -- A card order is only real once Stripe has taken the money; the webhook creates those rows itself.
  if p_payment_method = 'card' and not v_is_service_role then
    raise exception 'Card payments must be completed through secure checkout' using errcode = '42501';
  end if;
  v_shipping_method := coalesce(p_shipping_method, 'managed');
  if v_shipping_method not in ('managed', 'self_ship') then
    raise exception 'Invalid shipping method: %', v_shipping_method using errcode = '22000';
  end if;
  v_addon_ids := array(
    select distinct x from unnest(coalesce(p_bundle_item_ids, '{}'::uuid[])) as x
     where x is not null and x <> p_listing_id
  );
  v_addon_ids_text := array(select x::text from unnest(v_addon_ids) as x order by 1);
  v_ordered_listing_ids := array(
    select x from unnest(array_append(v_addon_ids, p_listing_id)) as x order by x
  );
  v_bundle_count := cardinality(v_ordered_listing_ids);
  perform 1 from public.listings where id = any(v_ordered_listing_ids) order by id for update;
  if (select count(*) from public.listings where id = any(v_ordered_listing_ids)) <> v_bundle_count then
    raise exception 'One or more items in the order were not found' using errcode = 'P0002';
  end if;
  select count(distinct seller_id) > 1, max(seller_id::text)::uuid
    into v_is_seller_mismatch, v_seller_id
    from public.listings
   where id = any(v_ordered_listing_ids);
  if v_is_seller_mismatch then
    raise exception 'All bundled items must be from the same seller' using errcode = '22000';
  end if;
  if v_seller_id = v_caller_id then
    raise exception 'You cannot buy your own listings' using errcode = '22000';
  end if;
  if exists (select 1 from public.listings where id = any(v_ordered_listing_ids) and is_sold) then
    raise exception '%', case when v_bundle_count = 1 then 'Listing is already sold'
                              else 'One or more items in the bundle are already sold' end
      using errcode = '22000';
  end if;
  select * into v_listing from public.listings where id = p_listing_id;
  select o.* into v_accepted_offer
    from public.offers o
    left join public.messages m on m.id = o.message_id
   where o.listing_id = p_listing_id
     and o.buyer_id = v_caller_id
     and o.status = 'accepted'
     and (o.expires_at > v_now or o.accepted_at > (v_now - interval '24 hours'))
     and array(
           select distinct x
             from jsonb_array_elements_text(
                    case when jsonb_typeof(m.metadata->'bundle_item_ids') = 'array'
                         then m.metadata->'bundle_item_ids' else '[]'::jsonb end) as x
            where x <> p_listing_id::text
            order by x
         ) = v_addon_ids_text
   order by o.accepted_at desc nulls last, o.created_at desc
   limit 1;
  select sum(round(price * 100))::integer
    into v_bundle_subtotal_cents
    from public.listings
   where id = any(v_ordered_listing_ids);
  if v_accepted_offer.id is not null then
    v_item_price_cents := round(v_accepted_offer.amount * 100)::integer;
  elsif v_bundle_count > 1 then
    select least(30, greatest(0, coalesce(bundle_discount_pct, 0)))
      into v_bundle_discount_pct
      from public.profiles
     where id = v_seller_id;
    v_item_price_cents := v_bundle_subtotal_cents
      - round(v_bundle_subtotal_cents * coalesce(v_bundle_discount_pct, 0) / 100.0)::integer;
  else
    v_item_price_cents := v_bundle_subtotal_cents;
  end if;
  -- Must match lib/fees.ts (6% Buyer Protection; Rs 130 / Rs 180 large parcel)
  v_fee_cents := round(v_item_price_cents * 6 / 100.0)::integer;
  v_shipping_fee_cents := case
    when v_shipping_method = 'self_ship' then 0
    when v_listing.parcel_size = 'large' then 18000
    else 13000
  end;
  v_total_cents := v_item_price_cents + v_fee_cents + v_shipping_fee_cents;
  if p_expected_total is not null and abs(round(p_expected_total * 100) - v_total_cents) > 5 then
    raise exception 'Price has changed: expected total % PKR but calculated % PKR. Please review before proceeding.',
      p_expected_total, (v_total_cents / 100.0)
      using errcode = '22000';
  end if;
  if p_payment_method = 'cod' then
    v_order_status := 'pending';
    v_session_id := 'cod_' || gen_random_uuid()::text;
  else
    v_order_status := 'paid';
    v_session_id := 'pay_' || gen_random_uuid()::text;
  end if;
  select * into v_existing_order
    from public.orders
   where listing_id = p_listing_id
     and buyer_id = v_caller_id
     and status in ('awaiting_payment', 'pending')
   order by created_at desc
   limit 1
   for update;
  if v_existing_order.id is not null then
    update public.orders
       set amount_cents = v_item_price_cents,
           fee_cents = v_fee_cents,
           payment_method = p_payment_method,
           payment_status = case when p_payment_method = 'cod' then 'pending' else 'paid' end,
           status = v_order_status,
           fulfillment_status = 'pending',
           shipping_method = v_shipping_method,
           shipping_fee_cents = v_shipping_fee_cents,
           shipping_address = p_shipping_address,
           delivery_notes = coalesce(p_delivery_notes, delivery_notes),
           stripe_session_id = v_session_id,
           bundle_item_ids = case when v_bundle_count > 1 then v_addon_ids else null end,
           bundle_count = v_bundle_count
     where id = v_existing_order.id
    returning * into v_order;
  else
    insert into public.orders (
      listing_id, buyer_id, seller_id, amount_cents, fee_cents,
      status, fulfillment_status, payment_method, payment_status,
      shipping_method, shipping_fee_cents,
      shipping_address, delivery_notes, stripe_session_id,
      bundle_item_ids, bundle_count
    ) values (
      p_listing_id, v_caller_id, v_seller_id,
      v_item_price_cents, v_fee_cents,
      v_order_status, 'pending', p_payment_method,
      case when p_payment_method = 'cod' then 'pending' else 'paid' end,
      v_shipping_method, v_shipping_fee_cents,
      p_shipping_address, p_delivery_notes, v_session_id,
      case when v_bundle_count > 1 then v_addon_ids else null end,
      v_bundle_count
    ) returning * into v_order;
  end if;
  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = any(v_ordered_listing_ids);
  update public.offers
     set status = 'declined',
         updated_at = v_now
   where listing_id = any(v_ordered_listing_ids)
     and id is distinct from v_accepted_offer.id
     and status in ('pending', 'accepted');
  -- cancelled_by is a uuid; a system cancellation leaves it null.
  update public.orders
     set status = 'canceled',
         fulfillment_status = 'canceled',
         cancel_reason = 'Item sold to another buyer',
         cancelled_by = null
   where listing_id = any(v_ordered_listing_ids)
     and id <> v_order.id
     and status = 'awaiting_payment';
  return v_order;
end;
$$;


ALTER FUNCTION "public"."process_checkout"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_method" "text", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text", "p_bundle_item_ids" "uuid"[], "p_expected_total" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_device"("p_token" "text", "p_platform" "text" DEFAULT NULL::"text", "p_device_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'token required' using errcode = '22023';
  end if;

  insert into public.user_devices (user_id, expo_push_token, platform, device_name)
  values (v_uid, trim(p_token), p_platform, p_device_name)
  on conflict (expo_push_token) do update
    set user_id     = v_uid,
        platform    = excluded.platform,
        device_name = excluded.device_name,
        updated_at  = now();
end;
$$;


ALTER FUNCTION "public"."register_device"("p_token" "text", "p_platform" "text", "p_device_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_my_contact_hashes"("p_phone_hashes" "text"[] DEFAULT NULL::"text"[], "p_email_hashes" "text"[] DEFAULT NULL::"text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_viewer_id uuid;
  v_hash text;
begin
  v_viewer_id := auth.uid();
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1) Enforce per-authenticated-user rate limit before processing arrays or mutating rows
  perform public.enforce_rate_limit('register_my_contact_hashes', 30, interval '1 minute');

  -- 2) Enforce small maximum size for each hash array
  if p_phone_hashes is not null and coalesce(array_length(p_phone_hashes, 1), 0) > 10 then
    raise exception 'Payload exceeds maximum limit of 10 phone hashes per request (got %)', array_length(p_phone_hashes, 1)
      using
        errcode = '22000',
        hint = 'Provide 10 or fewer phone hashes.';
  end if;

  if p_email_hashes is not null and coalesce(array_length(p_email_hashes, 1), 0) > 10 then
    raise exception 'Payload exceeds maximum limit of 10 email hashes per request (got %)', array_length(p_email_hashes, 1)
      using
        errcode = '22000',
        hint = 'Provide 10 or fewer email hashes.';
  end if;

  -- 3) Replace existing phone hashes for current user if phone hashes are supplied
  if p_phone_hashes is not null then
    delete from public.user_contact_hashes
     where user_id = v_viewer_id
       and hash_type = 'phone';

    foreach v_hash in array p_phone_hashes loop
      if v_hash is not null and length(trim(v_hash)) > 0 then
        insert into public.user_contact_hashes (user_id, hash_type, hash_value)
        values (v_viewer_id, 'phone', trim(v_hash))
        on conflict (user_id, hash_type, hash_value) do nothing;
      end if;
    end loop;
  end if;

  -- 4) Replace existing email hashes for current user if email hashes are supplied
  if p_email_hashes is not null then
    delete from public.user_contact_hashes
     where user_id = v_viewer_id
       and hash_type = 'email';

    foreach v_hash in array p_email_hashes loop
      if v_hash is not null and length(trim(v_hash)) > 0 then
        insert into public.user_contact_hashes (user_id, hash_type, hash_value)
        values (v_viewer_id, 'email', trim(v_hash))
        on conflict (user_id, hash_type, hash_value) do nothing;
      end if;
    end loop;
  end if;
end;
$$;


ALTER FUNCTION "public"."register_my_contact_hashes"("p_phone_hashes" "text"[], "p_email_hashes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_expired_reservations"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer := 0;
  v_rec record;
  v_now timestamptz := clock_timestamp();
begin
  for v_rec in
    select id, listing_id
      from public.orders
     where status = 'awaiting_payment'
       and created_at < (v_now - interval '24 hours')
     for update skip locked
  loop
    update public.orders
       set status = 'canceled',
           fulfillment_status = 'canceled',
           escrow_status = 'CANCELLED'
     where id = v_rec.id;

    update public.listings
       set is_sold = false,
           reserved_until = null
     where id = v_rec.listing_id
       and is_sold = true;

    v_count := v_count + 1;
  end loop;

  update public.listings
     set is_sold = false,
         reserved_until = null
   where reserved_until is not null
     and reserved_until < v_now
     and is_sold = true
     and not exists (
       select 1 from public.orders o
        where o.listing_id = listings.id
          and o.status not in ('canceled', 'refunded')
     );

  return v_count;
end;
$$;


ALTER FUNCTION "public"."release_expired_reservations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."saved_search_new_matches"("p_search_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  s public.saved_searches%rowtype;
  c integer;
  escaped_query text;
begin
  select * into s from public.saved_searches where id = p_search_id;
  if not found or s.user_id <> auth.uid() then
    return 0;
  end if;

  -- Escape LIKE metacharacters so a saved query containing '%' or '_'
  -- matches them literally instead of acting as wildcards.
  escaped_query := replace(replace(replace(coalesce(s.query, ''),
                                           '\', '\\'),
                                   '%', '\%'),
                           '_', '\_');

  select count(*) into c
    from public.listings l
    where l.is_sold = false
      and (s.category is null or l.category = s.category)
      and (s.gender is null or l.gender = s.gender)
      and (
        s.query is null or s.query = ''
        or l.title ilike '%' || escaped_query || '%' escape '\'
        or coalesce(l.brand, '') ilike '%' || escaped_query || '%' escape '\'
      )
      and l.created_at > coalesce(s.last_seen_at, '1970-01-01'::timestamptz);
  return coalesce(c, 0);
end;
$$;


ALTER FUNCTION "public"."saved_search_new_matches"("p_search_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_user"("target_identifier" "text", "make_admin" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform set_config('app.auth_override_is_admin', 'authorized', true);
  update public.profiles
     set is_admin = make_admin
   where lower(username) = lower(target_identifier)
      or id::text = target_identifier;
  perform set_config('app.auth_override_is_admin', 'off', true);
end;
$$;


ALTER FUNCTION "public"."set_admin_user"("target_identifier" "text", "make_admin" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payout_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "label" "text" NOT NULL,
    "account_last4" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payout_methods_account_last4_check" CHECK (("account_last4" ~ '^[0-9]{4}$'::"text")),
    CONSTRAINT "payout_methods_kind_check" CHECK (("kind" = ANY (ARRAY['bank'::"text", 'wallet'::"text"])))
);


ALTER TABLE "public"."payout_methods" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_default_payout"("p_payload" "jsonb") RETURNS "public"."payout_methods"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_payout public.payout_methods;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_kind text := p_payload->>'kind';
  v_label text := trim(p_payload->>'label');
  v_last4 text := trim(p_payload->>'account_last4');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_kind not in ('bank', 'wallet') then
    raise exception 'Invalid payout kind: %', v_kind using errcode = '22000';
  end if;

  if length(v_label) < 2 then
    raise exception 'Payout label must be at least 2 characters' using errcode = '22000';
  end if;

  if v_last4 !~ '^[0-9]{4}$' then
    raise exception 'Account last 4 must be exactly 4 digits' using errcode = '22000';
  end if;

  -- 1. Clear existing default payout method for this user
  update public.payout_methods
     set is_default = false
   where user_id = v_user_id
     and is_default = true
     and (v_id is null or id <> v_id);

  -- 2. Update existing or insert new default payout method
  if v_id is not null then
    update public.payout_methods
       set kind = v_kind,
           label = v_label,
           account_last4 = v_last4,
           is_default = true
     where id = v_id and user_id = v_user_id
    returning * into v_payout;

    if v_payout.id is null then
      raise exception 'Payout method not found or not owned by caller' using errcode = 'P0002';
    end if;
  else
    insert into public.payout_methods (
      user_id, kind, label, account_last4, is_default
    ) values (
      v_user_id,
      v_kind,
      v_label,
      v_last4,
      true
    )
    returning * into v_payout;
  end if;

  return v_payout;
end;
$_$;


ALTER FUNCTION "public"."set_default_payout"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_message_reaction_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  select m.conversation_id
    into new.conversation_id
    from public.messages m
   where m.id = new.message_id;

  if new.conversation_id is null then
    raise exception 'message % not found', new.message_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_message_reaction_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sweep_expired_offers_and_reservations"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expired_count int;
  v_unlocked_orders record;
begin
  -- 1. Sweep active offers older than 48 hours -> mark 'expired'
  update public.messages
     set offer_status = 'expired',
         updated_at = now()
   where kind = 'offer'
     and offer_status in ('proposed', 'pending')
     and created_at < now() - interval '48 hours';

  -- 2. Sweep orders in awaiting_payment older than 15 minutes -> mark 'failed', unlock listing
  for v_unlocked_orders in
    select id, listing_id
      from public.orders
     where fulfillment_status = 'awaiting_payment'
       and created_at < now() - interval '15 minutes'
       for update
  loop
    update public.orders
       set fulfillment_status = 'canceled',
           status = 'failed',
           cancel_reason = 'Payment authorization TTL expired (15m)'
     where id = v_unlocked_orders.id;

    if v_unlocked_orders.listing_id is not null then
      if not exists (
        select 1
          from public.orders
         where listing_id = v_unlocked_orders.listing_id
           and id <> v_unlocked_orders.id
           and status not in ('canceled', 'refunded', 'failed')
           and coalesce(fulfillment_status, '') not in ('canceled', 'failed')
      ) then
        update public.listings
           set is_sold = false
         where id = v_unlocked_orders.listing_id;
      end if;
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."sweep_expired_offers_and_reservations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_rl_follows"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin perform public.enforce_rate_limit('follow', 60, interval '1 minute'); return new; end;
$$;


ALTER FUNCTION "public"."tg_rl_follows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_rl_likes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin perform public.enforce_rate_limit('like', 120, interval '1 minute'); return new; end;
$$;


ALTER FUNCTION "public"."tg_rl_likes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_rl_listings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin perform public.enforce_rate_limit('listing_insert', 10, interval '1 hour'); return new; end;
$$;


ALTER FUNCTION "public"."tg_rl_listings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_rl_messages"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin perform public.enforce_rate_limit('message_send', 60, interval '1 minute'); return new; end;
$$;


ALTER FUNCTION "public"."tg_rl_messages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_rl_saves"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin perform public.enforce_rate_limit('save', 120, interval '1 minute'); return new; end;
$$;


ALTER FUNCTION "public"."tg_rl_saves"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_follow"("p_followee" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_follower uuid := auth.uid();
  v_exists boolean;
  v_is_following boolean;
  v_followers int;
  v_following int;
begin
  if v_follower is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_follower = p_followee then
    raise exception 'cannot_follow_self' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_follows
    where follower_id = v_follower and followee_id = p_followee
  ) into v_exists;

  if v_exists then
    delete from public.user_follows
    where follower_id = v_follower and followee_id = p_followee;
    v_is_following := false;
  else
    -- ON CONFLICT DO NOTHING absorbs the race where two concurrent toggle
    -- calls both saw v_exists = false.
    insert into public.user_follows (follower_id, followee_id)
    values (v_follower, p_followee)
    on conflict do nothing;
    v_is_following := true;
  end if;

  select followers_count, following_count
    into v_followers, v_following
  from public.profiles where id = p_followee;

  return jsonb_build_object(
    'is_following', v_is_following,
    'followers_count', coalesce(v_followers, 0),
    'following_count', coalesce(v_following, 0)
  );
end;
$$;


ALTER FUNCTION "public"."toggle_follow"("p_followee" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_message_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_message_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_auto_create_order_transaction"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_item_price integer := greatest(0, coalesce(new.amount_cents, 0));
  v_fee integer := greatest(0, coalesce(new.fee_cents, 0));
  v_shipping_fee integer := greatest(0, coalesce(new.shipping_fee_cents, 0));
  v_total_amount integer;
  v_initial_status text;
begin
  v_total_amount := greatest(1, v_item_price + v_fee + v_shipping_fee);
  v_initial_status := case
    when new.status = 'paid' or new.payment_method = 'cod' then 'PAYMENT_SECURED_ESCROW'
    else 'PENDING_PAYMENT'
  end;
  insert into public.transactions (
    order_id, listing_id, buyer_id, seller_id,
    amount_cents, platform_fee_cents, shipping_fee_cents, payout_amount_cents,
    currency, payment_method, status, escrow_secured_at
  ) values (
    new.id, new.listing_id, new.buyer_id, new.seller_id,
    v_total_amount, v_fee, v_shipping_fee, v_item_price,
    coalesce(new.currency, 'pkr'), coalesce(new.payment_method, 'cod'),
    v_initial_status,
    case when v_initial_status = 'PAYMENT_SECURED_ESCROW' then clock_timestamp() else null end
  )
  on conflict (order_id) do nothing;
  update public.orders
     set payout_amount_cents = v_item_price,
         escrow_status = v_initial_status
   where id = new.id;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_fn_auto_create_order_transaction"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_sync_offer_on_message_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_conv record;
  v_amount numeric;
  v_ceiling numeric;
begin
  if new.kind = 'offer' and coalesce(new.offer_status, 'pending') = 'pending' then
    select * into v_conv from public.conversations where id = new.conversation_id;
    if v_conv.id is not null and v_conv.listing_id is not null then
      if (new.metadata->>'amount') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
        v_amount := (new.metadata->>'amount')::numeric;
      else
        v_amount := null;
      end if;
      v_ceiling := public.offer_price_ceiling(v_conv.listing_id, new.metadata);
      if v_amount is not null and v_amount > 0 and (v_ceiling is null or v_amount <= v_ceiling) then
        insert into public.offers (
          listing_id, buyer_id, seller_id, amount, status,
          expires_at, conversation_id, message_id, created_at, updated_at
        ) values (
          v_conv.listing_id, v_conv.buyer_id, v_conv.seller_id, v_amount, 'pending',
          clock_timestamp() + interval '24 hours', v_conv.id, new.id,
          coalesce(new.created_at, clock_timestamp()), clock_timestamp()
        )
        on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$_$;


ALTER FUNCTION "public"."trg_fn_sync_offer_on_message_insert"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "bio" "text",
    "location" "text",
    "rating" numeric(3,2) DEFAULT 0,
    "total_sales" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "vacation_mode" boolean DEFAULT false NOT NULL,
    "bundle_discount_pct" integer DEFAULT 0 NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "is_pro" boolean DEFAULT false NOT NULL,
    "followers_count" integer DEFAULT 0 NOT NULL,
    "following_count" integer DEFAULT 0 NOT NULL,
    "interests" "text"[],
    "banner_url" "text",
    "expo_push_token" "text",
    "is_admin" boolean DEFAULT false NOT NULL,
    "saved_collection_privacy" "text" DEFAULT 'private'::"text" NOT NULL,
    CONSTRAINT "profiles_bundle_discount_pct_check" CHECK ((("bundle_discount_pct" >= 0) AND ("bundle_discount_pct" <= 30))),
    CONSTRAINT "profiles_saved_collection_privacy_check" CHECK (("saved_collection_privacy" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."banner_url" IS 'Public URL of the profile banner image. NULL means no banner uploaded — readers fall back to a purple-tint band. Stored in the existing `avatars` bucket under the owner''s own folder, so the bucket''s existing owner-only write policy covers it without a new storage policy.';



COMMENT ON COLUMN "public"."profiles"."saved_collection_privacy" IS 'Privacy setting for the user saved collection (public vs private)';



CREATE OR REPLACE FUNCTION "public"."update_seller_subscription"("p_is_pro" boolean) RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Permission denied: update_seller_subscription may only be called by service_role';
  end if;

  perform set_config('app.auth_override_is_pro', 'authorized', true);

  update public.profiles
     set is_pro = p_is_pro,
         updated_at = now()
   where id = v_user_id
  returning * into v_profile;

  perform set_config('app.auth_override_is_pro', 'off', true);

  if v_profile.id is null then
    raise exception 'profile not found';
  end if;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."update_seller_subscription"("p_is_pro" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_seller_subscription"("p_user_id" "uuid", "p_is_pro" boolean) RETURNS "public"."profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_profile public.profiles;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Permission denied: update_seller_subscription may only be called by service_role';
  end if;

  perform set_config('app.auth_override_is_pro', 'authorized', true);

  update public.profiles
     set is_pro = p_is_pro,
         updated_at = now()
   where id = p_user_id
  returning * into v_profile;

  perform set_config('app.auth_override_is_pro', 'off', true);

  if v_profile.id is null then
    raise exception 'profile not found';
  end if;

  return v_profile;
end;
$$;


ALTER FUNCTION "public"."update_seller_subscription"("p_user_id" "uuid", "p_is_pro" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "recipient_name" "text" NOT NULL,
    "line1" "text" NOT NULL,
    "line2" "text",
    "city" "text" NOT NULL,
    "state" "text",
    "postal_code" "text" NOT NULL,
    "country" "text" NOT NULL,
    "phone" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."shipping_addresses" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_shipping_address_with_default"("p_payload" "jsonb") RETURNS "public"."shipping_addresses"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_address public.shipping_addresses;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
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
      raise exception 'address not found or not owned by caller' using errcode = 'P0002';
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


ALTER FUNCTION "public"."upsert_shipping_address_with_default"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_offer_status_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  caller uuid := auth.uid();
  buyer  uuid;
  seller uuid;
  counterparty uuid;
begin
  if old.kind <> 'offer' then
    return new;
  end if;

  -- Transaction-local bypass for atomic offer acceptance and counter-offer routines
  if current_setting('ceranix.in_accept_offer', true) = 'on'
     or current_setting('ceranix.in_counter_offer', true) = 'on' then
    return new;
  end if;

  -- Block mutation of any column other than offer_status / updated_at / parent_offer_id
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id      is distinct from old.sender_id
     or new.content        is distinct from old.content
     or new.kind           is distinct from old.kind
     or new.metadata       is distinct from old.metadata
     or new.created_at     is distinct from old.created_at then
    raise exception 'offer messages: only offer_status may be updated';
  end if;

  -- Short-circuit on metadata-only no-op
  if new.offer_status is not distinct from old.offer_status then
    return new;
  end if;

  -- Only proposed or pending offers may transition
  if old.offer_status not in ('proposed', 'pending') then
    raise exception 'offer is no longer active (current: %)', old.offer_status;
  end if;

  -- Valid target states
  if new.offer_status not in ('accepted', 'declined', 'countered', 'expired', 'withdrawn') then
    raise exception 'invalid offer_status transition: % -> %',
      old.offer_status, new.offer_status;
  end if;

  select c.buyer_id, c.seller_id
    into buyer, seller
    from public.conversations c
   where c.id = old.conversation_id;

  if buyer is null then
    raise exception 'conversation not found for message';
  end if;

  -- Counterparty = participant who did NOT send the offer
  counterparty := case when old.sender_id = buyer then seller else buyer end;

  if new.offer_status = 'withdrawn' then
    if caller is distinct from old.sender_id then
      raise exception 'only the offer sender may withdraw';
    end if;
  elsif new.offer_status in ('accepted', 'declined', 'countered') then
    if caller is not null and caller is distinct from counterparty then
      raise exception 'only the counterparty may accept, decline, or counter this offer';
    end if;
  elsif new.offer_status = 'expired' then
    if caller is not null then
      raise exception 'only service role may mark offers expired';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_offer_status_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_payment_webhook"("p_order_id" "uuid", "p_provider" "text", "p_external_transaction_id" "text", "p_amount_cents" integer, "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service_role boolean := false;
  v_order public.orders;
  v_is_admin boolean := false;
  v_now timestamptz := clock_timestamp();
  v_expected_total_cents integer;
begin
  v_is_service_role := (coalesce(auth.role(), '') = 'service_role' or coalesce(auth.jwt()->>'role', '') = 'service_role');

  if v_caller_id is not null then
    v_is_admin := coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false)
      or coalesce((auth.jwt()->'app_metadata'->>'role') = 'admin', false)
      or coalesce((select is_admin from public.profiles where id = v_caller_id), false);
    if not v_is_admin and not v_is_service_role then
      raise exception 'Forbidden: payment webhooks can only be processed by server' using errcode = '42501';
    end if;
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- Idempotency check: if already verified and paid
  if v_order.status = 'paid' and v_order.escrow_status = 'PAYMENT_SECURED_ESCROW' then
    return v_order;
  end if;

  -- Check amount against order total
  v_expected_total_cents := v_order.amount_cents + coalesce(v_order.shipping_fee_cents, 0);
  if p_amount_cents <> v_expected_total_cents then
    raise exception 'Payment amount mismatch: webhook reported % cents but order total is % cents',
      p_amount_cents, v_expected_total_cents
      using errcode = '22000';
  end if;

  -- Advance order to paid and secured escrow
  update public.orders
     set status = 'paid',
         payment_status = 'paid',
         escrow_status = 'PAYMENT_SECURED_ESCROW',
         payment_authorized_at = coalesce(payment_authorized_at, v_now),
         stripe_payment_intent = coalesce(p_external_transaction_id, stripe_payment_intent),
         reserved_until = null
   where id = p_order_id
  returning * into v_order;

  -- Update transaction row
  update public.transactions
     set status = 'PAYMENT_SECURED_ESCROW',
         escrow_secured_at = coalesce(escrow_secured_at, v_now),
         updated_at = v_now
   where order_id = p_order_id;

  -- Ensure listing is marked sold
  update public.listings
     set is_sold = true,
         reserved_until = null
   where id = v_order.listing_id;

  return v_order;
end;
$$;


ALTER FUNCTION "public"."verify_payment_webhook"("p_order_id" "uuid", "p_provider" "text", "p_external_transaction_id" "text", "p_amount_cents" integer, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."waitlist_referral_count"("p_code" "text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::int
    from public.waitlist
   where length(p_code) between 1 and 64
     and referred_by in (ltrim(p_code, '#'), '#' || ltrim(p_code, '#'));
$$;


ALTER FUNCTION "public"."waitlist_referral_count"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "push"."notify_send_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';

  if v_url is null or v_secret is null then
    raise warning '[push] vault secrets not configured - skipping notification';
    return null;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'type',       tg_op,
                 'table',      tg_table_name,
                 'schema',     tg_table_schema,
                 'record',     to_jsonb(new),
                 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', v_secret
               ),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;


ALTER FUNCTION "push"."notify_send_push"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_deletion_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."account_deletion_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid",
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "last_message" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_sender_id" "uuid",
    "buyer_last_read_at" timestamp with time zone,
    "seller_last_read_at" timestamp with time zone
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversations"."buyer_last_read_at" IS 'When the buyer last opened this thread. NULL means never. Written only via public.mark_conversation_read().';



COMMENT ON COLUMN "public"."conversations"."seller_last_read_at" IS 'When the seller last opened this thread. NULL means never. Written only via public.mark_conversation_read().';



CREATE TABLE IF NOT EXISTS "public"."listing_likes" (
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."listing_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "old_price" numeric(10,2) NOT NULL,
    "new_price" numeric(10,2) NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."listing_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_views" (
    "user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "view_count" integer DEFAULT 1 NOT NULL,
    "first_viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."listing_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_reactions_emoji_len" CHECK ((("char_length"("emoji") >= 1) AND ("char_length"("emoji") <= 16)))
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."message_reactions" IS 'One emoji reaction per user per message. conversation_id is trigger-maintained for realtime filtering.';



COMMENT ON COLUMN "public"."message_reactions"."emoji" IS 'NULL means the user cleared their reaction. Rows are never deleted — see the migration that introduced this for why (Realtime cannot filter DELETEs and strips their payload under RLS).';



CREATE TABLE IF NOT EXISTS "public"."offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'PKR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("clock_timestamp"() + '24:00:00'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "conversation_id" "uuid",
    "message_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "clock_timestamp"() NOT NULL,
    CONSTRAINT "offers_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'countered'::"text", 'expired'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_seller_pickups" (
    "order_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "pickup_address" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_seller_pickups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."processed_webhooks" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."processed_webhooks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_deliveries" (
    "id" bigint NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "recipient_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_deliveries" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_deliveries" IS 'Idempotency ledger for send-push. Service-role only. Rows older than ~30 days can be pruned; webhook redelivery windows are minutes, not weeks.';



ALTER TABLE "public"."push_deliveries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."push_deliveries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."rate_limit_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limit_events" OWNER TO "postgres";


ALTER TABLE "public"."rate_limit_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."rate_limit_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "listing_id" "uuid",
    "reported_user_id" "uuid",
    "reason" "text" NOT NULL,
    "details" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."save_list_items" (
    "list_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."save_list_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."save_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "emoji" "text" DEFAULT '🔖'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."save_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_searches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "query" "text",
    "category" "text",
    "gender" "text",
    "label" "text",
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "notify" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."saved_searches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transaction_event_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."transaction_event_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_contact_hashes" (
    "user_id" "uuid" NOT NULL,
    "hash_type" "text" NOT NULL,
    "hash_value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_contact_hashes_hash_type_check" CHECK (("hash_type" = ANY (ARRAY['phone'::"text", 'email'::"text"])))
);


ALTER TABLE "public"."user_contact_hashes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text",
    "device_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_devices" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_devices" IS 'Expo push tokens, one row per device. Owner-only select/delete; all writes go through public.register_device(). Read across users only by the service role.';



CREATE TABLE IF NOT EXISTS "public"."user_follows" (
    "follower_id" "uuid" NOT NULL,
    "followee_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_follows_check" CHECK (("follower_id" <> "followee_id"))
);


ALTER TABLE "public"."user_follows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verifications" (
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'submitted'::"text" NOT NULL,
    "legal_name" "text" NOT NULL,
    "document_kind" "text" NOT NULL,
    "document_number_last4" "text",
    "notes" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "verifications_document_kind_check" CHECK (("document_kind" = ANY (ARRAY['passport'::"text", 'national_id'::"text", 'drivers_license'::"text"]))),
    CONSTRAINT "verifications_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'buyer'::"text",
    "ticket_number" integer,
    "referral_code" "text",
    "referred_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT 'Lahore'::"text",
    "interest" "text" DEFAULT 'both'::"text",
    CONSTRAINT "waitlist_role_check" CHECK (("role" = ANY (ARRAY['buyer'::"text", 'seller'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


COMMENT ON TABLE "public"."waitlist" IS 'Grabsty Lahore Resale & Architecture Design Waitlist';



CREATE TABLE IF NOT EXISTS "public"."wardrobe_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "caption" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "face_hidden" boolean DEFAULT false NOT NULL,
    "bg_removed" boolean DEFAULT false NOT NULL,
    "likes_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wardrobe_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wardrobe_swipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wardrobe_swipes_direction_check" CHECK (("direction" = ANY (ARRAY['like'::"text", 'pass'::"text"])))
);


ALTER TABLE "public"."wardrobe_swipes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_buyer_id_key" UNIQUE ("listing_id", "buyer_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_pkey" PRIMARY KEY ("user_id", "listing_id");



ALTER TABLE ONLY "public"."listing_price_history"
    ADD CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_views"
    ADD CONSTRAINT "listing_views_pkey" PRIMARY KEY ("user_id", "listing_id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_one_per_user" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_seller_pickups"
    ADD CONSTRAINT "order_seller_pickups_pkey" PRIMARY KEY ("order_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_stripe_session_id_key" UNIQUE ("stripe_session_id");



ALTER TABLE ONLY "public"."payout_methods"
    ADD CONSTRAINT "payout_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."processed_webhooks"
    ADD CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_events"
    ADD CONSTRAINT "rate_limit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."save_list_items"
    ADD CONSTRAINT "save_list_items_pkey" PRIMARY KEY ("list_id", "listing_id");



ALTER TABLE ONLY "public"."save_lists"
    ADD CONSTRAINT "save_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_addresses"
    ADD CONSTRAINT "shipping_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transaction_event_logs"
    ADD CONSTRAINT "transaction_event_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_contact_hashes"
    ADD CONSTRAINT "user_contact_hashes_pkey" PRIMARY KEY ("user_id", "hash_type", "hash_value");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_expo_push_token_key" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_pkey" PRIMARY KEY ("follower_id", "followee_id");



ALTER TABLE ONLY "public"."verifications"
    ADD CONSTRAINT "verifications_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wardrobe_posts"
    ADD CONSTRAINT "wardrobe_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wardrobe_swipes"
    ADD CONSTRAINT "wardrobe_swipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wardrobe_swipes"
    ADD CONSTRAINT "wardrobe_swipes_post_id_user_id_key" UNIQUE ("post_id", "user_id");



CREATE INDEX "conversations_buyer_idx" ON "public"."conversations" USING "btree" ("buyer_id", "updated_at" DESC);



CREATE INDEX "conversations_last_sender_idx" ON "public"."conversations" USING "btree" ("last_sender_id");



CREATE INDEX "conversations_seller_idx" ON "public"."conversations" USING "btree" ("seller_id", "updated_at" DESC);



CREATE UNIQUE INDEX "direct_conversations_participants_idx" ON "public"."conversations" USING "btree" (LEAST("buyer_id", "seller_id"), GREATEST("buyer_id", "seller_id")) WHERE ("listing_id" IS NULL);



CREATE INDEX "idx_waitlist_email" ON "public"."waitlist" USING "btree" ("email");



CREATE INDEX "idx_waitlist_phone" ON "public"."waitlist" USING "btree" ("phone");



CREATE INDEX "idx_waitlist_referral_code" ON "public"."waitlist" USING "btree" ("referral_code");



CREATE INDEX "idx_waitlist_referred_by" ON "public"."waitlist" USING "btree" ("referred_by");



CREATE INDEX "listing_likes_listing_idx" ON "public"."listing_likes" USING "btree" ("listing_id");



CREATE INDEX "listing_likes_user_idx" ON "public"."listing_likes" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "listing_price_history_listing_changed_idx" ON "public"."listing_price_history" USING "btree" ("listing_id", "changed_at" DESC);



CREATE INDEX "listing_views_listing_idx" ON "public"."listing_views" USING "btree" ("listing_id");



CREATE INDEX "listing_views_user_recent_idx" ON "public"."listing_views" USING "btree" ("user_id", "last_viewed_at" DESC);



CREATE INDEX "listings_active_category_idx" ON "public"."listings" USING "btree" ("category", "created_at" DESC) WHERE ("is_sold" = false);



CREATE INDEX "listings_active_created_idx" ON "public"."listings" USING "btree" ("created_at" DESC) WHERE ("is_sold" = false);



CREATE INDEX "listings_active_likes_idx" ON "public"."listings" USING "btree" ("likes" DESC, "created_at" DESC) WHERE ("is_sold" = false);



CREATE INDEX "listings_active_seller_idx" ON "public"."listings" USING "btree" ("seller_id", "created_at" DESC) WHERE ("is_sold" = false);



CREATE INDEX "listings_category_subcategory_idx" ON "public"."listings" USING "btree" ("category", "subcategory");



CREATE INDEX "listings_color_idx" ON "public"."listings" USING "btree" ("color");



CREATE INDEX "listings_created_at_idx" ON "public"."listings" USING "btree" ("created_at" DESC);



CREATE INDEX "listings_likes_idx" ON "public"."listings" USING "btree" ("likes" DESC, "created_at" DESC);



CREATE INDEX "listings_seller_idx" ON "public"."listings" USING "btree" ("seller_id");



CREATE INDEX "listings_tags_gin_idx" ON "public"."listings" USING "gin" ("tags");



CREATE INDEX "listings_title_trgm_idx" ON "public"."listings" USING "gin" ("title" "extensions"."gin_trgm_ops");



CREATE INDEX "message_reactions_conversation_idx" ON "public"."message_reactions" USING "btree" ("conversation_id");



CREATE INDEX "message_reactions_user_idx" ON "public"."message_reactions" USING "btree" ("user_id");



CREATE INDEX "messages_conversation_created_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "messages_parent_offer_idx" ON "public"."messages" USING "btree" ("parent_offer_id");



CREATE INDEX "messages_sender_idx" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "offers_listing_buyer_idx" ON "public"."offers" USING "btree" ("listing_id", "buyer_id", "status");



CREATE INDEX "offers_message_id_idx" ON "public"."offers" USING "btree" ("message_id");



CREATE INDEX "offers_seller_status_idx" ON "public"."offers" USING "btree" ("seller_id", "status", "expires_at");



CREATE INDEX "orders_buyer_idx" ON "public"."orders" USING "btree" ("buyer_id", "created_at" DESC);



CREATE INDEX "orders_buyer_status_idx" ON "public"."orders" USING "btree" ("buyer_id", "status", "created_at" DESC);



CREATE INDEX "orders_dispute_idx" ON "public"."orders" USING "btree" ("fulfillment_status") WHERE ("fulfillment_status" = 'disputed'::"text");



CREATE INDEX "orders_fulfillment_status_idx" ON "public"."orders" USING "btree" ("fulfillment_status", "created_at" DESC);



CREATE INDEX "orders_listing_idx" ON "public"."orders" USING "btree" ("listing_id");



CREATE INDEX "orders_offer_message_idx" ON "public"."orders" USING "btree" ("offer_message_id") WHERE ("offer_message_id" IS NOT NULL);



CREATE UNIQUE INDEX "orders_one_paid_per_listing_idx" ON "public"."orders" USING "btree" ("listing_id") WHERE ("status" = 'paid'::"text");



COMMENT ON INDEX "public"."orders_one_paid_per_listing_idx" IS 'At most one paid order per listing. Duplicate payers land in refund_due.';



CREATE INDEX "orders_seller_idx" ON "public"."orders" USING "btree" ("seller_id", "created_at" DESC);



CREATE INDEX "orders_seller_status_idx" ON "public"."orders" USING "btree" ("seller_id", "status", "created_at" DESC);



CREATE INDEX "orders_shipping_method_idx" ON "public"."orders" USING "btree" ("shipping_method", "fulfillment_status");



CREATE UNIQUE INDEX "payout_methods_one_default_idx" ON "public"."payout_methods" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE INDEX "payout_methods_user_idx" ON "public"."payout_methods" USING "btree" ("user_id");



CREATE INDEX "profiles_active_idx" ON "public"."profiles" USING "btree" ("id") WHERE ("vacation_mode" = false);



CREATE UNIQUE INDEX "profiles_username_lower_idx" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE INDEX "push_deliveries_created_at_idx" ON "public"."push_deliveries" USING "btree" ("created_at" DESC);



CREATE INDEX "push_deliveries_recipient_user_id_idx" ON "public"."push_deliveries" USING "btree" ("recipient_user_id");



CREATE INDEX "rate_limit_events_lookup_idx" ON "public"."rate_limit_events" USING "btree" ("user_id", "action", "created_at" DESC);



CREATE INDEX "reports_listing_idx" ON "public"."reports" USING "btree" ("listing_id");



CREATE INDEX "reports_reported_user_id_idx" ON "public"."reports" USING "btree" ("reported_user_id");



CREATE INDEX "reports_reporter_id_idx" ON "public"."reports" USING "btree" ("reporter_id");



CREATE INDEX "reports_status_idx" ON "public"."reports" USING "btree" ("status");



CREATE INDEX "save_list_items_listing_idx" ON "public"."save_list_items" USING "btree" ("listing_id");



CREATE UNIQUE INDEX "save_lists_user_default_idx" ON "public"."save_lists" USING "btree" ("user_id") WHERE "is_default";



CREATE INDEX "save_lists_user_idx" ON "public"."save_lists" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "saved_searches_user_created_at_idx" ON "public"."saved_searches" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "saved_searches_user_query_unique_idx" ON "public"."saved_searches" USING "btree" ("user_id", COALESCE("query", ''::"text"), COALESCE("category", ''::"text"), COALESCE("gender", ''::"text"));



CREATE UNIQUE INDEX "shipping_addresses_one_default_idx" ON "public"."shipping_addresses" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE INDEX "shipping_addresses_user_idx" ON "public"."shipping_addresses" USING "btree" ("user_id");



CREATE INDEX "transaction_events_order_idx" ON "public"."transaction_event_logs" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "transaction_events_tx_idx" ON "public"."transaction_event_logs" USING "btree" ("transaction_id", "created_at" DESC);



CREATE INDEX "transactions_buyer_idx" ON "public"."transactions" USING "btree" ("buyer_id");



CREATE INDEX "transactions_order_idx" ON "public"."transactions" USING "btree" ("order_id");



CREATE INDEX "transactions_seller_idx" ON "public"."transactions" USING "btree" ("seller_id");



CREATE INDEX "transactions_status_idx" ON "public"."transactions" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "user_contact_hashes_user_idx" ON "public"."user_contact_hashes" USING "btree" ("user_id");



CREATE INDEX "user_contact_hashes_val_idx" ON "public"."user_contact_hashes" USING "btree" ("hash_value");



CREATE INDEX "user_devices_user_id_idx" ON "public"."user_devices" USING "btree" ("user_id");



CREATE INDEX "user_follows_followee_idx" ON "public"."user_follows" USING "btree" ("followee_id");



CREATE INDEX "user_follows_follower_idx" ON "public"."user_follows" USING "btree" ("follower_id");



CREATE INDEX "wardrobe_posts_created_idx" ON "public"."wardrobe_posts" USING "btree" ("created_at" DESC);



CREATE INDEX "wardrobe_posts_user_idx" ON "public"."wardrobe_posts" USING "btree" ("user_id");



CREATE INDEX "wardrobe_swipes_post_idx" ON "public"."wardrobe_swipes" USING "btree" ("post_id");



CREATE INDEX "wardrobe_swipes_user_idx" ON "public"."wardrobe_swipes" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "listings_price_change_trg" AFTER UPDATE ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."log_listing_price_change"();



CREATE OR REPLACE TRIGGER "message_reactions_set_conversation" BEFORE INSERT OR UPDATE ON "public"."message_reactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_message_reaction_conversation"();



CREATE OR REPLACE TRIGGER "on_follow_change" AFTER INSERT OR DELETE ON "public"."user_follows" FOR EACH ROW EXECUTE FUNCTION "public"."handle_follow_change"();



CREATE OR REPLACE TRIGGER "on_listing_like_change" AFTER INSERT OR DELETE ON "public"."listing_likes" FOR EACH ROW EXECUTE FUNCTION "public"."bump_listing_likes"();



CREATE OR REPLACE TRIGGER "on_message_insert_bump_conversation" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."bump_conversation_on_message"();



CREATE OR REPLACE TRIGGER "on_wardrobe_swipe_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."wardrobe_swipes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_wardrobe_swipe_change"();



CREATE OR REPLACE TRIGGER "push_on_message_insert" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "push"."notify_send_push"();



CREATE OR REPLACE TRIGGER "push_on_offer_status_update" AFTER UPDATE OF "offer_status" ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "push"."notify_send_push"();



CREATE OR REPLACE TRIGGER "push_on_order_insert" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "push"."notify_send_push"();



CREATE OR REPLACE TRIGGER "rate_limit_follows" BEFORE INSERT ON "public"."user_follows" FOR EACH ROW EXECUTE FUNCTION "public"."tg_rl_follows"();



CREATE OR REPLACE TRIGGER "rate_limit_likes" BEFORE INSERT ON "public"."listing_likes" FOR EACH ROW EXECUTE FUNCTION "public"."tg_rl_likes"();



CREATE OR REPLACE TRIGGER "rate_limit_listings" BEFORE INSERT ON "public"."listings" FOR EACH ROW EXECUTE FUNCTION "public"."tg_rl_listings"();



CREATE OR REPLACE TRIGGER "rate_limit_messages" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."tg_rl_messages"();



CREATE OR REPLACE TRIGGER "rate_limit_saves" BEFORE INSERT ON "public"."save_list_items" FOR EACH ROW EXECUTE FUNCTION "public"."tg_rl_saves"();



CREATE OR REPLACE TRIGGER "set_saved_searches_updated_at" BEFORE UPDATE ON "public"."saved_searches" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_addresses_touch" BEFORE UPDATE ON "public"."shipping_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_auto_create_order_transaction" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_auto_create_order_transaction"();



CREATE OR REPLACE TRIGGER "trg_guard_platform_shipping" BEFORE UPDATE OF "fulfillment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."guard_platform_shipping"();



CREATE OR REPLACE TRIGGER "trg_guard_profile_trust" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_trust_fields"();



CREATE OR REPLACE TRIGGER "trg_guard_verification_status" BEFORE INSERT OR UPDATE ON "public"."verifications" FOR EACH ROW EXECUTE FUNCTION "public"."guard_verification_status"();



CREATE OR REPLACE TRIGGER "trg_messages_touch" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_message_updated_at"();



CREATE OR REPLACE TRIGGER "trg_recalc_conversation_on_delete" AFTER DELETE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."handle_message_delete"();



CREATE OR REPLACE TRIGGER "trg_sync_offer_on_message_insert" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_sync_offer_on_message_insert"();



CREATE OR REPLACE TRIGGER "trg_validate_offer_status_update" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."validate_offer_status_update"();



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_last_sender_id_fkey" FOREIGN KEY ("last_sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_likes"
    ADD CONSTRAINT "listing_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_price_history"
    ADD CONSTRAINT "listing_price_history_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_views"
    ADD CONSTRAINT "listing_views_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listing_views"
    ADD CONSTRAINT "listing_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_parent_offer_id_fkey" FOREIGN KEY ("parent_offer_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."offers"
    ADD CONSTRAINT "offers_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_seller_pickups"
    ADD CONSTRAINT "order_seller_pickups_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_seller_pickups"
    ADD CONSTRAINT "order_seller_pickups_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_offer_message_id_fkey" FOREIGN KEY ("offer_message_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payout_methods"
    ADD CONSTRAINT "payout_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_deliveries"
    ADD CONSTRAINT "push_deliveries_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limit_events"
    ADD CONSTRAINT "rate_limit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."save_list_items"
    ADD CONSTRAINT "save_list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."save_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."save_list_items"
    ADD CONSTRAINT "save_list_items_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."save_lists"
    ADD CONSTRAINT "save_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_searches"
    ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shipping_addresses"
    ADD CONSTRAINT "shipping_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_event_logs"
    ADD CONSTRAINT "transaction_event_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."transaction_event_logs"
    ADD CONSTRAINT "transaction_event_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transaction_event_logs"
    ADD CONSTRAINT "transaction_event_logs_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_logistics_agent_id_fkey" FOREIGN KEY ("logistics_agent_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_contact_hashes"
    ADD CONSTRAINT "user_contact_hashes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_devices"
    ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verifications"
    ADD CONSTRAINT "verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wardrobe_posts"
    ADD CONSTRAINT "wardrobe_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wardrobe_swipes"
    ADD CONSTRAINT "wardrobe_swipes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."wardrobe_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wardrobe_swipes"
    ADD CONSTRAINT "wardrobe_swipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can view waitlist" ON "public"."waitlist" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Allow anonymous waitlist registration" ON "public"."waitlist" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "Buyers can create conversations" ON "public"."conversations" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "buyer_id"));



CREATE POLICY "Buyers, sellers, and admins can view orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id") OR COALESCE(((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean, false) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "Buyers, sellers, and logistics admins can view transaction even" ON "public"."transaction_event_logs" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."transactions" "t"
  WHERE (("t"."id" = "transaction_event_logs"."transaction_id") AND (("t"."buyer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("t"."seller_id" = ( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "Buyers, sellers, and logistics admins can view transactions" ON "public"."transactions" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id") OR COALESCE(((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean, false) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "Follows are viewable by everyone" ON "public"."user_follows" FOR SELECT USING (true);



CREATE POLICY "Likes viewable by everyone" ON "public"."listing_likes" FOR SELECT USING (true);



CREATE POLICY "Listings viewable by everyone" ON "public"."listings" FOR SELECT USING (true);



CREATE POLICY "Offer participants and admins can view offers" ON "public"."offers" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id") OR COALESCE(((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean, false) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "Participants and admins can view seller pickups" ON "public"."order_seller_pickups" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_seller_pickups"."order_id") AND ("o"."buyer_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR COALESCE(((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'is_admin'::"text"))::boolean, false) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("profiles"."is_admin" = true))))));



CREATE POLICY "Participants can react" ON "public"."message_reactions" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversations" "c" ON (("c"."id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_reactions"."message_id") AND ((( SELECT "auth"."uid"() AS "uid") = "c"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "c"."seller_id")))))));



CREATE POLICY "Participants can send messages" ON "public"."messages" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ((( SELECT "auth"."uid"() AS "uid") = "c"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "c"."seller_id"))))) AND
CASE
    WHEN ("kind" = 'offer'::"text") THEN (COALESCE("offer_status", 'pending'::"text") = 'pending'::"text")
    ELSE ("offer_status" IS NULL)
END));



CREATE POLICY "Participants can update conversations" ON "public"."conversations" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));



CREATE POLICY "Participants can update offer status" ON "public"."messages" FOR UPDATE USING ((("kind" = 'offer'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ((( SELECT "auth"."uid"() AS "uid") = "c"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "c"."seller_id"))))))) WITH CHECK ((("kind" = 'offer'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ((( SELECT "auth"."uid"() AS "uid") = "c"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "c"."seller_id")))))));



CREATE POLICY "Participants can view conversations" ON "public"."conversations" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));



CREATE POLICY "Participants can view messages" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND ((( SELECT "auth"."uid"() AS "uid") = "c"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "c"."seller_id"))))));



CREATE POLICY "Participants can view reactions" ON "public"."message_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "message_reactions"."conversation_id") AND ((( SELECT "auth"."uid"() AS "uid") = "c"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "c"."seller_id"))))));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Sellers can delete own listings" ON "public"."listings" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "seller_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE ((("o"."listing_id" = "listings"."id") OR ("listings"."id" = ANY (COALESCE("o"."bundle_item_ids", '{}'::"uuid"[])))) AND ("o"."status" = ANY (ARRAY['awaiting_payment'::"text", 'pending'::"text", 'paid'::"text", 'packing'::"text", 'picked'::"text", 'shifting'::"text", 'delivered'::"text", 'disputed'::"text"]))))))));



CREATE POLICY "Sellers can insert own listings" ON "public"."listings" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));



CREATE POLICY "Sellers can update own listings" ON "public"."listings" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "seller_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE ((("o"."listing_id" = "listings"."id") OR ("listings"."id" = ANY (COALESCE("o"."bundle_item_ids", '{}'::"uuid"[])))) AND ("o"."status" = ANY (ARRAY['awaiting_payment'::"text", 'pending'::"text", 'paid'::"text", 'packing'::"text", 'picked'::"text", 'shifting'::"text", 'delivered'::"text", 'disputed'::"text"]))))))));



CREATE POLICY "Senders can delete own messages" ON "public"."messages" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "sender_id"));



CREATE POLICY "Users can change their own reaction" ON "public"."message_reactions" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete own likes" ON "public"."listing_likes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own saved searches" ON "public"."saved_searches" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can follow others" ON "public"."user_follows" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "follower_id"));



CREATE POLICY "Users can insert own likes" ON "public"."listing_likes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own saved searches" ON "public"."saved_searches" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage own shipping addresses" ON "public"."shipping_addresses" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can remove their own reaction" ON "public"."message_reactions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can unfollow" ON "public"."user_follows" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "follower_id"));



CREATE POLICY "Users can update own likes" ON "public"."listing_likes" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update their own saved searches" ON "public"."saved_searches" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own saved searches" ON "public"."saved_searches" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete their own swipes" ON "public"."wardrobe_swipes" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete their own wardrobe posts" ON "public"."wardrobe_posts" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert their own swipes" ON "public"."wardrobe_swipes" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users insert their own wardrobe posts" ON "public"."wardrobe_posts" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own contact hashes" ON "public"."user_contact_hashes" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users manage own save list items" ON "public"."save_list_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."save_lists" "l"
  WHERE (("l"."id" = "save_list_items"."list_id") AND ("l"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."save_lists" "l"
  WHERE (("l"."id" = "save_list_items"."list_id") AND ("l"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users manage own save lists" ON "public"."save_lists" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users read own view history" ON "public"."listing_views" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users read their own swipes" ON "public"."wardrobe_swipes" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update their own swipes" ON "public"."wardrobe_swipes" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users update their own wardrobe posts" ON "public"."wardrobe_posts" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Wardrobe posts are viewable by everyone" ON "public"."wardrobe_posts" FOR SELECT USING (true);



ALTER TABLE "public"."account_deletion_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "addresses_delete_own" ON "public"."shipping_addresses" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "addresses_insert_own" ON "public"."shipping_addresses" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "addresses_select_own" ON "public"."shipping_addresses" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "addresses_update_own" ON "public"."shipping_addresses" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deletion_insert_own" ON "public"."account_deletion_requests" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."listing_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_views" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_seller_pickups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_seller_pickups_party_access" ON "public"."order_seller_pickups" USING ((("auth"."uid"() = "seller_id") OR (EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_seller_pickups"."order_id") AND (("o"."buyer_id" = "auth"."uid"()) OR ("o"."seller_id" = "auth"."uid"()))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true))))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payout_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payouts_delete_own" ON "public"."payout_methods" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "payouts_insert_own" ON "public"."payout_methods" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "payouts_select_own" ON "public"."payout_methods" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "payouts_update_own" ON "public"."payout_methods" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "price history readable when listing readable" ON "public"."listing_price_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE ("l"."id" = "listing_price_history"."listing_id"))));



ALTER TABLE "public"."processed_webhooks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_insert_own" ON "public"."reports" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "reporter_id"));



CREATE POLICY "reports_select_own" ON "public"."reports" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "reporter_id"));



ALTER TABLE "public"."save_list_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."save_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_searches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transaction_event_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_contact_hashes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_devices owner delete" ON "public"."user_devices" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "user_devices owner select" ON "public"."user_devices" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."user_follows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verify_insert_own" ON "public"."verifications" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "verify_select_own" ON "public"."verifications" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "verify_update_own" ON "public"."verifications" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wardrobe_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wardrobe_swipes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."listings";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."transactions";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";








































































































































































































































































REVOKE ALL ON FUNCTION "public"."accept_chat_offer"("p_offer_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_chat_offer"("p_offer_message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_chat_offer"("p_offer_message_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_support_conversations"("p_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_support_conversations"("p_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_support_conversations"("p_filter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_support_messages"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_support_messages"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_support_messages"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_users"("p_search" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_users"("p_search" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_users"("p_search" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_verifications"("p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_verifications"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_verifications"("p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_kyc"("p_user_id" "uuid", "p_decision" "text", "p_rejection_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_kyc"("p_user_id" "uuid", "p_decision" "text", "p_rejection_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_kyc"("p_user_id" "uuid", "p_decision" "text", "p_rejection_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_send_support_message"("p_conversation_id" "uuid", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_send_support_message"("p_conversation_id" "uuid", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_send_support_message"("p_conversation_id" "uuid", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_toggle_pro_seller"("p_user_id" "uuid", "p_is_pro" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_toggle_pro_seller"("p_user_id" "uuid", "p_is_pro" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_toggle_pro_seller"("p_user_id" "uuid", "p_is_pro" boolean) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."advance_escrow_status"("p_order_id" "uuid", "p_target_status" "text", "p_notes" "text", "p_courier" "text", "p_tracking_number" "text", "p_dispute_reason" "text", "p_cancel_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_escrow_status"("p_order_id" "uuid", "p_target_status" "text", "p_notes" "text", "p_courier" "text", "p_tracking_number" "text", "p_dispute_reason" "text", "p_cancel_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_escrow_status"("p_order_id" "uuid", "p_target_status" "text", "p_notes" "text", "p_courier" "text", "p_tracking_number" "text", "p_dispute_reason" "text", "p_cancel_reason" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



REVOKE ALL ON FUNCTION "public"."advance_order_fulfillment"("p_order_id" "uuid", "p_target_status" "text", "p_courier" "text", "p_tracking_number" "text", "p_supplier_order_id" "text", "p_supplier_name" "text", "p_seller_pickup_address" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_order_fulfillment"("p_order_id" "uuid", "p_target_status" "text", "p_courier" "text", "p_tracking_number" "text", "p_supplier_order_id" "text", "p_supplier_name" "text", "p_seller_pickup_address" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_order_fulfillment"("p_order_id" "uuid", "p_target_status" "text", "p_courier" "text", "p_tracking_number" "text", "p_supplier_order_id" "text", "p_supplier_name" "text", "p_seller_pickup_address" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_complete_delivered_orders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_complete_delivered_orders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_conversation_on_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_conversation_on_message"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bump_listing_likes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bump_listing_likes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_bundle_offers_for_sold_item"("p_sold_listing_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_bundle_offers_for_sold_item"("p_sold_listing_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_bundle_offers_for_sold_item"("p_sold_listing_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_cod_order"("p_order_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_cod_order"("p_order_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_cod_order"("p_order_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_order_payment_authorization"("p_order_id" "uuid", "p_stripe_event_id" "text", "p_payment_intent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_order_payment_authorization"("p_order_id" "uuid", "p_stripe_event_id" "text", "p_payment_intent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_order_received"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_order_received"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_order_received"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."counter_chat_offer"("p_parent_offer_id" "uuid", "p_amount" numeric, "p_note" "text", "p_content" "text", "p_conversation_id" "uuid", "p_sender_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."counter_chat_offer"("p_parent_offer_id" "uuid", "p_amount" numeric, "p_note" "text", "p_content" "text", "p_conversation_id" "uuid", "p_sender_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."counter_chat_offer"("p_parent_offer_id" "uuid", "p_amount" numeric, "p_note" "text", "p_content" "text", "p_conversation_id" "uuid", "p_sender_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_cod_order"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_cod_order"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_cod_order"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_chat_message"("p_message_id" "uuid", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_chat_message"("p_message_id" "uuid", "p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_chat_message"("p_message_id" "uuid", "p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dispatch_support_bot_reply"("p_conversation_id" "uuid", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."dispatch_support_bot_reply"("p_conversation_id" "uuid", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispatch_support_bot_reply"("p_conversation_id" "uuid", "p_content" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_rate_limit"("p_action" "text", "p_limit" integer, "p_window" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_rate_limit"("p_action" "text", "p_limit" integer, "p_window" interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_user_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_user_rate_limit"("p_user_id" "uuid", "p_action" "text", "p_limit" integer, "p_window" interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_save_lists"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_save_lists"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_save_lists"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."listings" TO "anon";
GRANT ALL ON TABLE "public"."listings" TO "authenticated";
GRANT ALL ON TABLE "public"."listings" TO "service_role";



GRANT ALL ON FUNCTION "public"."find_seller_other_listings"("p_seller_id" "uuid", "p_exclude_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_seller_other_listings"("p_seller_id" "uuid", "p_exclude_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_seller_other_listings"("p_seller_id" "uuid", "p_exclude_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_similar_listings"("p_listing_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."find_similar_listings"("p_listing_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_similar_listings"("p_listing_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_brand_index"("p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_brand_index"("p_query" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_brand_index"("p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_brand_index"("p_query" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_follow_state"("p_followee" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_follow_state"("p_followee" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_follow_state"("p_followee" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_order_seller_pickup"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_order_seller_pickup"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_order_seller_pickup"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recommendations"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recommendations"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recommendations"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tag_index"("p_query" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tag_index"("p_query" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tag_index"("p_query" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tag_index"("p_query" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tag_listings"("p_tag" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tag_listings"("p_tag" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tag_listings"("p_tag" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tag_listings"("p_tag" "text", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_platform_shipping"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_platform_shipping"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_profile_trust_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_profile_trust_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_verification_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_verification_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_follow_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_follow_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_message_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_message_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_wardrobe_swipe_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_wardrobe_swipe_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_listing_price_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_listing_price_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_listing_view"("p_listing_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_listing_view"("p_listing_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_listing_view"("p_listing_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_conversation_read"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_order_shipped"("p_order_id" "uuid", "p_courier" "text", "p_tracking_number" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_order_shipped"("p_order_id" "uuid", "p_courier" "text", "p_tracking_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_order_shipped"("p_order_id" "uuid", "p_courier" "text", "p_tracking_number" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_contacts"("p_hashes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_contacts"("p_hashes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."match_contacts"("p_hashes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_contacts"("p_hashes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."offer_price_ceiling"("p_listing_id" "uuid", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."offer_price_ceiling"("p_listing_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."offer_price_ceiling"("p_listing_id" "uuid", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."open_order_dispute"("p_order_id" "uuid", "p_reason" "text", "p_evidence_urls" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_order_dispute"("p_order_id" "uuid", "p_reason" "text", "p_evidence_urls" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_order_dispute"("p_order_id" "uuid", "p_reason" "text", "p_evidence_urls" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_checkout"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_method" "text", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text", "p_bundle_item_ids" "uuid"[], "p_expected_total" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_checkout"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_method" "text", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text", "p_bundle_item_ids" "uuid"[], "p_expected_total" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_checkout"("p_listing_id" "uuid", "p_buyer_id" "uuid", "p_payment_method" "text", "p_shipping_address" "jsonb", "p_offer_amount" numeric, "p_delivery_notes" "text", "p_shipping_method" "text", "p_bundle_item_ids" "uuid"[], "p_expected_total" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_device"("p_token" "text", "p_platform" "text", "p_device_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_device"("p_token" "text", "p_platform" "text", "p_device_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_device"("p_token" "text", "p_platform" "text", "p_device_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_my_contact_hashes"("p_phone_hashes" "text"[], "p_email_hashes" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_my_contact_hashes"("p_phone_hashes" "text"[], "p_email_hashes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."register_my_contact_hashes"("p_phone_hashes" "text"[], "p_email_hashes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_my_contact_hashes"("p_phone_hashes" "text"[], "p_email_hashes" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_expired_reservations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_expired_reservations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."saved_search_new_matches"("p_search_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."saved_search_new_matches"("p_search_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."saved_search_new_matches"("p_search_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_admin_user"("target_identifier" "text", "make_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_admin_user"("target_identifier" "text", "make_admin" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."payout_methods" TO "anon";
GRANT ALL ON TABLE "public"."payout_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payout_methods" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_default_payout"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_default_payout"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_payout"("p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_message_reaction_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_message_reaction_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_message_reaction_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sweep_expired_offers_and_reservations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sweep_expired_offers_and_reservations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_rl_follows"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_rl_follows"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_rl_likes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_rl_likes"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_rl_listings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_rl_listings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_rl_messages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_rl_messages"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tg_rl_saves"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tg_rl_saves"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_follow"("p_followee" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_follow"("p_followee" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_follow"("p_followee" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_message_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_message_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_auto_create_order_transaction"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_auto_create_order_transaction"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_sync_offer_on_message_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_sync_offer_on_message_insert"() TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_seller_subscription"("p_is_pro" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_seller_subscription"("p_is_pro" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_seller_subscription"("p_user_id" "uuid", "p_is_pro" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_seller_subscription"("p_user_id" "uuid", "p_is_pro" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."shipping_addresses" TO "anon";
GRANT ALL ON TABLE "public"."shipping_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_addresses" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_shipping_address_with_default"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_shipping_address_with_default"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_shipping_address_with_default"("p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_offer_status_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_offer_status_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_payment_webhook"("p_order_id" "uuid", "p_provider" "text", "p_external_transaction_id" "text", "p_amount_cents" integer, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_payment_webhook"("p_order_id" "uuid", "p_provider" "text", "p_external_transaction_id" "text", "p_amount_cents" integer, "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."waitlist_referral_count"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."waitlist_referral_count"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."waitlist_referral_count"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."waitlist_referral_count"("p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "push"."notify_send_push"() FROM PUBLIC;
























GRANT ALL ON TABLE "public"."account_deletion_requests" TO "anon";
GRANT ALL ON TABLE "public"."account_deletion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."account_deletion_requests" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."listing_likes" TO "anon";
GRANT ALL ON TABLE "public"."listing_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_likes" TO "service_role";



GRANT ALL ON TABLE "public"."listing_price_history" TO "anon";
GRANT ALL ON TABLE "public"."listing_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_price_history" TO "service_role";



GRANT ALL ON TABLE "public"."listing_views" TO "anon";
GRANT ALL ON TABLE "public"."listing_views" TO "authenticated";
GRANT ALL ON TABLE "public"."listing_views" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."offers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."offers" TO "authenticated";
GRANT ALL ON TABLE "public"."offers" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_seller_pickups" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_seller_pickups" TO "authenticated";
GRANT ALL ON TABLE "public"."order_seller_pickups" TO "service_role";



GRANT ALL ON TABLE "public"."processed_webhooks" TO "anon";
GRANT ALL ON TABLE "public"."processed_webhooks" TO "authenticated";
GRANT ALL ON TABLE "public"."processed_webhooks" TO "service_role";



GRANT ALL ON TABLE "public"."push_deliveries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."push_deliveries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."push_deliveries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."push_deliveries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_events" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rate_limit_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rate_limit_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rate_limit_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."save_list_items" TO "anon";
GRANT ALL ON TABLE "public"."save_list_items" TO "authenticated";
GRANT ALL ON TABLE "public"."save_list_items" TO "service_role";



GRANT ALL ON TABLE "public"."save_lists" TO "anon";
GRANT ALL ON TABLE "public"."save_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."save_lists" TO "service_role";



GRANT ALL ON TABLE "public"."saved_searches" TO "anon";
GRANT ALL ON TABLE "public"."saved_searches" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_searches" TO "service_role";



GRANT ALL ON TABLE "public"."transaction_event_logs" TO "anon";
GRANT ALL ON TABLE "public"."transaction_event_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."transaction_event_logs" TO "service_role";



GRANT ALL ON TABLE "public"."user_contact_hashes" TO "anon";
GRANT ALL ON TABLE "public"."user_contact_hashes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_contact_hashes" TO "service_role";



GRANT ALL ON TABLE "public"."user_devices" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."user_devices" TO "authenticated";



GRANT ALL ON TABLE "public"."user_follows" TO "anon";
GRANT ALL ON TABLE "public"."user_follows" TO "authenticated";
GRANT ALL ON TABLE "public"."user_follows" TO "service_role";



GRANT ALL ON TABLE "public"."verifications" TO "anon";
GRANT ALL ON TABLE "public"."verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."verifications" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."wardrobe_posts" TO "anon";
GRANT ALL ON TABLE "public"."wardrobe_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."wardrobe_posts" TO "service_role";



GRANT ALL ON TABLE "public"."wardrobe_swipes" TO "anon";
GRANT ALL ON TABLE "public"."wardrobe_swipes" TO "authenticated";
GRANT ALL ON TABLE "public"."wardrobe_swipes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

































-- ═════════════════════════════════════════════════════════════════════════════
-- Objects outside the dumped schemas. `supabase db dump` skips Supabase-managed
-- schemas (auth, storage, cron), so these were read from the live project on
-- 2026-10-15 and are restated here so a fresh `db reset` matches production.
--
-- Not reproducible from git (set per environment, never committed):
--   vault secrets `push_function_url` and `push_webhook_secret`
--   (read by public.notify_push → send-push edge function).
-- ═════════════════════════════════════════════════════════════════════════════

-- New auth user → profile row.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage buckets.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('listing-images', 'listing-images', true),
  ('avatars', 'avatars', true),
  ('wardrobe-images', 'wardrobe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: writes are scoped to the caller's own top-level folder.
DROP POLICY IF EXISTS "Authenticated upload avatars" ON storage.objects;
CREATE POLICY "Authenticated upload avatars" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
DROP POLICY IF EXISTS "Authenticated upload listing-images" ON storage.objects;
CREATE POLICY "Authenticated upload listing-images" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
DROP POLICY IF EXISTS "Owner delete avatars" ON storage.objects;
CREATE POLICY "Owner delete avatars" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
DROP POLICY IF EXISTS "Owner delete listing-images" ON storage.objects;
CREATE POLICY "Owner delete listing-images" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING ((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
DROP POLICY IF EXISTS "Owner update avatars" ON storage.objects;
CREATE POLICY "Owner update avatars" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
DROP POLICY IF EXISTS "Owner update listing-images" ON storage.objects;
CREATE POLICY "Owner update listing-images" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text));
DROP POLICY IF EXISTS "Users delete their own wardrobe images" ON storage.objects;
CREATE POLICY "Users delete their own wardrobe images" ON storage.objects AS PERMISSIVE FOR DELETE TO public
  USING ((bucket_id = 'wardrobe-images'::text) AND (((SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]));
DROP POLICY IF EXISTS "Users upload wardrobe images to their folder" ON storage.objects;
CREATE POLICY "Users upload wardrobe images to their folder" ON storage.objects AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((bucket_id = 'wardrobe-images'::text) AND (((SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]));

-- Scheduled jobs (cron.schedule upserts by job name).
SELECT cron.schedule('purge-rate-limit-events', '*/30 * * * *',
  $cron$ delete from public.rate_limit_events where created_at < now() - interval '2 hours' $cron$);
SELECT cron.schedule('sweep_expired_orders_and_offers', '*/5 * * * *',
  $cron$ select public.sweep_expired_offers_and_reservations(); $cron$);
