# Backend state — August 2026

Architectural baseline as of PR #4 (`feature/push-notifications` → `main`, 2026-08-09).
Scope: the structural changes, not the feature work. Every claim below is from the
migration or source file named beside it.

---

## 1. Payments: constraints in the database, not in application code

`public.orders` is the **only** source of truth for payment state. Nothing reads
`listings.is_sold` to decide whether an item is paid for.

**`supabase/migrations/20260808120000_orders_fee_split_and_single_paid.sql`**

- **Fee split.** `amount_cents` is now the **item price alone**; `fee_cents` carries
  Buyer Protection. Previously the webhook stored `session.amount_total`, which
  includes the fee charged as a second Stripe line item — so every order overstated
  the item price, and any payout or revenue figure derived from it was wrong on
  every row. `create-checkout-session` passes the split as `metadata[fee_cents]`, so
  the webhook never re-derives the fee formula.
- **Currency default** `usd` → `pkr`. Matters only for a future insert path that
  omits it — which is exactly when a wrong default does damage silently.
- **One paid order per listing**, enforced by a partial unique index:
  ```sql
  create unique index orders_one_paid_per_listing_idx
    on public.orders (listing_id) where status = 'paid';
  ```
  The race it closes: two buyers both pass the pre-flight sold check, both pay, both
  webhooks insert. Application code cannot close that window. Partial, so
  `refunded` / `canceled` / `refund_due` rows stay unconstrained and a listing can
  legitimately accumulate several.
- **`refund_due`** added to `orders_status_check`.
- Backfill is guarded (`where fee_cents = 0 and amount_cents > 10000`) and
  idempotent. Expected to affect **zero rows** — Stripe has never been live here.

**Webhook idempotency — `supabase/functions/stripe-webhook/`**

Two distinct unique violations, both surfacing as Postgres `23505`, disambiguated by
the index named in the error text (`order.ts:94-103`):

| Violated index | Meaning | Action |
|---|---|---|
| unique `stripe_session_id` | Stripe retried an event already recorded | `duplicate_event` → ack |
| `orders_one_paid_per_listing_idx` | another buyer got there first | `listing_taken` → `refund_due` |

The loser is refunded through Stripe with `Idempotency-Key: refund_${sessionId}`, so
a retry returns the original refund rather than issuing a second. The function
answers **500 until the refund lands**, so Stripe keeps retrying — acknowledging a
charge we failed to refund would strand a buyer's money.

---

## 2. Egress: thumbnails, 51.8× reduction

**`supabase/migrations/20260802134206_add_listing_thumbnails.sql`** + `lib/images.ts`
+ `lib/upload.ts`

- `listings.thumbnails` stores a card-sized copy alongside each full photo.
- Uploads write both: full at `1440px / q0.70`, thumb at **`640px long edge / q0.72`**.
  640 is chosen against the widest realistic tile — a 4-column tablet grid at ~288px
  wants 432px, and a portrait 3:4 photo at 640 long edge is 480 wide. Quality is
  *higher* than the full-size 0.70 on purpose: JPEG artefacts are proportionally more
  visible at small dimensions.
- `cardImageUrl()` prefers the thumbnail **per index**, falling back to the full image
  when the arrays are ragged (a thumbnail upload can fail for one photo and succeed
  for another) and treating an empty-string thumbnail as missing rather than
  rendering nothing.
- Measured effect on one grid render: **28.7 MB → 554 KB (51.8×)**.

---

## 3. CI: strict gating

`.github/workflows/ci.yml` is the real gate. `required-checks` aggregates
**typecheck, lint, unit-tests, web-build, audit** — a job not in that list is a red
badge that blocks nothing.

- **`npm audit` is now gating.** It previously always `exit 0`'d: advisories were
  reported and never enforced. It now fails on any production advisory whose GHSA id
  is not in an explicit in-workflow allowlist, and fails *closed* if `audit.json` is
  missing or unparseable rather than passing blind.
- **Advisories 35 → 12.** In-range fixes for brace-expansion / js-yaml / nanoid /
  fast-uri; three **stale `overrides` that were pinning to since-vulnerable versions**
  refreshed (shell-quote `1.8.4→1.10.0`, tar `7.5.16→7.5.22`, undici `6.27.0→6.28.0`);
  postcss `8.5.26` and uuid `11.1.1` added. npm's own fix wanted `expo@57` or a
  `react-native` downgrade to `0.80.3` — both semver-major, both off the table on SDK 54.
- **Allowlisted:** `GHSA-5p2g-fcmc-qvqq`, `GHSA-w3rx-r6r6-pgpr` — two `image-size`
  advisories reaching us through metro. `image-size` has **no published release
  outside the vulnerable `<=2.0.2` range**, so there is nothing to override to. Both
  are build-time DoS parsers. Delete both lines the moment upstream ships.
- **`dependency-review.yml` deleted.** It requires GitHub's Dependency graph, which is
  off for this repo and settable only from the Settings UI — the
  `security_and_analysis` API accepts `dependency_graph` and silently ignores it. It
  was a permanently-red check with no in-repo fix.
- **CodeQL green.** Four high findings fixed; 14 alerts dismissed *with reasons*
  (12 `file-access-to-http` in e2e helpers and a one-off script, 2 `unknown-directive`
  for Reanimated `'worklet'`).
- E2E runs on feature branches and PRs against the real backend, and fails fast with
  one clear message when the four required secrets are absent.

> `main` currently has **no branch protection**, so none of the above hard-blocks a
> merge. Turning it on and requiring `Required checks` is what makes the gate real.

---

## 4. Upload integrity: zero-dependency truncation guards

**`lib/imageIntegrity.ts`**, called from `lib/upload.ts:245`.

- **Root cause it closes:** `lib/upload.ts` compresses every picked photo and, on any
  compression failure, deliberately falls back to the **original bytes** so a broken
  re-encode never blocks a listing. Correct for benign failures (tainted canvas, CORS
  refusal) — but it also swallowed the one case where the bytes themselves are bad. A
  truncated file fails to decode, hits the same `catch`, and gets uploaded raw, and a
  DB row is created pointing at an unrenderable image.
- **Motivating artifact:** listing "Testtt" — a 382 KB JPEG with a valid `FFD8FF`
  start marker and **no `FFD9` end marker**. Rendered broken in the app and later
  crashed the thumbnail backfill with *"premature end of JPEG image"*.
- **Checks** — pure `Uint8Array`, no image-parsing dependency, no decode:
  - `< 100 bytes` → reject (too small to be a photo); `0 bytes` → reject.
  - **JPEG**: `FFD8FF` start, and `FFD9` present within the last **64 bytes**. The
    window exists because real encoders append EXIF slack after EOI; a genuinely
    truncated file is missing `FFD9` entirely rather than merely displacing it.
  - **PNG**: 8-byte signature + `IEND` chunk including its CRC.
  - **WebP**: `RIFF`/`WEBP` header, and the header's own declared payload size must
    not exceed the actual byte length.
  - **HEIC/HEIF and anything else: pass.** There is no cheap framing check worth
    trusting, and on native they are re-encoded to JPEG before this runs. *"Not
    checked" is not "corrupt."*
- **Placement:** the guard runs **before the storage write**, which is before the DB
  insert. `lib/upload.ts` has exactly **one** `.upload(` call site (`uploadToPath`),
  so listing photos, thumbnails, avatars, banners and wardrobe images all funnel
  through it. Rejection surfaces as a user-facing "that photo looks incomplete" error.
- It validates **framing, not pixels** — it answers *"were all the bytes written?"*,
  which is the failure mode a dropped upload or interrupted copy produces. Decoding
  every photo on the JS thread would cost more than the bug it prevents.
- Covered by `lib/imageIntegrity.test.ts` (deliberately free of react-native / expo /
  supabase imports so vitest can run it in plain node).

---

## Known gaps

- **Stripe secrets unset** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). The whole
  payments slice above — fee split, duplicate-payer refund, webhook idempotency — is
  **unexercised in production** until they are set.
- **Leaked-password protection** still off in Supabase Auth settings.
- **`image-size` advisories allowlisted**, not fixed. Recheck when upstream ships.
- **No branch protection on `main`.**
