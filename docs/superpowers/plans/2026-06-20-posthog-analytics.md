# PostHog Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument the app with PostHog (analytics + replay + flags) behind a single-surface wrapper, so the marketplace funnel can be measured.

**Architecture:** Pure, unit-tested helpers (`lib/analyticsEvents.ts`) build event props + decide whether to track; a thin SDK wrapper (`lib/analytics.ts`) is a no-op until configured and mirrors `lib/sentry.ts`. Events fire from key screens; the authoritative `purchase_completed` fires server-side from the `stripe-webhook` edge function.

**Tech Stack:** Expo (React Native + react-native-web), `posthog-react-native`, Supabase Edge Functions (Deno), Vitest.

## Global Constraints

- PostHog **EU Cloud**. Client host `https://eu.i.posthog.com` (assets `https://eu-assets.i.posthog.com`).
- Every wrapper helper is a **no-op when no key is configured OR the user has opted out**.
- Client config via `app.config.js` `extra` (`posthogKey`, `posthogHost`), read with the same precedence as the Sentry DSN (extra-first, then `process.env.EXPO_PUBLIC_*`).
- Client env vars: `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`. Server secrets (Supabase): `POSTHOG_KEY`, `POSTHOG_HOST`. Never bundle server secrets.
- Event names are snake_case. **Never capture raw search text or message contents** — only `query_length` (a number).
- Session replay: `sampleRate` 0.1, mask all inputs/text.
- Opt-out default = **on** (data flows unless user disables in Settings).
- Run `npm test`, `npm run typecheck`, `npm run lint` — all must stay green.

---

### Task 1: Pure analytics helpers (`lib/analyticsEvents.ts`)

The dependency-free core: the capture gate + event-prop builders. No SDK, no React Native — so it unit-tests in Node. The privacy rule (search captures length, never the raw string) is enforced and tested here.

**Files:**
- Create: `lib/analyticsEvents.ts`
- Test: `lib/analyticsEvents.test.ts`

**Interfaces:**
- Produces:
  - `shouldTrack(state: { hasKey: boolean; optedOut: boolean }): boolean`
  - `buildListingViewedProps(listing: { id: string; seller_id: string; price: number; category: string }, source: string): Record<string, unknown>`
  - `buildSearchProps(query: string, category: string | null, resultsCount: number): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/analyticsEvents.test.ts
import { describe, it, expect } from 'vitest';
import {
  shouldTrack,
  buildListingViewedProps,
  buildSearchProps,
} from '@/lib/analyticsEvents';

describe('shouldTrack', () => {
  it('tracks only when a key exists and the user has not opted out', () => {
    expect(shouldTrack({ hasKey: true, optedOut: false })).toBe(true);
    expect(shouldTrack({ hasKey: false, optedOut: false })).toBe(false);
    expect(shouldTrack({ hasKey: true, optedOut: true })).toBe(false);
    expect(shouldTrack({ hasKey: false, optedOut: true })).toBe(false);
  });
});

describe('buildListingViewedProps', () => {
  it('extracts the funnel-relevant fields plus the source', () => {
    const props = buildListingViewedProps(
      { id: 'l1', seller_id: 's1', price: 42, category: 'shoes' },
      'feed',
    );
    expect(props).toEqual({
      listing_id: 'l1',
      seller_id: 's1',
      price: 42,
      category: 'shoes',
      source: 'feed',
    });
  });
});

describe('buildSearchProps — privacy', () => {
  it('captures the query LENGTH, never the raw query string', () => {
    const raw = 'secret brand name';
    const props = buildSearchProps(raw, 'bags', 7);
    expect(props.query_length).toBe(raw.length);
    expect(props.category).toBe('bags');
    expect(props.results_count).toBe(7);
    // The raw text must never appear anywhere in the captured props.
    expect(JSON.stringify(props)).not.toContain('secret');
  });

  it('normalizes a null category', () => {
    const props = buildSearchProps('x', null, 0);
    expect(props.category).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/analyticsEvents.test.ts`
Expected: FAIL — cannot find module `@/lib/analyticsEvents`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/analyticsEvents.ts
// Pure analytics helpers — no SDK, no React Native, so they unit-test in Node.
// The SDK wrapper (lib/analytics.ts) composes these.

/** Tracking is on only when configured AND the user has not opted out. */
export function shouldTrack(state: { hasKey: boolean; optedOut: boolean }): boolean {
  return state.hasKey && !state.optedOut;
}

export function buildListingViewedProps(
  listing: { id: string; seller_id: string; price: number; category: string },
  source: string,
): Record<string, unknown> {
  return {
    listing_id: listing.id,
    seller_id: listing.seller_id,
    price: listing.price,
    category: listing.category,
    source,
  };
}

// Privacy: capture the LENGTH of the query, never the raw text (it can carry
// sensitive free-text). category/resultsCount are safe structured values.
export function buildSearchProps(
  query: string,
  category: string | null,
  resultsCount: number,
): Record<string, unknown> {
  return {
    query_length: query.length,
    category,
    results_count: resultsCount,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/analyticsEvents.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run typecheck
git add lib/analyticsEvents.ts lib/analyticsEvents.test.ts
git commit -m "feat(analytics): pure event-prop builders + capture gate"
```

---

### Task 2: SDK wrapper + init + env (`lib/analytics.ts`)

The single surface. No-op until `EXPO_PUBLIC_POSTHOG_KEY` is set. Mirrors `lib/sentry.ts`.

**Files:**
- Create: `lib/analytics.ts`
- Modify: `app.config.js` (add `posthogKey`, `posthogHost` to `extra`)
- Modify: `.env.example` (document the two client vars)
- Modify: `app/_layout.tsx` (call `initAnalytics()` next to `initSentry()`)
- Modify: `package.json` (adds `posthog-react-native` dependency)

**Interfaces:**
- Consumes: `shouldTrack`, `buildListingViewedProps`, `buildSearchProps` from Task 1.
- Produces:
  - `initAnalytics(): void`
  - `analyticsEnabled: boolean`
  - `identify(userId: string, traits?: Record<string, unknown>): void`
  - `resetIdentity(): void`
  - `capture(event: string, props?: Record<string, unknown>): void`
  - `screen(name: string, props?: Record<string, unknown>): void`
  - `setAnalyticsOptOut(optedOut: boolean): void`
  - `isOptedOut(): boolean`
  - `useFeatureFlag(key: string): boolean | string | undefined`
  - re-exports `buildListingViewedProps`, `buildSearchProps` for call-sites.

- [ ] **Step 1: Install the SDK**

Run: `npx expo install posthog-react-native`
Expected: dependency added to `package.json`.

- [ ] **Step 2: Add config to `app.config.js`**

In the `extra` object (next to `sentryDsn`), add:

```js
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
```

- [ ] **Step 3: Document env in `.env.example`**

Append after the Sentry block:

```bash
# PostHog product analytics (EU cloud). Leave blank to disable (all analytics
# helpers become no-ops). Get the key from PostHog → Project Settings.
EXPO_PUBLIC_POSTHOG_KEY=
EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

- [ ] **Step 4: Write the wrapper**

```ts
// lib/analytics.ts
// Centralized PostHog wiring. The rest of the app imports these thin helpers
// and never touches the SDK directly (mirrors lib/sentry.ts). Every helper is a
// no-op when there's no key OR the user has opted out.
import PostHog, { usePostHog } from 'posthog-react-native';
import Constants from 'expo-constants';
import {
  shouldTrack,
  buildListingViewedProps,
  buildSearchProps,
} from '@/lib/analyticsEvents';

export { buildListingViewedProps, buildSearchProps };

const extra = (Constants.expoConfig?.extra ?? {}) as {
  posthogKey?: string;
  posthogHost?: string;
};
const apiKey = (extra.posthogKey ?? process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '').trim();
const host =
  (extra.posthogHost ?? process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com').trim();

export const analyticsEnabled = !!apiKey;

let client: PostHog | null = null;
let optedOut = false;

export function initAnalytics(): void {
  if (!apiKey) {
    if (__DEV__) console.warn('[analytics] EXPO_PUBLIC_POSTHOG_KEY not set — analytics disabled.');
    return;
  }
  client = new PostHog(apiKey, {
    host,
    // Session replay: sampled + mask everything (privacy posture).
    enableSessionReplay: true,
    sessionReplayConfig: {
      maskAllTextInputs: true,
      maskAllImages: false,
    },
  });
  client.optedOut = optedOut;
}

function active(): PostHog | null {
  return shouldTrack({ hasKey: !!client, optedOut }) ? client : null;
}

export function identify(userId: string, traits: Record<string, unknown> = {}): void {
  active()?.identify(userId, traits);
}

export function resetIdentity(): void {
  client?.reset();
}

export function capture(event: string, props: Record<string, unknown> = {}): void {
  active()?.capture(event, props);
}

export function screen(name: string, props: Record<string, unknown> = {}): void {
  active()?.screen(name, props);
}

export function isOptedOut(): boolean {
  return optedOut;
}

export function setAnalyticsOptOut(next: boolean): void {
  optedOut = next;
  if (!client) return;
  if (next) client.optOut();
  else client.optIn();
}

/** Read a PostHog feature flag. Returns undefined when analytics is off. */
export function useFeatureFlag(key: string): boolean | string | undefined {
  const ph = usePostHog();
  if (!analyticsEnabled) return undefined;
  return ph?.getFeatureFlag(key);
}
```

- [ ] **Step 5: Initialize in `app/_layout.tsx`**

Add the import next to the Sentry import:

```tsx
import { initAnalytics } from '@/lib/analytics';
```

And call it right after `initSentry();`:

```tsx
initAnalytics();
```

- [ ] **Step 6: Verify typecheck + lint + no-op behavior**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors. With no key set, `analyticsEnabled` is `false` and the app behaves exactly as before (helpers no-op).

- [ ] **Step 7: Commit**

```bash
git add lib/analytics.ts app.config.js .env.example app/_layout.tsx package.json package-lock.json
git commit -m "feat(analytics): PostHog SDK wrapper + init (no-op until keyed)"
```

---

### Task 3: User identity (`lib/auth.tsx`)

Tie analytics to the signed-in user, beside the existing Sentry binding.

**Files:**
- Modify: `lib/auth.tsx`

**Interfaces:**
- Consumes: `identify`, `resetIdentity` from Task 2.

- [ ] **Step 1: Add the import**

Next to `import { setSentryUser } from '@/lib/sentry';`:

```tsx
import { identify, resetIdentity } from '@/lib/analytics';
```

- [ ] **Step 2: Extend the existing identity effect**

Find the effect that calls `setSentryUser(session?.user?.id ?? null)` and add analytics identity alongside it:

```tsx
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    setSentryUser(uid);
    if (uid) {
      identify(uid, {
        username: profile?.username,
        is_verified: profile?.is_verified ?? false,
      });
    } else {
      resetIdentity();
    }
  }, [session?.user?.id, profile?.username, profile?.is_verified]);
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.tsx
git commit -m "feat(analytics): identify the signed-in user (no PII beyond username)"
```

---

### Task 4: Auto screen tracking (`app/_layout.tsx`)

Emit a `$screen` event on every expo-router navigation.

**Files:**
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `screen` from Task 2.

- [ ] **Step 1: Add imports**

```tsx
import { usePathname } from 'expo-router';
import { screen } from '@/lib/analytics';
```

- [ ] **Step 2: Add a screen-tracking effect inside `RootLayout`**

After the existing hooks in `RootLayout`:

```tsx
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) screen(pathname);
  }, [pathname]);
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(analytics): auto screen tracking via expo-router pathname"
```

---

### Task 5: Client funnel events

Fire the funnel events from their screens, using the pure builders for the two that have them.

**Files:**
- Modify: `app/product/[id].tsx` (listing_viewed)
- Modify: `app/(tabs)/discover.tsx` (search_performed)
- Modify: `app/conversation/[id].tsx` (offer_made)
- Modify: `app/payment/[id].tsx` (checkout_started)
- Modify: `app/(tabs)/upload.tsx` (listing_created)

**Interfaces:**
- Consumes: `capture`, `buildListingViewedProps`, `buildSearchProps` from Task 2.

- [ ] **Step 1: `listing_viewed` in `app/product/[id].tsx`**

Add the import:

```tsx
import { capture, buildListingViewedProps } from '@/lib/analytics';
```

In the effect that sets the loaded `listing` (after `setListing({...})` on a successful fetch), fire once per listing:

```tsx
        capture('listing_viewed', buildListingViewedProps(
          { id: row.id, seller_id: row.seller_id, price: row.price, category: row.category },
          'product_page',
        ));
```

- [ ] **Step 2: `search_performed` in `app/(tabs)/discover.tsx`**

Add the import:

```tsx
import { capture, buildSearchProps } from '@/lib/analytics';
```

In the debounced server-search effect, after server results land (`if (res.ok) setServerResults(res.rows)`), add:

```tsx
        if (res.ok) capture('search_performed', buildSearchProps(q, browseCat, res.rows.length));
```

- [ ] **Step 3: `offer_made` in `app/conversation/[id].tsx`**

Add the import:

```tsx
import { capture } from '@/lib/analytics';
```

In `handleSendOffer`, after a successful `sendOffer` (`if (saved) { ... }`):

```tsx
          capture('offer_made', { listing_id: conv?.listing_id ?? null, amount });
```

- [ ] **Step 4: `checkout_started` in `app/payment/[id].tsx`**

Add the import:

```tsx
import { capture } from '@/lib/analytics';
```

At the point the user initiates payment (just before `createCheckoutSession`/redirect), add:

```tsx
    capture('checkout_started', { listing_id: listingId, amount });
```

(Use the existing local variable names for the listing id + amount on that screen.)

- [ ] **Step 5: `listing_created` in `app/(tabs)/upload.tsx`**

Add the import:

```tsx
import { capture } from '@/lib/analytics';
```

After a listing is successfully created (where the new row/id is available, before navigation away):

```tsx
    capture('listing_created', { listing_id: created.id, category: created.category, price: created.price });
```

(Use the existing variable holding the created listing on that screen.)

- [ ] **Step 6: `listing_liked` / `listing_saved` in `app/product/[id].tsx`**

The `capture` import is already added in Step 1. In `handleHeartPress`, after a
successful like toggle (`const next = await toggleLike(...)`), fire only on the
like (not unlike):

```tsx
        if (next) capture('listing_liked', { listing_id: productIdParam });
```

Where the bookmark/save succeeds (the save handler that flips `saved` true), add:

```tsx
        capture('listing_saved', { listing_id: productIdParam });
```

- [ ] **Step 7: `seller_followed` in `app/product/[id].tsx` and `app/user/[id].tsx`**

In `app/product/[id].tsx`, where the follow toggle succeeds and the new state is
"following", add (the `capture` import is already present):

```tsx
        if (next.isFollowing) capture('seller_followed', { seller_id: sellerId });
```

In `app/user/[id].tsx`, add the import:

```tsx
import { capture } from '@/lib/analytics';
```

In `useToggleFollow`'s success path on that screen — i.e. the `onError`-paired
mutation call in `handleFollowToggle` — capture when the result is following.
Use the mutation's `onSuccess` option:

```tsx
    toggleFollowM.mutate(
      { currentlyFollowing: followed },
      {
        onSuccess: (next) => {
          if (next.isFollowing) capture('seller_followed', { seller_id: userId });
        },
        onError: (e: any) =>
          toast.show(e?.message ?? 'Could not update follow', {
            variant: 'default',
            icon: 'alert-triangle',
          }),
      },
    );
```

- [ ] **Step 8: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add "app/product/[id].tsx" "app/(tabs)/discover.tsx" "app/conversation/[id].tsx" "app/payment/[id].tsx" "app/(tabs)/upload.tsx" "app/user/[id].tsx"
git commit -m "feat(analytics): fire client funnel events (view/search/like/save/offer/checkout/create/follow)"
```

---

### Task 6: Authoritative `purchase_completed` (server-side)

Fire the money event from the webhook so it can't be lost to a dropped client redirect.

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`
- Modify: `.env.example` (document the two server secrets)

**Interfaces:**
- Standalone — posts directly to PostHog's HTTP capture API.

- [ ] **Step 1: Add a capture helper + call in the webhook**

Near the top of the handler module, add a helper:

```ts
// Best-effort PostHog capture from the edge function. Never throws — analytics
// must not break the webhook. distinct_id is the buyer so the event ties to the
// same person as the client-side funnel.
async function capturePurchase(distinctId: string, props: Record<string, unknown>) {
  const key = Deno.env.get('POSTHOG_KEY');
  const host = Deno.env.get('POSTHOG_HOST') ?? 'https://eu.i.posthog.com';
  if (!key) return;
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: 'purchase_completed',
        distinct_id: distinctId,
        properties: props,
      }),
    });
  } catch (e) {
    console.error('[stripe-webhook] posthog capture failed', e);
  }
}
```

In the `checkout.session.completed` branch, right after the order row is successfully inserted (where `buyer_id`, `listing_id`, `amount_cents`, and the new order id are known), add:

```ts
    await capturePurchase(order.buyer_id, {
      order_id: order.id,
      listing_id: order.listing_id,
      amount_cents: order.amount_cents,
    });
```

(Use the actual variable holding the inserted order row on that branch.)

- [ ] **Step 2: Document the server secrets in `.env.example`**

In the Stripe secrets comment block, add:

```bash
#   supabase secrets set POSTHOG_KEY=phc_xxx
#   supabase secrets set POSTHOG_HOST=https://eu.i.posthog.com
```

- [ ] **Step 3: Typecheck guard (edge functions are excluded from app tsc)**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors (the edge function is in the tsconfig/eslint ignore set; this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts .env.example
git commit -m "feat(analytics): authoritative server-side purchase_completed from stripe-webhook"
```

---

### Task 7: Settings opt-out toggle

Let users turn analytics off (privacy posture).

**Files:**
- Modify: `app/settings.tsx`

**Interfaces:**
- Consumes: `isOptedOut`, `setAnalyticsOptOut` from Task 2.

- [ ] **Step 1: Add the import**

```tsx
import { isOptedOut, setAnalyticsOptOut } from '@/lib/analytics';
```

- [ ] **Step 2: Add local state mirroring the opt-out**

In the settings component body:

```tsx
  const [shareUsage, setShareUsage] = useState(!isOptedOut());
```

- [ ] **Step 3: Add a Switch row in the privacy/about section**

Place a row alongside the existing settings toggles (reuse the screen's existing `Switch` row pattern):

```tsx
  <Switch
    value={shareUsage}
    onValueChange={(v) => {
      setShareUsage(v);
      setAnalyticsOptOut(!v); // sharing on => opted-out false
    }}
  />
```

with a label "Share usage data" and a subtitle "Helps us improve the app. No personal content is collected."

- [ ] **Step 4: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add app/settings.tsx
git commit -m "feat(analytics): Settings 'Share usage data' opt-out toggle"
```

---

## Final verification

- [ ] `npm test` — all unit tests pass (Task 1 added analyticsEvents tests).
- [ ] `npm run typecheck` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] With no key set: app behaves identically (everything no-ops). Confirm by running the app.
- [ ] With `EXPO_PUBLIC_POSTHOG_KEY` set + `--clear`: events appear in PostHog (EU) Live Events; toggling "Share usage data" off stops them.

## Notes for the implementer

- **`posthog-react-native` web compatibility** under react-native-web is the one unknown. Verify Task 2 early on the web target. If the RN SDK misbehaves on web, the wrapper is the seam: swap to `posthog-js` for `Platform.OS === 'web'` inside `lib/analytics.ts` only — call-sites never change.
- Exact `sessionReplayConfig` / option names may differ by `posthog-react-native` version; check the installed version's types (the wrapper isolates this).
- The feature-flag scaffold (`useFeatureFlag`) ships unused on purpose — no live experiment in this pass.
