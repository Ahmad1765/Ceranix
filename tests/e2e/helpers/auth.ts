// Inject a supabase-js session into the page's storage BEFORE the bundle
// loads, so AuthProvider boots into a signed-in state without going through
// the login form. supabase-js v2 persists sessions under the storage key
// `sb-<project-ref>-auth-token` for cookies, and `supabase.auth.token` for
// AsyncStorage on web. Because react-native-async-storage shims to
// localStorage on web with the `@react-native-async-storage:` prefix, we
// also write that variant.

import type { Page } from '@playwright/test';
import { SESSION_TEMPLATE, USERS } from './fixtures';
import type { MockState } from './supabase-mock';

export async function signInAs(
  page: Page,
  state: MockState,
  who: keyof typeof USERS = 'alice',
) {
  const user = USERS[who];
  state.authedUserId = user.id;
  const session = SESSION_TEMPLATE(user);

  // supabase-js detects an existing session from the configured storage
  // adapter at boot. The Expo build uses AsyncStorage which shims to
  // localStorage under `@react-native-async-storage:<key>` on web.
  const stored = {
    access_token: session.access_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  };

  await page.addInitScript(
    ({ storageKey, value }) => {
      // Default supabase-js storage key — we hit both variants because
      // different bundler/storage shims produce different prefixes.
      const stringified = JSON.stringify(value);
      try {
        window.localStorage.setItem(storageKey, stringified);
        window.localStorage.setItem(
          `@react-native-async-storage:${storageKey}`,
          stringified,
        );
        window.localStorage.setItem(
          `sb-e2e-auth-token`,
          JSON.stringify({ currentSession: value, expiresAt: value.expires_at }),
        );
      } catch {
        // localStorage may be locked-down in some sandbox modes — fall back
        // silently. The mocked `/auth/v1/user` endpoint will still return the
        // signed-in user when polled, so AuthProvider catches up after boot.
      }
    },
    { storageKey: 'supabase.auth.token', value: stored },
  );
}

export async function signOut(page: Page, state: MockState) {
  state.authedUserId = null;
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {}
  });
}
