// Network-connectivity layer. Two responsibilities, both centralized here so no
// screen ever talks to NetInfo directly:
//
//   1. `initOnlineManager()` — wires NetInfo into TanStack Query's global
//      `onlineManager`. When the device drops offline, Query pauses fetches
//      (fetchStatus 'paused') and keeps serving the persisted cache instead of
//      hanging on a request that can't complete; it auto-resumes on reconnect.
//   2. `useIsOffline()` — a boolean hook for UI (the offline banner).
//
// Both derive their answer from the same pure `deriveOffline()` so behaviour is
// consistent and unit-testable without a device.

import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { deriveOffline } from '@/lib/offlineState';

// Re-export the pure logic (and its type) so callers have one import surface.
export { deriveOffline };
export type { ConnectivitySnapshot } from '@/lib/offlineState';

/**
 * Bridge NetInfo → TanStack Query's onlineManager. Call once at startup (before
 * the first query runs). Idempotent-safe to call once; subsequent calls just
 * replace the listener.
 */
export function initOnlineManager(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(!deriveOffline(state));
    }),
  );
}

/**
 * Subscribe to connectivity for UI. Returns `true` while the device is offline.
 * Seeds from an immediate `NetInfo.fetch()` so the banner reflects reality on
 * mount rather than waiting for the first change event.
 */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    NetInfo.fetch().then((state) => {
      if (active) setOffline(deriveOffline(state));
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (active) setOffline(deriveOffline(state));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return offline;
}
