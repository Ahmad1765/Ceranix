# PostHog Analytics — Design

Date: 2026-06-20
Status: Approved (pending spec review)
Scope: Tier 4 of the "100x" roadmap. First of four queued sub-projects
(others: escrow payments, push notifications, semantic/visual search).

## Goal

Instrument the app so we can answer **where the marketplace flywheel leaks** —
the list → view → offer → checkout → purchase funnel, plus activation and
retention — and have the capability for session replay and feature flags when
needed. Concretely: after this ships we can see drop-off at each funnel step and
segment by user, so the next big bets (escrow, search) target the real
bottleneck instead of a guess.

## Decisions (locked during brainstorming)

- **Product**: PostHog, full surface — product analytics **+ session replay +
  feature flags**.
- **Region**: PostHog **EU Cloud** (consistent with Sentry's EU region).
- **Privacy posture**: pragmatic. Capture starts on app load. Session replay is
  **sampled at 10%** of sessions (100% of errored sessions), with **all text
  inputs + payment/PII fields masked**. A **"Share usage data" opt-out** lives
  in Settings. No blocking consent banner in this pass.
- **Platforms**: web (Vercel) + native (Expo) from a single event taxonomy.

## Architecture

### Single-surface wrapper — `lib/analytics.ts`

The whole app imports thin helpers; nothing else touches the PostHog SDK
directly (mirrors `lib/sentry.ts`). This keeps one event schema across web +
native and makes the underlying SDK swappable — which matters because
`posthog-react-native` vs web (`posthog-js`) compatibility under
react-native-web must be verified at build time; the wrapper hides that choice
from callers.

Exports:

- `initAnalytics()` — called once at startup. No-ops without
  `EXPO_PUBLIC_POSTHOG_KEY`.
- `identify(userId, traits)` / `resetIdentity()`
- `capture(event, props?)`
- `screen(name, props?)`
- `setAnalyticsOptOut(optedOut: boolean)` / `isOptedOut()`
- `useFeatureFlag(key): boolean | string | undefined`

Behaviour: every helper is a **no-op when (a) no key is configured, or (b) the
user has opted out**. This gating is the unit-tested core.

### Wiring

- `app/_layout.tsx` — `initAnalytics()` beside `initSentry()`; auto screen
  tracking via an expo-router navigation hook → `$screen` events.
- `lib/auth.tsx` — beside the existing `setSentryUser`: `identify(userId, {
  username, is_verified })` on session; `resetIdentity()` on sign-out. No PII
  beyond username. (`seller_level` is intentionally omitted here — it needs
  `computeLevel` inputs not loaded at auth time; if wanted later, set it as a
  person property from the profile screen where those stats already exist.)
- Config exposed via `app.config.js` `extra` (`posthogKey`, `posthogHost`),
  same precedence as the Sentry DSN.

## Event taxonomy

The marketplace funnel + key actions. Snake_case event names, explicit props.

| Event | Where | Key props |
|---|---|---|
| `$screen` (auto) | router hook | screen name |
| `listing_viewed` | `app/product/[id].tsx` | listing_id, seller_id, price, category, source |
| `search_performed` | `app/(tabs)/discover.tsx` | query_length, category, results_count |
| `listing_liked` / `listing_saved` | product + cards | listing_id |
| `offer_made` | `app/conversation/[id].tsx` | listing_id, amount |
| `checkout_started` | `app/payment/[id].tsx` | listing_id, amount |
| **`purchase_completed`** | **`stripe-webhook` edge function (server-side)** | order_id, listing_id, amount_cents |
| `listing_created` | `app/(tabs)/upload.tsx` | listing_id, category, price |
| `seller_followed` | follow actions | seller_id |

**Search privacy note:** capture `query_length` (a number), not the raw query
string, to avoid logging potentially sensitive free-text by default.

### Authoritative purchase event (server-side)

`purchase_completed` fires from the `stripe-webhook` edge function on a verified
`checkout.session.completed`, using `buyer_id` as the PostHog `distinct_id`, via
PostHog's HTTP capture endpoint (EU). Rationale: the client redirect after
Stripe Checkout can be lost (closed tab, cold deep link), so a client-only
purchase event under-counts revenue and breaks the funnel's most important step.
The client still fires `checkout_started`, so both money steps are covered and
the server event is the source of truth for conversion.

This requires a **server-side PostHog project key + host** as Supabase function
secrets (`POSTHOG_KEY`, `POSTHOG_HOST`) — separate from the client
`EXPO_PUBLIC_*` vars, set the same way as the existing Stripe secrets.

## Feature flags

Scaffold `useFeatureFlag(key)` with one documented example call-site (commented,
no live experiment yet) so the capability is wired and ready. No experiment is
defined in this pass — YAGNI until there's a hypothesis to test.

## Privacy & consent

- EU Cloud host.
- Session replay: `sampleRate` 0.1, `maskAllInputs: true`, all text masked,
  payment fields explicitly masked.
- Settings → **"Share usage data"** toggle. Default on (pragmatic posture).
  Toggling off calls `setAnalyticsOptOut(true)` → PostHog opt-out (stops events
  + replay). State persisted (AsyncStorage / PostHog's own persistence).
- No raw search strings or message contents captured.

## Testing

Unit tests (Vitest) for the wrapper's gating logic — the part that's pure and
regression-prone:

- `capture` / `identify` / `screen` are no-ops when no key is configured.
- They are no-ops when the user is opted out.
- `setAnalyticsOptOut` / `isOptedOut` round-trip correctly.

The PostHog SDK itself is mocked; we assert our wrapper's decisions, not
PostHog's behaviour. (Same philosophy as the `lib/bundle` / `lib/search` tests.)

## Env / secrets

Client (`.env.local`, documented in `.env.example`, surfaced via
`app.config.js` extra):
- `EXPO_PUBLIC_POSTHOG_KEY`
- `EXPO_PUBLIC_POSTHOG_HOST` (EU)

Server (Supabase function secrets, NOT bundled):
- `POSTHOG_KEY`
- `POSTHOG_HOST`

## Out of scope (explicitly)

- Consent banner / opt-in gating (we chose pragmatic opt-out).
- Reverse-proxying PostHog through a first-party domain to dodge ad-blockers
  (revisit if event loss is material).
- Any specific A/B experiment (flags are only scaffolded).
- Dashboards/funnels are configured in the PostHog UI, not in code.

## Rollout

1. Wrapper + init + identity + env, key unset → ships as a no-op, zero risk.
2. Add event call-sites (client) + the `$screen` hook.
3. Server-side `purchase_completed` in `stripe-webhook`.
4. Settings opt-out toggle.
5. Set keys in `.env.local` + Supabase secrets → data starts flowing.
6. Build funnels/retention in the PostHog UI.

## Risks

- **`posthog-react-native` web compatibility** under react-native-web — verify
  early; the wrapper lets us drop in `posthog-js` for web if needed.
- **Replay cost/volume** — 10% sampling caps it; revisit if noisy.
- **Double-counting purchases** if both client and server fire the same event —
  avoided by design: client fires `checkout_started`, server fires
  `purchase_completed`. They are distinct steps.
