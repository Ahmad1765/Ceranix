-- Orders are the durable record of completed Stripe checkouts. Rows are only
-- ever written by the stripe-webhook edge function (service role) after a
-- verified checkout.session.completed event — clients can read, never write.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  -- unique => webhook retries are idempotent (insert ... on conflict do nothing)
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  offer_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'paid' check (status in ('pending','paid','refunded','canceled')),
  created_at timestamptz not null default now()
);

create index orders_buyer_idx on public.orders(buyer_id, created_at desc);
create index orders_seller_idx on public.orders(seller_id, created_at desc);
create index orders_listing_idx on public.orders(listing_id);

alter table public.orders enable row level security;

create policy "Buyers and sellers can view own orders" on public.orders
  for select to authenticated
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

-- No INSERT/UPDATE/DELETE policies on purpose: only service_role (bypasses RLS)
-- may write orders.
