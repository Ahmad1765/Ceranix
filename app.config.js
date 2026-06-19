// Migrated from app.json so env vars (EXPO_PUBLIC_*) are explicitly embedded
// into expoConfig.extra at config-load time. This guarantees the supabase
// client gets the right URL/key on every Metro start, regardless of whether
// a stale process.env value is cached in the bundle.

module.exports = ({ config }) => ({
  ...config,
  expo: {
    name: 'Carrinex',
    slug: 'carrinex',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'carrinex',
    userInterfaceStyle: 'light',
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
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
      sentryDebug: process.env.EXPO_PUBLIC_SENTRY_DEBUG,
      posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
      posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    },
  },
});
