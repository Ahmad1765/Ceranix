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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
