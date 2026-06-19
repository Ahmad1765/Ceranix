import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isFresh, markFresh, invalidateFresh, FEED_TTL_MS } from '@/lib/freshness';

describe('freshness gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invalidateFresh(); // clear all stamps between tests (module-level Map)
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an unstamped key is never fresh', () => {
    expect(isFresh('home')).toBe(false);
  });

  it('a just-stamped key is fresh', () => {
    markFresh('home');
    expect(isFresh('home')).toBe(true);
  });

  it('stays fresh within the TTL window and goes stale just after', () => {
    markFresh('home');
    vi.advanceTimersByTime(FEED_TTL_MS - 1);
    expect(isFresh('home')).toBe(true);
    vi.advanceTimersByTime(2); // now past the window
    expect(isFresh('home')).toBe(false);
  });

  it('honours a custom TTL', () => {
    markFresh('k');
    vi.advanceTimersByTime(500);
    expect(isFresh('k', 1000)).toBe(true);
    expect(isFresh('k', 200)).toBe(false);
  });

  it('invalidateFresh(key) drops just that key', () => {
    markFresh('a');
    markFresh('b');
    invalidateFresh('a');
    expect(isFresh('a')).toBe(false);
    expect(isFresh('b')).toBe(true);
  });

  it('invalidateFresh() with no key clears everything', () => {
    markFresh('a');
    markFresh('b');
    invalidateFresh();
    expect(isFresh('a')).toBe(false);
    expect(isFresh('b')).toBe(false);
  });

  it('keys are independent', () => {
    markFresh('a');
    expect(isFresh('a')).toBe(true);
    expect(isFresh('b')).toBe(false);
  });
});
