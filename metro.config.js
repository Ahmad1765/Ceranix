// getSentryExpoConfig is a drop-in for expo's getDefaultConfig that also wires
// the Sentry metro serializer (debug IDs + source map collection) so production
// stack traces de-minify in the dashboard. NativeWind's withNativeWind wrapper
// is applied on top and MUST stay — dropping it kills all Tailwind styling.


// const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require('nativewind/metro');

// const config = getSentryExpoConfig(__dirname);
const config = getSentryExpoConfig(__dirname);

config.resolver.sourceExts.push('mjs');

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
