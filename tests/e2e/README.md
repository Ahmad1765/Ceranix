# E2E tests

Playwright suite driving the **web export** (`expo export -p web` → `dist/`)
through every meaningful screen and flow. Every Supabase / Stripe / edge-function
request is intercepted in `helpers/supabase-mock.ts` — **no live backend is hit**,
so the suite is deterministic, fast, and safe to run in CI without credentials.

## Quick start

```bash
# 1. Install deps (Playwright is a devDependency)
npm ci
# 2. Install the Playwright Chromium binary
npx playwright install --with-deps chromium
# 3. Build the web bundle once
npm run build
# 4. Run the suite
npm run test:e2e
```

That's it. The Playwright config (`playwright.config.ts`) auto-boots
`serve -s dist -l 4173` as a web server before the first spec runs.

## Layout

```
tests/e2e/
├── helpers/
│   ├── fixtures.ts        # Deterministic users, listings, conversations, messages
│   ├── supabase-mock.ts   # Route interception for Supabase REST/RPC/auth/edge funcs
│   ├── auth.ts            # localStorage session injection (signInAs, signOut)
│   └── page.ts            # Custom test() fixture: fresh state + waitForAppReady
├── auth-flow.spec.ts             # Welcome → signin / signup, validation, errors
├── home-feed.spec.ts             # For you / Popular / Following, empty state, navigation
├── discover.spec.ts              # Search + category filters + clear
├── feed-static.spec.ts           # The static promo /feed screen
├── product-detail.spec.ts        # Hero, like, follow, message, sold-out, not-found
├── upload-listing.spec.ts        # RequireAuth gate + photos step UI + alerts
├── profile-screen.spec.ts        # Own profile tabs, stats, edit CTA
├── chat-inbox.spec.ts            # Signed-out empty, list, All/Buying/Selling filters
├── conversation-thread.spec.ts   # Send text, send offer, accept / decline
├── new-conversation.spec.ts      # Mode toggle, quick replies, offer suggestions
├── settings-account.spec.ts      # Sections, modals, vacation, bundle, logout, delete
├── profile-edit.spec.ts          # Username validation, debounce, save PATCH, onboarding
├── payment-flow.spec.ts          # Slide-to-pay (demo), redirect to invoice
├── invoice-detail.spec.ts        # Pending / paid status, Pay → /payment redirect
├── news-activity.spec.ts         # Following / For you / Saved empty states
├── ratings-screen.spec.ts        # Score card, achievements, zero-sales callout
├── tab-navigation.spec.ts        # All five tabs reach the right route
├── user-profile.spec.ts          # Other user follow / unfollow, counts, missing user
└── api-validation.spec.ts        # Direct contract checks against the mocked endpoints
```

## How a test stays isolated

Every spec gets a fresh `MockState` (cloned from `fixtures.ts`) and a fresh
local-storage. Mutations on `state` (`state.listings.push(...)`, `state.likes`,
`state.calls.insertedMessages`, etc.) only affect that one spec. There is no
shared global anywhere.

```ts
test('something', async ({ page, state }) => {
  state.listings = [];           // shape the world for this test
  await page.goto('/');
  await expect(page.getByText('Nothing here')).toBeVisible();
});
```

## Environment variables

Tests run against the bundle as-built. Copy `.env.test.example` to `.env.test`
for local overrides — the workflow injects the same values via its `env:` block:

| Var | Purpose |
|-----|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Hostname the supabase-js client emits requests to. Anything ending in `.supabase.test` is intercepted. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Any non-empty string. Mocks don't validate it. |
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Leave **blank** — keeps Stripe in demo mode so the payment flow stays testable client-side. |

## Adding tests

1. Pick the spec file that fits, or create a new `<feature>.spec.ts`.
2. Reach for the `test` fixture from `./helpers/page` — never `import { test } from '@playwright/test'` directly. That fixture installs the mock + provides `state`.
3. Use accessible locators (`getByText`, `getByPlaceholder`, `getByRole`). Avoid CSS / XPath unless there's no alternative — RN-Web class names are not stable.
4. Always assert on **user-visible behavior**, not implementation. E.g. assert "Following" appears, not that a particular network request fired (unless the spec is in `api-validation.spec.ts`).

## Known web-only limitations

These features aren't testable end-to-end in this suite because the platform
shims they rely on aren't available in `react-native-web`:

| Flow | Why it stops at the gate | Coverage |
|------|--------------------------|----------|
| Image picker (Upload listing photos) | `expo-image-picker` is native-only on web | We assert the UI of the photos step + the "Add photos" alert |
| Image upload (avatar / listing images) | Same — requires a real picker | We mock the row insert; uploads aren't exercised |
| Real Stripe Checkout redirect | Would leave the bundle's origin | We test demo mode only |
| Realtime websocket subscriptions | We don't run a WS server | Initial REST fetch is asserted; live updates aren't |

These are flagged so reviewers know they're conscious gaps, not bugs.
