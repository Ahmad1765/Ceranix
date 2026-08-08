-- Close a "buy anything for Rs 1" hole in the offer flow.
--
-- The bug: public.messages had a BEFORE UPDATE trigger
-- (trg_validate_offer_status_update) enforcing that only the counterparty may
-- move an offer to 'accepted' — but NOTHING validated offer_status at INSERT.
-- The INSERT policy only checked "auth.uid() = sender_id" and "I am in this
-- conversation", so any signed-in user could:
--
--   1. open a conversation on any listing as the buyer (allowed by design), then
--   2. insert kind='offer' with offer_status='accepted' and metadata
--      {"amount": 1} in a single INSERT.
--
-- No UPDATE ever happens, so the validator never fires. create-checkout-session
-- then finds that row via (kind='offer', offer_status='accepted',
-- conversations.buyer_id = caller) and charges the attacker's self-set price.
-- Verified exploitable against a live Rs 8,000 listing under RLS on 2026-08-08
-- (the probe was rolled back; forensics found no prior abuse — all 9 accepted
-- offers in the table had updated_at > created_at, i.e. a real accept).
--
-- The fix belongs in the INSERT policy, not in application code: it is the one
-- gate every client write already routes through, and service_role (our edge
-- functions) legitimately bypasses RLS.

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages
  for insert
  with check (
    (select auth.uid()) = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
    -- A newly sent offer is ALWAYS pending; reaching any settled state requires
    -- an UPDATE, which trg_validate_offer_status_update polices (counterparty
    -- accepts/declines, sender withdraws, service role expires).
    -- Non-offer messages carry no offer_status at all — verified zero rows
    -- violate this before applying.
    and case
          when kind = 'offer' then coalesce(offer_status, 'pending') = 'pending'
          else offer_status is null
        end
  );

-- Unrelated one-character correctness fix in the same flow: the conversation
-- preview hardcoded a US dollar sign. App money is PKR (lib/currency.ts).
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

revoke execute on function public.bump_conversation_on_message() from public, anon, authenticated;
