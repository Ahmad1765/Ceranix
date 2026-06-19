// Centralized PostHog wiring. The rest of the app imports these thin helpers
// and never touches the SDK directly (mirrors lib/sentry.ts). Every helper is a
// no-op when there's no key OR the user has opted out.
import PostHog, { useFeatureFlag as usePostHogFeatureFlag } from 'posthog-react-native';
import Constants from 'expo-constants';
import {
  shouldTrack,
  buildListingViewedProps,
  buildSearchProps,
} from '@/lib/analyticsEvents';

export { buildListingViewedProps, buildSearchProps };

// Key + host are resolved expoConfig.extra-first (embedded at config-load time
// via app.config.js), falling back to the bundle-inlined env — same precedence
// lib/sentry.ts uses for its DSN.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  posthogKey?: string;
  posthogHost?: string;
};
const apiKey = (extra.posthogKey ?? process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '').trim();
const host = (
  extra.posthogHost ??
  process.env.EXPO_PUBLIC_POSTHOG_HOST ??
  'https://eu.i.posthog.com'
).trim();

// A key is the only thing that turns analytics on. No key → every helper below
// becomes a no-op, so local dev and PR previews stay silent unless you opt in.
export const analyticsEnabled = !!apiKey;

let client: PostHog | null = null;
let optedOut = false;

/**
 * Initialize PostHog. Safe to call unconditionally and exactly once, as early
 * in app startup as possible (before the first render). No-ops without a key.
 */
export function initAnalytics(): void {
  if (!apiKey) {
    if (__DEV__)
      console.warn('[analytics] EXPO_PUBLIC_POSTHOG_KEY not set — analytics disabled.');
    return;
  }
  client = new PostHog(apiKey, {
    host,
    // Session replay: sampled at 10 % + mask all text inputs/text (privacy posture).
    enableSessionReplay: true,
    sessionReplayConfig: {
      maskAllTextInputs: true,
      maskAllImages: false,
      sampleRate: 0.1,
    },
  });
  // Apply any opt-out that was set before init (unlikely, but defensive).
  if (optedOut) {
    client.optOut().catch(() => {});
  }
}

/** Returns the client only when tracking is allowed. */
function active(): PostHog | null {
  return shouldTrack({ hasKey: !!client, optedOut }) ? client : null;
}

export function identify(userId: string, traits: Record<string, unknown> = {}): void {
  active()?.identify(userId, traits as Record<string, string | boolean | number>);
}

export function resetIdentity(): void {
  client?.reset();
}

export function capture(event: string, props: Record<string, unknown> = {}): void {
  // Cast via `any`: callers pass plain JSON-serialisable values; this bridges
  // our ergonomic Record<string, unknown> to PostHog's recursive JsonType.
  active()?.capture(event, props as any);
}

export function screen(name: string, props: Record<string, unknown> = {}): void {
  active()?.screen(name, props as any);
}

export function isOptedOut(): boolean {
  return optedOut;
}

export function setAnalyticsOptOut(next: boolean): void {
  optedOut = next;
  if (!client) return;
  if (next) {
    client.optOut().catch(() => {});
  } else {
    client.optIn().catch(() => {});
  }
}

/**
 * Read a PostHog feature flag. Returns undefined when analytics is off.
 *
 * Uses the SDK's `useFeatureFlag(key, client)` overload so this works with
 * the standalone-client pattern (no PostHogProvider required).
 */
export function useFeatureFlag(key: string): boolean | string | undefined {
  // The SDK's hook accepts an optional client; pass ours so it works without
  // a PostHogProvider in the tree. When analytics is off, skip the hook call
  // and return undefined. We still call the hook unconditionally to satisfy
  // Rules of Hooks — pass null-cast to undefined when analytics is disabled.
  const result = usePostHogFeatureFlag(key, client ?? undefined);
  if (!analyticsEnabled) return undefined;
  return result;
}
