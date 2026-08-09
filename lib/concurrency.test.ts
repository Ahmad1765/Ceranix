import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '@/lib/concurrency';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Tracks how many tasks are running at once, and the peak. */
function tracker() {
  const t = { live: 0, peak: 0, started: [] as number[], finished: [] as number[] };
  return {
    t,
    async task(i: number, ms = 5) {
      t.live++;
      t.peak = Math.max(t.peak, t.live);
      t.started.push(i);
      await tick(ms);
      t.live--;
      t.finished.push(i);
      return i * 10;
    },
  };
}

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    // Reverse the durations so later items finish first — results must still
    // line up with their inputs. Listing images depend on this: thumbnails must
    // stay index-aligned with images.
    const items = [0, 1, 2, 3, 4];
    const out = await mapWithConcurrency(items, 3, async (n) => {
      await tick((items.length - n) * 5);
      return `v${n}`;
    });
    expect(out).toEqual(['v0', 'v1', 'v2', 'v3', 'v4']);
  });

  it('never exceeds the concurrency limit', async () => {
    const { t, task } = tracker();
    await mapWithConcurrency([0, 1, 2, 3, 4, 5, 6, 7], 3, task);
    expect(t.peak).toBe(3);
  });

  it('actually runs work in parallel', async () => {
    // 6 tasks x 20ms with a limit of 3 should take ~2 rounds (~40ms), not ~120ms.
    const started = Date.now();
    await mapWithConcurrency([0, 1, 2, 3, 4, 5], 3, () => tick(20));
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(110); // generous: sequential would be >=120
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it('clamps a nonsense limit instead of hanging', async () => {
    // A limit of 0 would start no workers and never resolve.
    for (const bad of [0, -1, NaN]) {
      expect(await mapWithConcurrency([1, 2], bad as number, async (n) => n * 2)).toEqual([2, 4]);
    }
  });

  it('runs sequentially when the limit is 1', async () => {
    const { t, task } = tracker();
    await mapWithConcurrency([0, 1, 2], 1, task);
    expect(t.peak).toBe(1);
    expect(t.finished).toEqual([0, 1, 2]);
  });

  describe('failure handling', () => {
    it('throws the failing task\'s error', async () => {
      await expect(
        mapWithConcurrency([0, 1, 2], 2, async (n) => {
          if (n === 1) throw new Error('boom');
          return n;
        }),
      ).rejects.toThrow('boom');
    });

    it('waits for in-flight tasks to settle before throwing', async () => {
      // THE load-bearing property. uploadListingImages rolls back storage
      // objects after a failure; if this resolved while writes were still in
      // flight, those writes would land AFTER the rollback and be orphaned.
      const { t, task } = tracker();
      await expect(
        mapWithConcurrency([0, 1, 2], 3, async (n) => {
          if (n === 0) {
            await tick(1);
            throw new Error('fail fast');
          }
          return task(n, 30); // still running when 0 rejects
        }),
      ).rejects.toThrow('fail fast');

      // Everything that started has also finished — nothing is still running.
      expect(t.live).toBe(0);
      expect(t.finished.sort()).toEqual(t.started.sort());
    });

    it('starts no new work after a failure', async () => {
      const seen: number[] = [];
      await expect(
        mapWithConcurrency([0, 1, 2, 3, 4, 5, 6, 7], 2, async (n) => {
          seen.push(n);
          await tick(5);
          if (n === 0) throw new Error('stop');
          return n;
        }),
      ).rejects.toThrow('stop');
      // With a limit of 2 the first pair starts; after 0 fails, later indices
      // must never be claimed.
      expect(Math.max(...seen)).toBeLessThan(4);
      expect(seen).not.toContain(7);
    });

    it('reports the first failure in INPUT order, not completion order', async () => {
      // Task 2 rejects sooner in wall-clock terms, but task 1 comes first in
      // the list; a caller surfacing this to a user should name the earliest
      // photo, deterministically.
      await expect(
        mapWithConcurrency([0, 1, 2], 3, async (n) => {
          if (n === 1) {
            await tick(20);
            throw new Error('slow-early');
          }
          if (n === 2) {
            await tick(1);
            throw new Error('fast-late');
          }
          return n;
        }),
      ).rejects.toThrow('slow-early');
    });
  });
});
