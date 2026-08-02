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

/** Best-effort message for an unknown thrown value. Never throws. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return '';
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
  if (e instanceof Error && e.name === 'AbortError') return true;
  const msg = errorMessage(e);
  return msg.includes('aborted') || msg.includes('AbortError');
}
