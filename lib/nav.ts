import { router } from 'expo-router';

type Href = Parameters<typeof router.replace>[0];

// Calling router.back() on a screen with no history (typical on web when a
// user lands directly via URL) triggers a "GO_BACK not handled" warning.
// Use this everywhere instead of router.back() so we fall back to a route
// that always exists.
export function safeBack(fallback: Href = '/(tabs)' as Href) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
