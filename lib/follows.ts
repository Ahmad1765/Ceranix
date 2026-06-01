import { supabase } from '@/lib/supabase';

export type FollowState = {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
};

// Read the relationship between the current user and the target user, plus
// the target's follower/following counts. One round trip.
export async function fetchFollowState(
  followerId: string | null | undefined,
  followeeId: string,
): Promise<FollowState> {
  const [{ data: profile }, edge] = await Promise.all([
    supabase
      .from('profiles')
      .select('followers_count, following_count')
      .eq('id', followeeId)
      .maybeSingle(),
    followerId
      ? supabase
          .from('user_follows')
          .select('followee_id')
          .eq('follower_id', followerId)
          .eq('followee_id', followeeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    followersCount: Number(profile?.followers_count ?? 0),
    followingCount: Number(profile?.following_count ?? 0),
    isFollowing: !!(edge as { data: unknown }).data,
  };
}

export async function followUser(
  followerId: string,
  followeeId: string,
): Promise<void> {
  if (followerId === followeeId) throw new Error("Can't follow yourself");
  const { error } = await supabase
    .from('user_follows')
    .upsert(
      { follower_id: followerId, followee_id: followeeId },
      { onConflict: 'follower_id,followee_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function unfollowUser(
  followerId: string,
  followeeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  if (error) throw new Error(error.message);
}

// Returns the new isFollowing state after toggling. Caller passes the
// current state for optimistic-flip ergonomics.
export async function toggleFollow(
  followerId: string,
  followeeId: string,
  currentlyFollowing: boolean,
): Promise<boolean> {
  if (currentlyFollowing) {
    await unfollowUser(followerId, followeeId);
    return false;
  }
  await followUser(followerId, followeeId);
  return true;
}
