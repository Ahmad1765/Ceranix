// Un-registers Pressable from NativeWind's cssInterop.
//
// WHY THIS EXISTS
// ---------------
// NativeWind wraps components through react-native-css-interop. The gate in
// its runtime (react-native-css-interop/dist/runtime/wrap-jsx.js) is:
//
//     type = interopComponents.get(type) ?? type;
//
// There is no `className` check — EVERY <Pressable> in the app is swapped for
// the interop wrapper whether or not it uses NativeWind. That wrapper treats
// `style` strictly as an object (native-interop.js does `props.style ??= {}`
// and then reads `props.style?.[key]`). A function is non-nullish, so `??=`
// keeps it and every property read returns undefined — there is no branch for
// a callable style anywhere in the runtime.
//
// The result: `style={({ pressed }) => ({ ... })}` — the documented React
// Native API, used at 157 call sites here — is silently DROPPED on native.
// Not one declaration lands, so components lose flexDirection, padding,
// borderWidth, backgroundColor and `position: 'absolute'` all at once. That
// was the "every component is broken on mobile" report: chips rendered with
// the icon stacked above the label and no pill, and ListingCard's like badge
// fell out of absolute positioning into normal flow on top of the photo.
//
// Web was unaffected the whole time, which is why the bug looked native-only:
// react-native-web's own Pressable resolves style functions itself.
//
// WHY UNREGISTERING IS SAFE HERE
// ------------------------------
// Exactly one Pressable in this codebase ever used `className`
// (components/SearchBar.tsx, two margin utilities) and it was converted to an
// inline style in the same change. Nothing else depends on Pressable's
// interop, so removing it costs nothing and restores stock RN behaviour for
// all 248 Pressables.
//
// ⚠️  CONSEQUENCE: `className` on <Pressable> no longer does anything, on any
// platform. Use `style` there. Other components (View, Text, Image,
// ScrollView, TextInput …) keep their interop and their className support.
//
// FRAGILITY
// ---------
// `interopComponents` is not exported from the package's public entry
// (dist/index.js), so this reaches into dist/runtime/api — an internal path
// that a NativeWind upgrade could move. Every step is therefore guarded and
// failure is non-fatal: worst case the interop stays registered and we are
// back to today's rendering, never a crash on boot. If styles regress after a
// nativewind bump, check here first.
import { Pressable } from 'react-native';

export function disablePressableInterop(): void {
  try {
    // Order matters. wrap-jsx requires './components' lazily on the first JSX
    // call, and THAT is what registers Pressable. Deleting before it has run
    // would be undone the moment the first element renders, so force the
    // registration to happen now and remove the entry afterwards.
    require('react-native-css-interop/dist/runtime/components');

    const api = require('react-native-css-interop/dist/runtime/api') as {
      interopComponents?: Map<unknown, unknown>;
    };

    const map = api?.interopComponents;
    if (!map || typeof map.delete !== 'function') {
      if (__DEV__) {
        console.warn(
          '[pressableInterop] interopComponents map not found — NativeWind internals ' +
            'likely moved. Function styles on Pressable may be dropped again.',
        );
      }
      return;
    }

    map.delete(Pressable);
  } catch (e) {
    // Never let a styling workaround take down app startup.
    if (__DEV__) console.warn('[pressableInterop] failed to unregister', e);
  }
}
