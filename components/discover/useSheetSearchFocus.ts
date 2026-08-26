// Raises the keyboard when the Discover sheet opens.
//
// `autoFocus` is not enough here. A React Native Modal is its own window, and
// Android's input-method manager drops focus requests aimed at a window that is
// still animating in — so `autoFocus` leaves the caret sitting in the field with
// no keyboard, and the user has to tap the thing that is already focused. The
// fix everyone lands on is to focus programmatically once the sheet has settled.
//
// Two triggers, because neither is reliable alone:
//   • runAfterInteractions fires when the slide-up finishes — the right moment,
//     but it can resolve early (or leak a handle and resolve late).
//   • a fixed backstop covers that case.
// focus() on an already-focused input is a no-op, so both firing is harmless.
//
// Lives in its own file rather than in DiscoverSheet.tsx so any sheet body can
// use it without the two modules importing each other.

import { useEffect, type RefObject } from 'react';
import { InteractionManager, Platform, type TextInput } from 'react-native';

/** Past the Modal's slide-up (~300ms) with room to spare. */
const BACKSTOP_MS = 450;

export function useSheetSearchFocus(ref: RefObject<TextInput | null>) {
  useEffect(() => {
    let cancelled = false;
    const focus = () => {
      if (cancelled) return;
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        }
        try {
          (ref.current as any)?.focus?.({ preventScroll: true });
        } catch {
          ref.current?.focus();
        }
        if (typeof window !== 'undefined') {
          requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
          });
        }
      } else {
        ref.current?.focus();
      }
    };

    // Web takes focus the instant the field exists, rather than waiting for a
    // trigger below. On mobile web the keyboard is already up — DiscoverSheet's
    // <KeyboardPrimer> claimed it during the tap — and it only STAYS up if
    // focus moves straight to another text input. Waiting ~450ms here would let
    // the browser decide the primer's blur meant "done typing" and drop it.
    if (Platform.OS === 'web') focus();

    const task = InteractionManager.runAfterInteractions(focus);
    const backstop = setTimeout(focus, BACKSTOP_MS);

    return () => {
      cancelled = true;
      task.cancel();
      clearTimeout(backstop);
    };
  }, [ref]);
}
