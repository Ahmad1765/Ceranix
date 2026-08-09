// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Scope linting to the Expo/React Native app source. These trees run on
    // other runtimes or tooling and shouldn't be linted with the app config:
    //   - dist / .expo: build artifacts
    //   - supabase/functions: Deno edge functions (jsr:/https: imports, Deno
    //     globals) — linting them here just produces false no-unresolved errors
    //   - tests/e2e: Playwright (Node + its own `page` API, not React)
    // This mirrors the `exclude` list in tsconfig.json.
    ignores: ["dist/*", ".expo/*", "supabase/functions/**", "tests/**"],
  },
]);
