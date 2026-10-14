-- Support bot anti-spoofing tests (supabase/migrations/20261015010000_support_bot_fixed_replies.sql).
-- Run after all migrations on a throwaway database; raises on the first failure. Run by CI.

-- Functional test for 20261015010000_support_bot_fixed_replies.sql. Raises on failure.
\set ON_ERROR_STOP 1
alter table auth.users disable trigger on_auth_user_created;

do $t$
declare
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  v_conv uuid;
  v_welcome text;
  v_msg public.messages;
  v_n int;
  ok boolean;
begin
  insert into auth.users (id) values (v_bot), (v_a), (v_b) on conflict do nothing;
  insert into public.profiles (id, username) values (v_bot, 'grabsty_support'), (v_a, 'user_a'), (v_b, 'user_b') on conflict do nothing;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (v_a, v_bot, null) returning id into v_conv;
  select content into v_welcome from public.support_bot_replies where key = 'welcome';

  -- As user A (participant)
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  begin
    perform public.dispatch_support_bot_reply(v_conv, 'Refund approved. Your money is on the way.');
    raise exception 'FAIL: arbitrary text was accepted';
  exception when insufficient_privilege then
    if sqlerrm not like 'Support bot can only send%' then raise exception 'FAIL: wrong rejection: %', sqlerrm; end if;
  end;

  v_msg := public.dispatch_support_bot_reply(v_conv, v_welcome);
  if v_msg.sender_id <> v_bot or v_msg.content <> v_welcome then raise exception 'FAIL: canned reply not posted as bot'; end if;

  begin
    perform 1 from public.support_bot_replies;
    raise exception 'FAIL: users can read support_bot_replies directly';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.messages (conversation_id, sender_id, content) values (v_conv, v_bot, 'spoof');
    raise exception 'FAIL: direct insert as bot allowed';
  exception when insufficient_privilege then
    if sqlerrm not like '%row-level security%' then raise exception 'FAIL: wrong rejection: %', sqlerrm; end if;
  end;
  execute 'reset role';

  -- As user B (not a participant)
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  begin
    perform public.dispatch_support_bot_reply(v_conv, v_welcome);
    raise exception 'FAIL: non-participant could post';
  exception when insufficient_privilege then
    if sqlerrm not like 'Not authorized%' then raise exception 'FAIL: wrong rejection: %', sqlerrm; end if;
  end;
  execute 'reset role';

  -- As anon
  execute 'set local role anon';
  begin
    perform public.dispatch_support_bot_reply(v_conv, v_welcome);
    raise exception 'FAIL: anon could call dispatch';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.post_dispute_support_notice(gen_random_uuid());
    raise exception 'FAIL: anon could call post_dispute_support_notice';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- Every seeded reply round-trips exactly (no CRLF / escaping drift).
  select count(*) into v_n from public.support_bot_replies where content like '%' || chr(13) || '%';
  if v_n > 0 then raise exception 'FAIL: carriage returns in stored replies'; end if;

  raise notice 'PASS: dispatch_support_bot_reply';
end
$t$;

-- Functional test for post_dispute_support_notice. Runs after support_bot_test.sql. Raises on failure.
\set ON_ERROR_STOP 1

do $t$
declare
  v_bot uuid := '00000000-0000-0000-0000-000000000001';
  v_buyer uuid := 'cccccccc-0000-4000-8000-000000000003';
  v_seller uuid := 'dddddddd-0000-4000-8000-000000000004';
  v_listing uuid;
  v_order uuid;
  v_conv uuid;
  v_m1 public.messages;
  v_m2 public.messages;
  v_n int;
begin
  insert into auth.users (id) values (v_bot), (v_buyer), (v_seller) on conflict do nothing;
  insert into public.profiles (id, username) values (v_bot, 'grabsty_support'), (v_buyer, 'buyer_c'), (v_seller, 'seller_d') on conflict do nothing;
  insert into public.listings (seller_id, title, price, category, gender, condition)
    values (v_seller, 'Test jacket', 5000, 'clothing', 'men', 'good') returning id into v_listing;
  insert into public.orders (listing_id, buyer_id, seller_id, amount_cents, status, fulfillment_status, dispute_reason)
    values (v_listing, v_buyer, v_seller, 500000, 'delivered', 'delivered', null) returning id into v_order;
  insert into public.conversations (buyer_id, seller_id, listing_id) values (v_buyer, v_bot, null) returning id into v_conv;

  -- Buyer, order not disputed yet -> refused.
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_buyer::text, true);
  execute 'set local role authenticated';
  begin
    perform public.post_dispute_support_notice(v_order);
    raise exception 'FAIL: notice posted for a non-disputed order';
  exception when others then
    if sqlerrm not like 'This order is not under dispute%' then raise exception 'FAIL: wrong rejection: %', sqlerrm; end if;
  end;
  execute 'reset role';

  update public.orders set status = 'disputed', fulfillment_status = 'disputed',
    dispute_reason = 'Item arrived torn' where id = v_order;

  -- Seller can't post the buyer's notice.
  perform set_config('request.jwt.claims', json_build_object('sub', v_seller, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_seller::text, true);
  execute 'set local role authenticated';
  begin
    perform public.post_dispute_support_notice(v_order);
    raise exception 'FAIL: seller posted the notice';
  exception when insufficient_privilege then
    if sqlerrm not like 'Only the buyer%' then raise exception 'FAIL: wrong rejection: %', sqlerrm; end if;
  end;
  execute 'reset role';

  -- Buyer posts it; text comes from the order, posted as the bot; second call is a no-op.
  perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_buyer::text, true);
  execute 'set local role authenticated';
  v_m1 := public.post_dispute_support_notice(v_order);
  v_m2 := public.post_dispute_support_notice(v_order);
  execute 'reset role';

  if v_m1.sender_id <> v_bot then raise exception 'FAIL: notice not from bot'; end if;
  if v_m1.content not like '%**Reason:** Item arrived torn%' then raise exception 'FAIL: reason missing: %', v_m1.content; end if;
  if v_m1.content not like '%#' || upper(left(replace(v_order::text, '-', ''), 8)) || '%' then raise exception 'FAIL: order ref missing'; end if;
  if position(E'\n\n' in v_m1.content) = 0 then raise exception 'FAIL: newlines not rendered'; end if;
  if v_m1.id <> v_m2.id then raise exception 'FAIL: notice posted twice'; end if;
  select count(*) into v_n from public.messages where conversation_id = v_conv and metadata->>'dispute_order_id' = v_order::text;
  if v_n <> 1 then raise exception 'FAIL: expected 1 notice, got %', v_n; end if;

  raise notice 'PASS: post_dispute_support_notice';
end
$t$;
