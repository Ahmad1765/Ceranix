// Error-shape helpers, deliberately written as plain functions rather than
// inline expressions at the call sites.
//
// The reason is mechanical, not stylistic. babel-plugin-react-compiler@1.0.0
// cannot lower "value blocks (conditional, logical, optional chaining, etc)
// within a try/catch statement", and when it hits one it bails out of the
// ENTIRE enclosing component — not just the offending function. So a catch
// clause written as
//
//     } catch (e: any) {
//       toast.show(e?.message ?? 'Something failed');
//     }
//
// silently costs that whole screen its React Compiler memoization. Calling a
// hoisted helper instead keeps the catch body free of `?.`, `??`, `?:`, `&&`
// and `||`, which is all the compiler needs.
//
// Verify a screen's status after editing one of these blocks — the bailout is
// silent in a normal build (the preset runs the plugin with
// `panicThreshold: 'NONE'` in production).

// Both helpers read `.name`/`.message` structurally rather than testing
// `e instanceof Error`, and that is load-bearing rather than defensive style.
//
// A fetch abort rejects with a DOMException, which is NOT reliably an instance
// of Error across JS engines (WebIDL only made DOMException inherit from Error
// in a later revision, and Hermes/react-native-web do not agree with each other
// here). An `instanceof Error` check therefore silently fails to recognise the
// one rejection type these helpers exist to classify. Reading the property is
// exactly what the hand-written `e?.name === 'AbortError'` / `e?.message ?? ''`
// call sites did before they were centralised here, so this also keeps those
// rewrites behaviour-preserving.

function readStringProp(e: unknown, key: 'name' | 'message'): string {
  if (typeof e === 'object' && e !== null) {
    const v = (e as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return '';
}

/** Best-effort message for an unknown thrown value. Never throws. */
export function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  return readStringProp(e, 'message');
}

/**
 * Whether a rejection is a request cancellation rather than a real failure.
 *
 * Cancellations fire on unmount, HMR, and param changes whenever an effect
 * aborts its own in-flight request on cleanup — they are expected, and must not
 * surface as an error state to the user.
 *
 * Pass the AbortSignal the request was issued with when there is one; an
 * already-aborted signal is treated as a cancellation regardless of what was
 * thrown, since some fetch layers reject with their own error type.
 */
export function isAbortError(e: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (readStringProp(e, 'name') === 'AbortError') return true;
  const msg = errorMessage(e);
  return msg.includes('aborted') || msg.includes('AbortError');
}
