// lib/wardrobe.ts — data logic for the wardrobe feature (Supabase reads/writes).
// Mirrors lib/listings.ts style. TanStack hooks that wrap these live in
// lib/queries.ts.
import { supabase } from '@/lib/supabase';
import { filterUnseen, dedupeById } from '@/lib/wardrobe/deckState';

export type SwipeDirection = 'like' | 'pass';

export interface WardrobePost {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  tags: string[];
  face_hidden: boolean;
  bg_removed: boolean;
  likes_count: number;
  created_at: string;
  author?: { username: string; avatar_url: string | null };
}

const POST_SELECT =
  'id, user_id, image_url, caption, tags, face_hidden, bg_removed, likes_count, created_at, author:profiles!wardrobe_posts_user_id_fkey(username, avatar_url)';

// Normalize the joined author (supabase returns it as an array for !fk embeds
// in some shapes) to a single object | undefined.
function normalize(row: any): WardrobePost {
  const a = Array.isArray(row.author) ? row.author[0] : row.author;
  return { ...row, author: a ?? undefined } as WardrobePost;
}

export async function createWardrobePost(args: {
  userId: string;
  imageUrl: string;
  caption: string | null;
  tags: string[];
  faceHidden: boolean;
  bgRemoved: boolean;
}): Promise<WardrobePost> {
  const { data, error } = await supabase
    .from('wardrobe_posts')
    .insert({
      user_id: args.userId,
      image_url: args.imageUrl,
      caption: args.caption,
      tags: args.tags,
      face_hidden: args.faceHidden,
      bg_removed: args.bgRemoved,
    })
    .select(POST_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return normalize(data);
}

export async function deleteWardrobePost(id: string): Promise<void> {
  const { error } = await supabase.from('wardrobe_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Deck: newest posts that are not mine and I have not swiped yet. We fetch a
// window of recent posts (excluding my own via SQL) plus my swiped ids, then
// filter unseen in JS (small v1 volume; keeps a pure, testable boundary).
export async function fetchDeck(userId: string, limit = 20): Promise<WardrobePost[]> {
  const [postsRes, swipesRes] = await Promise.all([
    supabase
      .from('wardrobe_posts')
      .select(POST_SELECT)
      .neq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit * 3),
    supabase.from('wardrobe_swipes').select('post_id').eq('user_id', userId),
  ]);
  if (postsRes.error) throw new Error(postsRes.error.message);
  if (swipesRes.error) throw new Error(swipesRes.error.message);
  const seen = new Set((swipesRes.data ?? []).map((r: any) => r.post_id as string));
  const posts = dedupeById((postsRes.data ?? []).map(normalize));
  return filterUnseen(posts, seen).slice(0, limit);
}

export async function recordSwipe(
  postId: string,
  userId: string,
  direction: SwipeDirection,
): Promise<void> {
  // upsert so a re-swipe on the same post updates direction (and the trigger
  // reconciles likes_count) instead of erroring on the unique(post_id,user_id).
  const { error } = await supabase
    .from('wardrobe_swipes')
    .upsert(
      { post_id: postId, user_id: userId, direction },
      { onConflict: 'post_id,user_id' },
    );
  if (error) throw new Error(error.message);
}

export async function fetchMyWardrobe(userId: string): Promise<WardrobePost[]> {
  const { data, error } = await supabase
    .from('wardrobe_posts')
    .select(POST_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalize);
}

export async function fetchLikedWardrobe(userId: string): Promise<WardrobePost[]> {
  const { data, error } = await supabase
    .from('wardrobe_swipes')
    .select(`post:wardrobe_posts(${POST_SELECT})`)
    .eq('user_id', userId)
    .eq('direction', 'like')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r: any) => (Array.isArray(r.post) ? r.post[0] : r.post))
    .filter(Boolean)
    .map(normalize);
}
