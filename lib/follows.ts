import { supabase } from '@/lib/supabase';

export type FollowState = {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
};

type RpcShape = {
  is_following: boolean;
  followers_count: number;
  following_count: number;
};

function fromRpc(raw: RpcShape | null | undefined): FollowState {
  return {
    isFollowing: !!raw?.is_following,
    followersCount: Number(raw?.followers_count ?? 0),
    followingCount: Number(raw?.following_count ?? 0),
  };
}

// Module-level cache for follow states. Mirrors lib/listingCache.ts — same
// rationale: the Supabase web client occasionally wedges and the RPC either
// times out or fires without a valid JWT, in which case the read returns the
// fallback "is_following: false". Without a cache that's indistinguishable
// from a real unfollow, so the product/user screens used to flip back to
// "Follow" on every re-mount. The cache preserves last-known-good state
// across mounts within one app session.
const followCache = new Map<string, FollowState>();

function cacheKey(followerId: string | null | undefined, followeeId: string): string {
  return `${followerId ?? 'anon'}:${followeeId}`;
}

export function getCachedFollowState(
  followerId: string | null | undefined,
  followeeId: string | null | undefined,
): FollowState | null {
  if (!followeeId) return null;
  return followCache.get(cacheKey(followerId, followeeId)) ?? null;
}

function putCachedFollowState(
  followerId: string | null | undefined,
  followeeId: string,
  state: FollowState,
): void {
  followCache.set(cacheKey(followerId, followeeId), state);
}

export function clearFollowCache(): void {
  followCache.clear();
}

// One round trip: get_follow_state returns target's counts + whether the
// current auth.uid() follows them. Replaces the previous two-table fanout
// which paid two latencies for what is conceptually one read.
// Returns null on RPC error so callers can preserve last-known state instead
// of falsely committing "isFollowing: false" (the old fallback was the source
// of the "Follow button reverts on reopen" bug — that shape is indistinguishable
// from a real unfollow).
export async function fetchFollowState(
  followerId: string | null | undefined,
  followeeId: string,
): Promise<FollowState | null> {
  const { data, error } = await supabase.rpc('get_follow_state', {
    p_followee: followeeId,
  });
  if (error) {
    console.warn('[follows] fetchFollowState', error.message);
    return null;
  }
  const state = fromRpc(data as RpcShape | null);
  putCachedFollowState(followerId, followeeId, state);
  return state;
}

// Atomic toggle: one server call decides insert-vs-delete based on the row's
// real state and returns the new counts. The previous insert/delete pair had
// two failure surfaces (RLS, web fetch wedge), and a transient abort on the
// write was rolling back the optimistic UI — the "follow flips back" bug.
// SECURITY DEFINER means no RLS round-trip; the RPC itself enforces caller
// identity via auth.uid().
export async function toggleFollow(
  followerId: string,
  followeeId: string,
  _currentlyFollowing: boolean,
): Promise<FollowState> {
  const { data, error } = await supabase.rpc('toggle_follow', {
    p_followee: followeeId,
  });
  if (error) {
    console.warn('[follows] toggleFollow', error.code, error.message);
    throw new Error(error.message);
  }
  const state = fromRpc(data as RpcShape | null);
  putCachedFollowState(followerId, followeeId, state);
  return state;
}
