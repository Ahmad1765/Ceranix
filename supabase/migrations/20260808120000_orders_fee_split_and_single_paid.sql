-- Orders: split the Buyer Protection fee out of the charged total, correct the
-- currency default, and make "two buyers paid for one listing" impossible at
-- the database rather than hoping application code gets there first.
--
-- Background: stripe-webhook recorded session.amount_total into amount_cents.
-- amount_total is item + Buyer Protection (charged as a second Stripe line
-- item), so every order overstated the item price by the fee and any payout or
-- revenue figure derived from it was wrong by that amount on every row.

-- ── 1. Currency ─────────────────────────────────────────────────────────────
-- The app has been PKR since the switch (lib/currency.ts); the 'usd' default
-- was a leftover. The webhook passes session.currency explicitly, so this only
-- matters for any future insert path that omits it — which is exactly when a
-- wrong default does damage silently.
alter table public.orders alter column currency set default 'pkr';

-- ── 2. Fee split ────────────────────────────────────────────────────────────
-- amount_cents becomes the ITEM price alone; fee_cents carries Buyer
-- Protection. create-checkout-session now passes the split as
-- metadata[fee_cents] so the webhook never re-derives the fee formula.
alter table public.orders
  add column if not exists fee_cents integer not null default 0
    check (fee_cents >= 0);

-- Backfill. Pre-migration rows folded the fee into amount_cents at the flat
-- Rs 100 (= 10000 paisa) rate that lib/fees.ts has used since the PKR switch.
-- Guarded so it can only ever subtract a fee that was actually there, and
-- idempotent via fee_cents = 0.
--
-- VERIFY BEFORE APPLYING: `select count(*), min(created_at) from public.orders;`
-- Stripe has never been live on this project (EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
-- is unset, so STRIPE_ENABLED is false and the client runs in demo mode), so
-- this is expected to affect ZERO rows. If rows do exist and predate the PKR
-- switch they carry the old $0.70 + 5% fee and need a different formula — do
-- not run this blind against them.
update public.orders
   set fee_cents = 10000,
       amount_cents = amount_cents - 10000
 where fee_cents = 0
   and amount_cents > 10000;

-- ── 3. One paid order per listing ───────────────────────────────────────────
-- The race: two buyers both pass the pre-flight sold check, both pay, both
-- webhooks insert. Application code cannot close that window; a unique index
-- can. Partial, so refunded/canceled/refund_due rows stay unconstrained and a
-- listing can legitimately accumulate several of them.
--
-- stripe-webhook catches the resulting 23505 and records the loser as
-- status='refund_due', then refunds them through Stripe — the buyer is made
-- whole automatically instead of paying for an item that is already gone.
create unique index if not exists orders_one_paid_per_listing_idx
  on public.orders (listing_id)
  where status = 'paid';

-- ── 4. Allow the refund_due state ───────────────────────────────────────────
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'refunded', 'canceled', 'refund_due'));

comment on column public.orders.amount_cents is
  'Item price only, in minor units. Excludes Buyer Protection — see fee_cents.';
comment on column public.orders.fee_cents is
  'Buyer Protection fee in minor units. amount_cents + fee_cents = amount charged.';
comment on index public.orders_one_paid_per_listing_idx is
  'At most one paid order per listing. Duplicate payers land in refund_due.';
