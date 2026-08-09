// Bounded-concurrency map.
//
// Why not Promise.all: it starts everything at once, and on the first rejection
// it resolves the caller while the remaining promises keep running. For uploads
// that is actively harmful — the caller begins rolling back storage objects
// while in-flight writes are still landing, so those land AFTER the rollback and
// orphan themselves. This waits for every started task to settle before
// reporting the failure.
//
// Kept free of react-native/expo/supabase imports so vitest covers it.

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving input order
 * in the result.
 *
 * On failure: no NEW tasks are started, already-running ones are awaited to
 * completion, and the first error (in input order) is thrown. That ordering
 * guarantee is what lets a caller safely clean up side effects afterwards.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  // A limit below 1 would start nothing and hang; clamp rather than deadlock.
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  const errors = new Array<unknown>(items.length);
  let failed = false;
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      // Stop claiming work once anything has failed — the caller is going to
      // discard the whole batch, so further uploads are pure waste.
      if (failed) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        errors[i] = e ?? new Error('unknown error');
        failed = true;
        return;
      }
    }
  }

  // run() never rejects — it captures — so this settles every started task.
  await Promise.all(Array.from({ length: workers }, run));

  if (failed) {
    const firstIdx = errors.findIndex((e) => e !== undefined);
    throw errors[firstIdx];
  }
  return results;
}
