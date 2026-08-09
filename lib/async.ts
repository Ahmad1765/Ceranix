// Race a promise against a timeout. If the underlying call hangs (a known
// Supabase web issue during auth refresh, or a flaky network), we resolve
// with the fallback value rather than leaving the UI stuck on a spinner
// forever.
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.warn('[withTimeout] caught', err?.message ?? err);
        resolve(fallback);
      },
    );
  });
}
