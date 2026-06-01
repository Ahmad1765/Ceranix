import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

// Resolve env in this order:
//   1) expoConfig.extra (embedded at config-load time via app.config.js)
//   2) process.env.EXPO_PUBLIC_* (inlined at bundle time — can be stale)
// The extra-first order means a fresh `expo start` always picks up the
// real .env.local values, even if Metro has a cached bundle from before.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const supabaseUrl = (
  extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""
).trim();
const supabaseAnonKey = (
  extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""
).trim();

if (!supabaseUrl || !supabaseAnonKey) {
  const msg =
    "[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
    "Add them to .env.local at the project root, then restart Metro with " +
    "`npx expo start --clear` so the values are re-embedded into the bundle.";
  // Hard-fail in dev so a misconfigured environment can't silently ship a
  // bundle pointed at placeholder.supabase.co.
  if (__DEV__) {
    throw new Error(msg);
  } else {
    console.warn(msg);
  }
}

// Hard request timeout for every Supabase HTTP call. On web (especially
// Chrome with extensions / service workers / flaky CORS preflights) the
// underlying fetch can wedge indefinitely — the JS client just sits on an
// unresolved promise and the UI hangs. By installing a custom `fetch` here
// we get an AbortController-backed ceiling on EVERY request the SDK makes
// (REST, RPC, storage, auth). When the ceiling fires the promise rejects
// with AbortError, callers see an error instead of an eternal pending state,
// and the toast/timeout paths can run.
const REQUEST_TIMEOUT_MS = 12_000;

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input as any, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

// THE actual web wedge fix. supabase-js's auth client serializes session
// reads / token refreshes through a global lock. On web that defaults to
// `navigator.locks.request('lock-storage-key', ...)`. That lock can be
// held indefinitely by:
//   - another tab of the same app that crashed mid-refresh,
//   - a service worker still holding it after page navigation,
//   - a browser extension that hooked storage,
//   - or a previous in-page refresh that aborted without releasing.
// When that happens, every subsequent supabase.from()/.rpc()/.auth call
// queues behind the lock and never executes — no fetch, no abort, no
// timeout, no error. The promise just sits pending. This is the
// "skeleton until I refresh the browser" bug, exactly.
//
// Overriding the lock to a pass-through removes the queue. The trade-off
// (concurrent token refresh across tabs racing) is irrelevant for this
// app: a buyer-side marketplace where a user is in one tab at a time,
// and the worst case of a duplicate refresh is one wasted token round
// trip. Worth it to make the app actually usable on Chrome.
async function passthroughLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  return fn();
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: passthroughLock,
  },
  global: {
    fetch: timeoutFetch,
  },
});
