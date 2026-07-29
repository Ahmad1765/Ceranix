module.exports = function (api) {
  api.cache(true);
  return {
    // Two presets, in this order, is the setup NativeWind v4 documents for Expo:
    //
    //   1. babel-preset-expo with `jsxImportSource: 'nativewind'` points the
    //      automatic JSX runtime at nativewind/jsx-runtime, which is what makes
    //      `className` resolve on JSX written in this repo.
    //   2. `nativewind/babel` is NOT optional on top of that. It adds
    //      react-native-css-interop's Program visitor, which rewrites
    //      `React.createElement(...)` calls into `createInteropElement(...)`.
    //      Without it, any component built through createElement rather than
    //      JSX (compiled libraries, .js sources) silently drops className.
    //
    // There is deliberately NO `plugins` array here. `react-native-worklets/plugin`
    // used to be listed manually, but babel-preset-expo >= 54 already injects it
    // whenever react-native-worklets is installed (see its build/index.js), and
    // nativewind/babel appends it too. Expo's Reanimated docs say plainly: "No
    // additional configuration is required." Listing it by hand stacked a third
    // copy of the same transform onto every file in the app.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
