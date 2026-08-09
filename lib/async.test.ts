import { describe, it, expect, afterEach, vi } from 'vitest';
import { withTimeout } from '@/lib/async';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves with the promise value when it settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, -1)).resolves.toBe(42);
  });

  it('resolves with the fallback when the promise rejects', async () => {
    // The util logs a warning on rejection — silence it for a clean run.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 1000, 'fallback'),
    ).resolves.toBe('fallback');
  });

  it('resolves with the fallback when the timeout fires first', async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {}); // never settles
    const p = withTimeout(never, 50, 'fb');
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBe('fb');
  });

  it('a late resolution does not override the fallback once the timeout won', async () => {
    vi.useFakeTimers();
    let resolveLate: (v: string) => void = () => {};
    const late = new Promise<string>((res) => {
      resolveLate = res;
    });
    const p = withTimeout(late, 50, 'fb');
    await vi.advanceTimersByTimeAsync(50); // timeout wins → 'fb'
    resolveLate('late-value'); // arrives too late
    await expect(p).resolves.toBe('fb');
  });
});
