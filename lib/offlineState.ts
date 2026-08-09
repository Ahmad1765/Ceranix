// Pure connectivity logic, deliberately isolated from any React Native / NetInfo
// import so it can be unit-tested in a plain Node environment (vitest). The
// side-effectful wiring (NetInfo listeners, onlineManager, the hook) lives in
// `lib/offline.ts`, which re-exports `deriveOffline` from here.

// Structurally compatible with NetInfoState's connectivity fields, but declared
// locally so this module pulls in zero runtime dependencies.
export type ConnectivitySnapshot = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

/**
 * Decide whether we are offline from a connectivity snapshot.
 *
 * We only report offline on an EXPLICIT negative signal — `isConnected === false`
 * or `isInternetReachable === false`. Both fields are `null` while NetInfo is
 * still probing (and `isInternetReachable` is often `null` on web), and treating
 * "unknown" as offline would flash a false banner on every cold start. So unknown
 * ⇒ assume online.
 */
export function deriveOffline(state: ConnectivitySnapshot): boolean {
  if (state.isConnected === false) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}
