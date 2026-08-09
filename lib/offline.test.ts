import { describe, it, expect } from 'vitest';
import { deriveOffline } from '@/lib/offlineState';

describe('deriveOffline', () => {
  it('is offline when isConnected is explicitly false', () => {
    expect(deriveOffline({ isConnected: false, isInternetReachable: true })).toBe(true);
  });

  it('is offline when the internet is explicitly unreachable', () => {
    expect(deriveOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('is online when connected and internet is reachable', () => {
    expect(deriveOffline({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('assumes online while connectivity is still unknown (null)', () => {
    // NetInfo reports null while probing; isInternetReachable is frequently null
    // on web. Treating unknown as offline would flash a false banner on boot.
    expect(deriveOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
  });

  it('assumes online when connected but reachability is still unknown', () => {
    expect(deriveOffline({ isConnected: true, isInternetReachable: null })).toBe(false);
  });
});
