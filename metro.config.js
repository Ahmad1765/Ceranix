// getSentryExpoConfig is a drop-in for expo's getDefaultConfig that also wires
// the Sentry metro serializer (debug IDs + source map collection) so production
// stack traces de-minify in the dashboard. NativeWind's withNativeWind wrapper
// is applied on top and MUST stay — dropping it kills all Tailwind styling.


// const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

// const config = getSentryExpoConfig(__dirname);
const config = getSentryExpoConfig(__dirname);

config.resolver.sourceExts.push('mjs');

// ── Serve WOFF2 instead of TTF on web ───────────────────────────────────────
//
// `@expo/vector-icons` and `@expo-google-fonts/*` both ship raw TTF, which is
// an uncompressed container: 2.6 MB across the ten families this app can load,
// against 0.9 MB for the same glyphs as WOFF2. scripts/build-web-fonts.mjs
// writes the twins into web-fonts/ and the manifest read below.
//
// The redirect has to happen HERE, not at the `Font.loadAsync` call site.
// Passing a different URI in app/_layout.tsx downloads both files, because
// @expo/vector-icons/build/createIconSet.js closes over the raw TTF asset id
// and each `<Ionicons>` re-loads it from `componentDidMount` whenever
// `Font.isLoaded('Ionicons')` is still false at mount — a race the app's own
// async preload frequently loses. Swapping the module the graph resolves to
// removes the TTF from the web bundle entirely, so the icon component's private
// fallback, `Icon.font`, `Font.loadAsync` and the `<link rel="preload">` in
// index.html all name one URL and there is exactly one request.
//
// Web only. Native keeps the TTF: the file is read from local disk rather than
// fetched, so WOFF2 saves nothing, and expo-font's iOS/Android loaders do not
// read the format.
//
// `woff2` is not in Metro's default assetExts (`ttf` and `woff` are, woff2 is
// not), so without this push the redirect resolves to a file Metro would try to
// parse as JavaScript.
config.resolver.assetExts.push('woff2');

const WEB_FONT_MANIFEST = path.join(__dirname, 'scripts', 'web-fonts.generated.json');

// Read once at config load. Missing manifest is not fatal — every TTF simply
// keeps resolving to itself, which is the pre-optimization behaviour.
const webFontRedirects = (() => {
  try {
    const { dir, redirects } = JSON.parse(fs.readFileSync(WEB_FONT_MANIFEST, 'utf8'));
    return new Map(
      Object.entries(redirects).map(([ttf, woff2]) => [ttf, path.join(__dirname, dir, woff2)]),
    );
  } catch {
    console.warn('[metro] no web-fonts manifest — run `npm run fonts:web`; web will ship TTF.');
    return new Map();
  }
})();

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  const resolved = resolve(context, moduleName, platform);

  if (platform !== 'web' || webFontRedirects.size === 0) return resolved;

  // Assets resolve as `{ type: 'assetFiles', filePaths: [...] }`, NOT
  // `sourceFile` — metro-resolver/src/resolveAsset.js returns the whole
  // @1x/@2x/@3x set. A `.ttf` has no density variants, so filePaths is always
  // the single file, but the shape still has to be honoured.
  if (resolved?.type !== 'assetFiles' || !Array.isArray(resolved.filePaths)) return resolved;

  // Matched on basename: Metro has already resolved an absolute path somewhere
  // in node_modules, and these basenames are unambiguous across the tree.
  // A manifest entry whose file was deleted falls through to the TTF rather
  // than resolving to nothing.
  let swapped = false;
  const filePaths = resolved.filePaths.map((p) => {
    if (!p.endsWith('.ttf')) return p;
    const twin = webFontRedirects.get(path.basename(p));
    if (!twin || !fs.existsSync(twin)) return p;
    swapped = true;
    return twin;
  });

  return swapped ? { ...resolved, filePaths } : resolved;
};

// Keep Metro's file watcher out of native build output.
//
// A Gradle build (`gradlew assembleDebug/assembleRelease`, or `expo run:android`)
// creates and deletes CMake scratch directories under
// node_modules/<pkg>/android/.cxx/... while it compiles. Metro watches
// node_modules, and when one of those paths vanishes mid-walk its watcher throws
// an unhandled ENOENT and the whole dev server dies:
//
//   errno: -4058, syscall: 'watch', code: 'ENOENT',
//   path: '...\\react-native-gesture-handler\\android\\.cxx\\RelWithDebInfo\\...\\CMakeTmp\\CMakeFiles'
//
// That is exactly what killed `expo start` here during a release build. None of
// these paths are ever module sources, so excluding them is safe and makes it
// possible to run Metro and a native build at the same time.
//
// Appended, never assigned: Expo/Sentry already ship entries (.expo/types,
// __tests__) and replacing the array would silently un-block those.
const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
    ? [config.resolver.blockList]
    : [];

config.resolver.blockList = [
  ...existingBlockList,
  /[\\/]android[\\/]\.cxx[\\/].*/,
  /[\\/]android[\\/]build[\\/].*/,
  /[\\/]ios[\\/]build[\\/].*/,
];

module.exports = withNativeWind(config, { input: './global.css' });
