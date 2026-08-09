import { describe, it, expect } from 'vitest';
import { errorMessage, isAbortError } from '@/lib/errors';

// A DOMException-shaped rejection whose prototype chain does NOT include Error.
// This is the case that matters: fetch aborts reject with a DOMException, and
// whether that is `instanceof Error` differs by engine. These helpers replaced
// hand-written `e?.name === 'AbortError'` / `e?.message ?? ''` checks at several
// call sites, so they have to classify it the same way those did.
const domExceptionLike = { name: 'AbortError', message: 'The operation was aborted.' };

describe('errorMessage', () => {
  it('reads a real Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('passes a thrown string through', () => {
    expect(errorMessage('boom')).toBe('boom');
  });

  it('reads .message off a non-Error object', () => {
    expect(errorMessage(domExceptionLike)).toBe('The operation was aborted.');
  });

  it('returns empty string for values with no usable message', () => {
    expect(errorMessage(null)).toBe('');
    expect(errorMessage(undefined)).toBe('');
    expect(errorMessage(42)).toBe('');
    expect(errorMessage({})).toBe('');
    expect(errorMessage({ message: 123 })).toBe('');
  });
});

describe('isAbortError', () => {
  it('treats an already-aborted signal as a cancellation regardless of the value', () => {
    const c = new AbortController();
    c.abort();
    expect(isAbortError(new Error('anything'), c.signal)).toBe(true);
  });

  it('recognises an AbortError that is not an instance of Error', () => {
    // The regression guard: an `e instanceof Error` check returns false here,
    // which would surface a silent timeout to the user as a load failure.
    expect(domExceptionLike instanceof Error).toBe(false);
    expect(isAbortError(domExceptionLike)).toBe(true);
  });

  it('recognises an AbortError with a live (un-aborted) signal', () => {
    // A supabase timeoutFetch aborts its OWN controller, so the caller's signal
    // reads un-aborted while the rejection is still a cancellation.
    const c = new AbortController();
    expect(c.signal.aborted).toBe(false);
    expect(isAbortError(domExceptionLike, c.signal)).toBe(true);
  });

  it('falls back to message matching', () => {
    expect(isAbortError(new Error('request aborted'))).toBe(true);
    expect(isAbortError(new Error('AbortError: nope'))).toBe(true);
  });

  it('does not misclassify a genuine failure', () => {
    expect(isAbortError(new Error('Network request failed'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError({ name: 'TypeError', message: 'bad json' })).toBe(false);
  });
});
