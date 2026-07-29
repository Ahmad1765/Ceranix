// Migrated from app.json so env vars (EXPO_PUBLIC_*) are explicitly embedded
// into expoConfig.extra at config-load time. This guarantees the supabase
// client gets the right URL/key on every Metro start, regardless of whether
// a stale process.env value is cached in the bundle.

// EAS project id — written by `eas init`. The literal below is this project's
// real id; EAS_PROJECT_ID stays supported as an override so CI can point a fork
// or a test project somewhere else. It used to be env-only, which meant that on
// any machine without EAS_PROJECT_ID exported (i.e. every one of them — it is in
// no .env file here) `extra.eas.projectId` resolved to undefined and OTA updates
// silently stayed off.
const easProjectId =
  process.env.EAS_PROJECT_ID || 'cea63614-ec61-46e8-b410-5fe84a7218bf';

// This file is the ONLY app config. There is no app.json — a dynamic config that
// returns an object keyed `expo` makes @expo/config's reduceExpoObject() collapse
// to exactly that object, so anything merged in from a static app.json was thrown
// away wholesale. Adding a plugin or an `extra` key to an app.json here would look
// right and do nothing; check the resolved result with `npx expo config --type public`.
module.exports = () => ({
    name: 'Carrinex',
    slug: 'carrinex',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'carrinex',
    userInterfaceStyle: 'light',
    // Fingerprint policy derives runtimeVersion from the native module set, so an
    // OTA JS update only lands on a build whose native layer actually matches —
    // never a crash from shipping a bundle newer than the installed binary.
    runtimeVersion: { policy: 'fingerprint' },
    // OTA update endpoint, only wired once a project id exists. fallbackToCache
    // timeout 0 = never block cold start on the update fetch; a downloaded
    // update applies on the next launch instead.
    ...(easProjectId
      ? {
          updates: {
            url: `https://u.expo.dev/${easProjectId}`,
            fallbackToCacheTimeout: 0,
          },
        }
      : {}),
    splash: {
      image: './assets/images/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.carrinex.app',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'com.carrinex.app',
    },
    assetBundlePatterns: [
      'assets/**',
      'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*',
    ],
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission: 'Carrinex needs access to your photos to upload listings.',
        },
      ],
      'expo-asset',
      [
        'expo-notifications',
        {
          // Android tints the small status-bar icon with this colour. Left to
          // default, the notification icon renders as a white square.
          color: '#6C47FF',
          defaultChannel: 'default',
        },
      ],
      [
        '@sentry/react-native',
        {
          // Org + project for source map / debug symbol upload during builds.
          // The auth token is NOT here (it's a secret) — the plugin reads it
          // from the SENTRY_AUTH_TOKEN env var (.env.sentry-build-plugin).
          organization: 'penta-squad',
          project: 'ceranix-vg',
        },
      ],
    ],
    web: {
      favicon: './assets/images/favicon.png',
    },
    experiments: {
      typedRoutes: true,
    },
    extra: {
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      sentryDebug: process.env.EXPO_PUBLIC_SENTRY_DEBUG,
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    },
});
