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

module.exports = withNativeWind(config, { input: './global.css' });
