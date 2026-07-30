# Carrinex — React Native / Expo Performance Audit

**Date:** 2026-07-30
**Branch:** `feature/push-notifications`
**Stack (verified from `package.json` / resolved config):** Expo SDK `~54.0.36`, React Native `0.81.5`, React `19.1.0`, Hermes (default), New Architecture (default-on in SDK 52+, not disabled here), Expo Router `~6.0.24`, Reanimated `~4.1.1` + `react-native-worklets@0.5.1`, NativeWind `4.1.23`, TanStack Query `5.101`, Supabase JS `2.45`.
**Workflow:** managed / CNG — no `android/` or `ios/` directories.

---

## Phase 1 — Research basis

Every recommendation below is anchored to one of these current sources. Nothing here is speculative or carried from memory.

| Source | What it established |
|---|---|
| [Expo — React Compiler](https://docs.expo.dev/guides/react-compiler/) | `experiments.reactCompiler: true` is the enable switch; Babel auto-configured in SDK 54+; app code only, no node_modules; validate with `react-compiler-healthcheck` |
| [Expo — Tree shaking](https://docs.expo.dev/guides/tree-shaking/) | `EXPO_UNSTABLE_TREE_SHAKING=1`, `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1`; barrel/star-export expansion; ESM-only; production-only |
| [Expo — Analyzing bundles](https://docs.expo.dev/guides/analyzing-bundles/) | `EXPO_ATLAS=true npx expo export` is the current bundle-inspection path (source-map-explorer is SDK ≤50) |
| [Expo — New Architecture](https://docs.expo.dev/guides/new-architecture/) | SDK 54 is the **last** SDK where New Arch can be disabled; ~83% of SDK 54 EAS builds already on it |
| [RN — Optimizing FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration) | `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`, `getItemLayout`, `removeClippedSubviews` semantics + tradeoffs; memoize row components; no anonymous `renderItem` |
| [FlashList v2 docs](https://shopify.github.io/flash-list/docs/) / [Expo SDK — flash-list](https://docs.expo.dev/versions/latest/sdk/flash-list/) | v2 is built for the New Architecture and **requires Fabric**; `npx expo install @shopify/flash-list`; no config plugin; FlatList-compatible API |
| [Expo SDK 54 changelog](https://expo.dev/changelog/sdk-54) | RN 0.81 + React 19.1; precompiled iOS XCFrameworks |

**Local verification run during the audit:**

```
$ npx react-compiler-healthcheck@latest
Successfully compiled 156 out of 156 components.
StrictMode usage not found.
Found no usage of incompatible libraries.

$ npx tsc --noEmit      → exit 0
$ npx expo lint         → 0 errors, 1 warning (unused var, AnonCards.tsx:146)
```

---

## Phase 2 — What the codebase actually does

~35.7k lines of TS/TSX across `app/` (24 routes), `components/` (61), `lib/` (55).

Already correct — **do not "fix" these**:

- **Data layer is sound.** TanStack Query with a central key factory (`lib/queries.ts`), `staleTime: 60s`, `gcTime: 5m`, AsyncStorage persistence with a version buster, `refetchOnWindowFocus: false` with explicit `useFocusEffect` + `isStale` gating. This is the modern pattern, correctly applied.
- **The like/save N+1 is already solved.** `lib/engagementCache.ts` collapses what would be 60+ per-card round-trips into one query per user per 30s, with in-flight dedupe and optimistic writes.
- **Images already use `expo-image`** in 27 files (only one stray `react-native` `Image`), with `cachePolicy="memory-disk"`, `recyclingKey`, `priority`, and CDN width negotiation via `lib/images.ts`.
- **Feed payloads are already slimmed** — `SELECT_FEED` in `lib/listings.ts` drops `description` and narrows the seller embed.
- **Auth context identity is already stabilized** (`lib/auth.tsx`) after the documented infinite-refetch incident.
- **`babel.config.js` is correct.** Two presets, no manual `react-native-worklets/plugin` — SDK 54's `babel-preset-expo` injects it. Adding it back would triple-stack the transform.
- **The two `useNativeDriver: false` sites are correct and must stay** — `app/auth/login.tsx` interpolates into `height`, `components/discover/SearchTabs.tsx` interpolates a color. Neither is native-driver-capable.
- **Native font blocking in `app/_layout.tsx` is deliberate and correct** — Android does not repaint mounted `<Text>` when a font registers late.
- **Zero `console.log` in `app/`, `components/`, `lib/`.**

---

## Phase 3 — Issues found

Ranked by impact × confidence. Every issue below is verified against the actual source, not inferred.

### P0-1 — No list virtualization anywhere. Every listing grid mounts every row.

**Where:** `app/(tabs)/index.tsx:768` (`Grid`), `app/(tabs)/discover.tsx:1210`, `app/(tabs)/profile.tsx:1023` (`ListingsGrid`), `app/user/[id].tsx:611`.

All four are the same shape: a plain `<ScrollView>` whose children are `rows.map(...)` → `<ListingCard>`. There is no `FlatList`, `SectionList`, or `FlashList` on any grid — RN's virtualized list primitives appear only in `chat.tsx`, `conversation/[id].tsx`, and the followers/following screens.

**Why it's a problem.** Query limits are 48–60 rows (`useMyFeedListingsQuery` → 48/60, `useFeedListingsQuery({limit: 60})`, `searchListings({limit: 60})`). Every one of those rows mounts immediately, on the JS thread, before first paint of the grid. And `ListingCard` is not cheap — per card:

- a `PressableScale` (Reanimated node)
- a `PopIcon` (second Reanimated node)
- for multi-image listings, a **nested horizontal paging `ScrollView`** with one `expo-image` per photo
- an `onLayout` handler that calls `setCardWidth` → a second render of every card
- a `useEffect` that resolves `fetchIsLiked` → `setLiked` → a third render of every card

So a 60-row feed mounts ~60 nested scroll containers, 60–180 image views, ~120 Reanimated nodes, and does ~180 renders during mount. This is the dominant cost on the two most-visited screens in the app.

**Impact:** slow first paint on Home and Discover; jank and dropped frames while scrolling; memory held for off-screen images that `removeClippedSubviews` would otherwise release; worst on low-end Android.
**Estimated improvement:** the largest single win available. Mount work drops from *N* rows to roughly one viewport plus the draw-distance buffer — for a 60-row feed that is ~8–12 cards instead of 60. Expect a step-change in time-to-interactive on Home/Discover and in scroll smoothness, not a marginal one.
**Risk of fixing:** **Medium.** These grids sit inside scroll views that also host headers, chip rows, and rails, so the fix is a real restructure (list header component + `numColumns`), not a drop-in. FlashList v2 additionally **requires the New Architecture** — satisfied here, but it is a hard requirement.

---

### P0-2 — `ToastProvider` creates a new context value on every render, re-rendering the whole app.

**Where:** `lib/toast.tsx:155` — `<ToastContext.Provider value={{ show }}>`.

`ToastProvider` wraps the entire `<Stack>` in `app/_layout.tsx`. It holds `useState` for `toast` and `visible`, so **every toast show, every dismiss, and every animation-completion callback re-renders the provider** — and each of those renders allocates a fresh `{ show }` object.

**Why it's a problem.** React compares context values by identity. A new object every render means every `useContext(ToastContext)` consumer re-renders, unconditionally. `ListingCard` calls `useToast()`. So **showing any toast re-renders all 60 listing cards** — and `React.memo` on `ListingCard` cannot stop it, because context propagation bypasses memo entirely.

This is the same class of bug as the `lib/auth.tsx` infinite-refetch incident already documented in this repo, and every *other* provider in the tree (`GuestGate`, `SellSheet`, `DiscoverSheet`, `Auth`) already memoizes its value correctly. Toast is the one that was missed.

**Impact:** a visible stutter every time a toast fires while a grid is on screen — which is exactly when toasts fire (like failed, item saved, feed removed).
**Estimated improvement:** eliminates 60+ wasted component renders per toast event, ×4 events per toast lifecycle (show, animate-in, timer, dismiss).
**Risk of fixing:** **Very low.** One-line `useMemo`. `show` is already a stable `useCallback`.

---

### P1-1 — React Compiler is not enabled, and this codebase is its ideal candidate.

**Where:** `app.config.js` — `experiments` contains only `typedRoutes: true`.

The code style throughout is inline arrow props and inline style objects — `app/(tabs)/index.tsx` alone passes ~15 inline `onPress` closures and every `style={{...}}` is a fresh object per render. That is a deliberate, readable style, and hand-memoizing it all would be a large, risky, low-value diff.

**Why it matters.** React Compiler does exactly that memoization automatically at build time, without touching the source. Per Expo's docs it is auto-configured in SDK 54 and applies to app code only.

**The healthcheck passes cleanly on this repo: 156/156 components compile, no incompatible libraries, no StrictMode conflicts.** That is an unusually clean result and the strongest possible signal to turn it on.

**Impact:** broad reduction in re-render work across every screen, at zero source-diff cost.
**Estimated improvement:** moderate and diffuse — meaningful on render-heavy screens (Home, Discover, `product/[id]`), invisible elsewhere. It does **not** substitute for P0-1; virtualization and memoization solve different problems.
**Risk:** **Low-medium.** It is still flagged experimental by Expo. Behaviour changes only if a component violates the Rules of React — the healthcheck found none. Rollback is deleting one config line.

---

### P1-2 — `lucide-react-native` is a dependency with zero imports.

**Where:** `package.json:53`. Grep across `app/`, `components/`, `lib/` returns **no matches**.

Icons come from `@expo/vector-icons` (`Feather`, `Ionicons`) everywhere.

**Why it's a problem.** Even with Metro's dead-code elimination, an unused dependency is install weight, lockfile surface, audit surface, and a standing invitation to import a *second* icon system. Icon libraries are also the canonical barrel-file bundle hazard called out in Expo's tree-shaking guide.

**Impact:** small but free. **Risk of fixing:** **Very low** — nothing imports it.

---

### P1-3 — `ListingCard` does three render passes per card on mount.

**Where:** `components/ListingCard.tsx:31–67`.

Three independent state writes fire during mount for every card:
1. `useState(0)` → `onLayout` → `setCardWidth(width)` (line 146)
2. `useEffect` → `fetchIsLiked(...).then(setLiked)` (line 55)
3. `useEffect` on `[listing.likes]` → `setLikeCount` (line 65–67) — this one fires on mount even though `likeCount` was already initialized to the same value at line 34.

**Why it's a problem.** #3 is a strictly redundant render on every card. #1 forces the image to render at a placeholder width (`cardWidth || 200`) then re-render at the true width — and the parent grid *already computes the exact card width* via `useGridDimensions` and passes it down as a wrapper `style={{ width: cardWidth }}`. The measurement is re-deriving a number the parent already knows.

**Impact:** ~120 avoidable renders on a 60-card grid mount, plus a first-frame image at the wrong source width.
**Estimated improvement:** modest on its own; compounds significantly with P0-1 since it is per-card cost.
**Risk of fixing:** **Low-medium.** Passing `cardWidth` down as a prop is a behavioural no-op but touches all four grid call sites. The `likeCount` guard is trivial.

---

### P1-4 — Metro tree shaking is available but not switched on.

**Where:** no `EXPO_UNSTABLE_TREE_SHAKING` / `EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH` anywhere in `eas.json` or the build scripts.

Per Expo's guide these are production-only, ESM-only, and expand star-exports so unused barrel members are dropped — directly relevant to `@expo/vector-icons`, `lucide-react-native` (see P1-2), and `components/ui/index.ts`.

**Impact:** smaller production bundle → faster JS parse/eval → faster cold start.
**Estimated improvement:** unknown without measurement. **This must be measured with `EXPO_ATLAS=true npx expo export` before and after, not assumed.**
**Risk:** **Medium.** Explicitly marked unstable by Expo. Requires a full export + smoke test on both platforms before it goes anywhere near a production channel.

---

### P2-1 — Screen freezing (`react-native-screens`) is not configured.

No `enableFreeze`, `enableScreens`, or `freezeOnBlur` anywhere in the codebase. With six tab screens (several data-heavy), blurred tabs keep re-rendering on context and query-cache changes.

**Caveat that matters:** there is a live report of `freezeOnBlur: true` + `enableFreeze(true)` interacting badly with tab-bar rendering on iOS around `expo ~54.0.31` / `react-native-screens ~4.19.0` — and this app uses a **fully custom** `AnimatedTabBar` with Reanimated shared values and gesture state. That is precisely the configuration those reports involve.

**Impact:** moderate CPU/battery saving on backgrounded tabs.
**Risk:** **Medium-high for this specific app.** Recommend deferring until P0/P1 are shipped and measured, then trialling on one screen at a time with device testing. Not a blind enable.

---

### P2-2 — Minor allocation churn on the Home screen.

`app/(tabs)/index.tsx:112` — `const priceDrops = priceDropsQ.data ?? []` allocates a new array every render, while the three sibling queries correctly use module-level stable constants (`EMPTY_LISTINGS`, `EMPTY_SAVED_SEARCHES`, lines 58–59).

It happens not to feed a `useMemo` dependency today, so it is currently harmless — but it is inconsistent with the stable-reference discipline the rest of the file establishes, and would silently become a bug the moment someone memoizes on it.

**Impact:** negligible now, cheap insurance. **Risk of fixing:** **Very low.**

---

### P2-3 — `components/AnonCards.tsx:146` — `SectionEyebrow` defined but never used.

The only lint warning in the repo. Dead code. **Risk of fixing: none.**

---

## Non-issues — checked and explicitly cleared

So these are not re-litigated later:

- **New Architecture** — on. Default in SDK 52+, not disabled in `app.config.js`. No migration needed.
- **Hermes** — on. Default engine, not overridden.
- **Babel/Reanimated plugin ordering** — correct, and the existing comment explains why the manual plugin entry must stay absent.
- **Metro config** — correct. `getSentryExpoConfig` + `withNativeWind` in the right order.
- **TypeScript** — `strict: true`, clean compile, path aliases configured.
- **Secrets** — no keys in source. `EXPO_PUBLIC_*` for public values only (correct: anon key, DSN, PostHog key are all publishable). `SENTRY_AUTH_TOKEN` isolated in `.env.sentry-build-plugin` and read by the plugin, not the bundle. `expo-secure-store` present and plugin-registered.
- **`@mediapipe/tasks-vision`** — never enters the Metro bundle; loaded from jsDelivr at runtime in `lib/photoClean/engine.web.ts`, web-only. Correctly handled.
- **OTA / `runtimeVersion`** — `fingerprint` policy with `fallbackToCacheTimeout: 0`. Correct: never blocks cold start on an update fetch.
- **Supabase client** — hard fetch timeout, bounded auth lock with graceful fallback. Well-hardened.
- **Realtime subscriptions** — `lib/chat.ts` channels are all paired with `removeChannel` in cleanup. No leak.
- **`LiveActivityTicker` `setInterval`** — cleaned up on unmount; native-driven where possible. Fine.
- **Accessibility** — `accessibilityRole`/`Label`/`State` and `hitSlop` presets used consistently. Nothing below should reduce this.

---

## Phase 4 — Recommended sequencing

| Tier | Items | Risk | Verify with |
|---|---|---|---|
| **1 — apply now** | P0-2 toast memo, P1-2 remove dep, P2-2 stable ref, P2-3 dead code | Very low | typecheck + lint |
| **2 — apply + verify** | P1-1 React Compiler | Low-med | healthcheck (already green) + device smoke test |
| **3 — needs a decision** | P0-1 virtualization, P1-3 card render passes | Medium | full manual pass over all 4 grids, both platforms |
| **4 — defer, measure first** | P1-4 tree shaking, P2-1 screen freezing | Medium+ | `EXPO_ATLAS` before/after; per-screen device trial |

Tier 3 is where the real performance is. It is also the only tier that changes UI-critical code, and it adds a runtime dependency that hard-requires Fabric.

---

## Phase 5 — What was applied, and how it was verified

Tiers 1–3 are **applied**. Tier 4 is **not** — it is left documented above.

| Issue | Change | Files |
|---|---|---|
| P0-2 | `useMemo` the toast context value | `lib/toast.tsx` |
| P1-2 | Removed unused `lucide-react-native` | `package.json`, `package-lock.json` |
| P2-2 | Stable `EMPTY_PRICE_DROPS` reference | `app/(tabs)/index.tsx` |
| P2-3 | Deleted dead `SectionEyebrow` | `components/AnonCards.tsx` |
| P1-1 | `experiments.reactCompiler: true` | `app.config.js` |
| P1-3 | `width` prop replaces `onLayout` measure; first-run guard on the `likeCount` effect | `components/ListingCard.tsx` |
| P0-1 | FlashList v2 on all four grids | `app/(tabs)/index.tsx`, `app/(tabs)/discover.tsx`, `app/(tabs)/profile.tsx`, `app/user/[id].tsx` |

### How the virtualization was done, and why this shape

Each of the four screens wraps its grid in a scroll view that also carries a
header, chips, rails, and tab panels. Rather than restructure those trees, the
existing tree became `ListHeaderComponent` and **only the grid rows moved into
FlashList's `data`**. That is safe here because of a property that holds on all
four screens: **the grid is always the last element rendered in its branch**, so
"header, then rows" puts the rows exactly where the inline grid was.

Two deliberate choices, both trading a little theoretical throughput for a lot of
certainty:

1. **Rows are the list item, `numColumns` stays 1.** `data` is `Listing[][]`, and
   each row renders the same flex-row with the same fixed `cardWidth` the old
   code used. The grid is therefore pixel-identical — the wrapper's
   `paddingHorizontal` moved onto the row and its vertical `gap` became a
   `marginBottom`. Using flat data with `numColumns={columns}` would recycle
   individual cells slightly better, but it would hand grid layout (and the
   padding/gap math) to FlashList on four screens with four different constants.
   Not worth the regression risk for the marginal gain.
2. **`ListHeaderComponent` is passed an element, never `() => <Header/>`.** An
   inline function is a new component type on every render, which remounts the
   header — that would drop focus from the search fields on Home and Discover on
   every keystroke. This is called out in a comment at each of the four sites.

**Follow-up — `components/WebRefresh.tsx` was subsequently deleted** (see the
"Web pull-to-refresh removal" section at the end of this document).

### Verification

Every gate below was run against the **actual changed tree**.

```
npx tsc --noEmit                → 0 errors
npx expo lint                   → 0 errors, 0 warnings   (baseline had 1 warning)
npx vitest run                  → 17 files, 155/155 passed
npx expo export -p web          → exit 0, bundle 5.1 MB
npx react-compiler-healthcheck  → 156/156 components compiled
```

**E2E, measured against a baseline rather than assumed.** The Playwright suite
runs against the static web export with Supabase fully mocked. The changed tree
was run, then the changes were stashed, the app was re-exported, and the identical
suite was run again on unmodified `feature/push-notifications`:

| | Passed | Failed |
|---|---|---|
| Baseline (stashed) | 124 | 35 |
| With these changes | 126 | 33 |

**Every one of the 33 failures under the changes is also present in the baseline
list — there are no new failures.** Two baseline failures
(`web-pull-refresh.spec.ts:35`, `signed-in/saved-searches.spec.ts:158`) did not
recur; they look like timing flakes and are *not* claimed as fixes here.

### ⚠️ Pre-existing: the E2E suite is substantially red on this branch

33 specs fail on unmodified `feature/push-notifications`, independent of any of
this work. They cluster into:

- `tab-navigation.spec.ts` + `responsive.spec.ts` — tab-bar locators, almost the
  whole `chromium-iphone-se` project
- `product-detail.spec.ts:25` — fails on all four viewport projects
- `network-failure.spec.ts` — three specs
- `signed-in/chat-inbox.spec.ts` — three specs

This matters beyond hygiene: a suite this red cannot detect a real regression,
which is why the stash-and-compare above was necessary to say anything
trustworthy about these changes. Worth its own pass.

### Rollback

Each item is independently revertible:

- **React Compiler** — delete `reactCompiler: true` from `app.config.js`.
- **FlashList** — `git revert` the four screen files; `components/ListingCard.tsx`'s
  `width` prop is optional and back-compatible, so it can stay either way.
- **Toast memo / dead code / unused dep** — one-line reverts, no coupling.

---

## Web pull-to-refresh removal (same day, follow-up)

### Why `refreshing`/`onRefresh` cannot solve this on web

The natural question is "FlashList and FlatList already have refresh — just use
it." They do, and it is already in use on all seven screens. It works on
iOS/Android. On web it is inert, and the chain is verifiable in installed source:

1. FlashList v2 constructs the control itself —
   `@shopify/flash-list/dist/recyclerview/hooks/useSecondaryProps.js:36`:
   ```js
   React.createElement(react_native_1.RefreshControl, { refreshing, progressViewOffset, onRefresh })
   ```
   `FlatList` does the same thing.
2. On web, Metro aliases `react-native` → `react-native-web@0.21.2`.
3. That package's entire `RefreshControl` implementation
   (`dist/exports/RefreshControl/index.js`) is:
   ```js
   function RefreshControl(props) {
     var colors = props.colors, enabled = props.enabled, onRefresh = props.onRefresh,
       refreshing = props.refreshing, tintColor = props.tintColor, /* …all of them… */
       rest = _objectWithoutPropertiesLoose(props, _excluded);
     return React.createElement(View, rest);   // every refresh prop discarded
   }
   ```
4. Upstream [necolas/react-native-web#1027](https://github.com/necolas/react-native-web/issues/1027)
   has been open since **July 2018** — milestone "TBD", no assignee, no PR.

No maintained library closes the gap either:
[`react-native-web-refresh-control`](https://www.npmjs.com/package/react-native-web-refresh-control)
(v1.1.2, ~2 yrs stale, open issue #11 *"Stuck on pull down release"*, and it
patches `FlatList` not FlashList);
[`react-simple-pull-to-refresh`](https://github.com/thmsgbrt/react-simple-pull-to-refresh)
(owns its own scroll container — incompatible with a virtualized list);
[`pulltorefreshjs`](https://www.npmjs.com/package/pulltorefreshjs) (5 yrs stale).

### What was removed, and why

`components/WebRefresh.tsx` (253 lines) hand-rolled the gesture with DOM
`touch`/`wheel` listeners. Two structural defects made it unstable:

1. **`setPull()` on every gesture event** (old lines 112, 142). The hook was
   called *inside each screen component*, so every frame of a pull re-rendered
   all of Home/Discover/Profile at gesture framerate.
2. **Listeners bound once on mount** (old line 61) behind a 10×100ms retry. If
   the scroll node appeared late or was later replaced, the gesture died with no
   recovery — and the FlashList migration made node replacement more likely.

Deleted: `components/WebRefresh.tsx`, `tests/e2e/web-pull-refresh.spec.ts`, and
the hook/indicator wiring from all seven screens. **Native `RefreshControl` is
untouched everywhere** — `refreshControl={...}` is still passed on all seven.
Mobile web now falls back to the browser's own pull-to-refresh, which the old
code actively suppressed via `e.preventDefault()`.

Tradeoff, stated plainly: **desktop web now has no in-app refresh affordance.**
There is no native browser pull gesture there. If that matters, a header Refresh
button calling the existing `onRefresh()` is the fix — it was offered and not
taken, so it is not implemented.

### Bug found and fixed during this work

`FlashListRef` exposes `scrollToOffset`, **not** `scrollTo`. Discover's four
scroll-to-grid jumps used `scrollRef.current?.scrollTo?.({ y, animated })` — the
optional call meant they silently did nothing after the FlashList migration
rather than throwing. This was a regression introduced by that migration and is
now corrected to `scrollToOffset({ offset, animated })` at
`app/(tabs)/discover.tsx` lines 478, 515, 535, 590.

### Verification

```
npx tsc --noEmit    → 0 errors
npx expo lint       → 0 errors, 0 warnings
npx vitest run      → 155/155 passed
npx expo export -p web → exit 0
```

E2E, same stash-and-compare discipline as above:

| | Total | Passed | Failed |
|---|---|---|---|
| Original baseline | 165 | 124 | 35 |
| After FlashList work | 165 | 126 | 33 |
| After this removal | **162** | 124 | **32** |

The 3-test drop is exactly `web-pull-refresh.spec.ts` (1 failing + 2 passing),
which was deleted with the feature. No new failures. Two specs
(`tmp-dummy-shot`, `saved-searches.spec.ts:158`) flip between runs, which
identifies them as flaky rather than as regressions.

### Still unmeasured

The gains argued in Phase 3 are mechanical (mounting ~1 viewport of rows instead
of 48–60) and the build/test gates confirm nothing broke — but **no on-device
frame timing or startup measurement was taken.** Before/after profiling on a
low-end Android device is the honest next step, along with
`EXPO_ATLAS=true npx expo export` if Tier 4 tree shaking is ever picked up.
