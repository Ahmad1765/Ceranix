// ─────────────────────────────────────────────────────────────────────────────
// WARDROBE & SWIPE DECK QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Separation of UI Optimism vs Backend Sync
// In the Wardrobe Tinder-style swipe interface, the card stack animates off-screen
// instantly on gesture release. The React Query mutation (`useRecordSwipe`) handles
// background persistence and revalidates the "Liked Wardrobe" tab on success
// without holding back the user's gesture loop.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchDeck,
  recordSwipe,
  createWardrobePost,
  deleteWardrobePost,
  fetchMyWardrobe,
  fetchLikedWardrobe,
  type WardrobePost,
  type SwipeDirection,
} from '@/lib/wardrobe';
import { qk } from './keys';

/**
 * Fetch the swipe deck of wardrobe outfits for discovery.
 */
export function useWardrobeDeckQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.wardrobeDeck(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchDeck(userId as string),
  });
}

/**
 * Fetch the current user's own wardrobe posts.
 */
export function useMyWardrobeQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.myWardrobe(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchMyWardrobe(userId as string),
  });
}

/**
 * Fetch wardrobe posts that the current user has swiped right on / liked.
 */
export function useLikedWardrobeQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.likedWardrobe(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchLikedWardrobe(userId as string),
  });
}

/**
 * Persist swipe gesture result (left/right).
 */
export function useRecordSwipe(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, direction }: { postId: string; direction: SwipeDirection }) =>
      recordSwipe(postId, userId as string, direction),
    onSuccess: (_r, { direction }) => {
      if (direction === 'like') qc.invalidateQueries({ queryKey: qk.likedWardrobe(userId) });
    },
  });
}

/**
 * Upload and create a new wardrobe post.
 */
export function useCreateWardrobePost(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      imageUrl: string;
      caption: string | null;
      tags: string[];
      faceHidden: boolean;
      bgRemoved: boolean;
    }) => createWardrobePost({ userId: userId as string, ...args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myWardrobe(userId) }),
  });
}

/**
 * Delete a wardrobe post with optimistic cache removal.
 */
export function useDeleteWardrobePost(userId: string | null) {
  const qc = useQueryClient();
  const key = qk.myWardrobe(userId);
  return useMutation({
    mutationFn: (id: string) => deleteWardrobePost(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WardrobePost[]>(key);
      qc.setQueryData<WardrobePost[]>(key, (old) => (old ?? []).filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });
}
