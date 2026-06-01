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

// One round trip: get_follow_state returns target's counts + whether the
// current auth.uid() follows them. Replaces the previous two-table fanout
// which paid two latencies for what is conceptually one read.
export async function fetchFollowState(
  _followerId: string | null | undefined,
  followeeId: string,
): Promise<FollowState> {
  const { data, error } = await supabase.rpc('get_follow_state', {
    p_followee: followeeId,
  });
  if (error) {
    console.warn('[follows] fetchFollowState', error.message);
    return { isFollowing: false, followersCount: 0, followingCount: 0 };
  }
  return fromRpc(data as RpcShape | null);
}

// Atomic toggle: one server call decides insert-vs-delete based on the row's
// real state and returns the new counts. The previous insert/delete pair had
// two failure surfaces (RLS, web fetch wedge), and a transient abort on the
// write was rolling back the optimistic UI — the "follow flips back" bug.
// SECURITY DEFINER means no RLS round-trip; the RPC itself enforces caller
// identity via auth.uid().
export async function toggleFollow(
  _followerId: string,
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
  return fromRpc(data as RpcShape | null);
}
