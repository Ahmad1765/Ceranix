// Save lists (Pinterest-style collections). A listing is "saved" if it
// lives in any of the user's lists. Tap-to-bookmark drops the item in the
// user's protected default list; opening the SaveListSheet lets them pick
// a different bucket or create a new one.
//
// Schema: see supabase migration `add_save_lists`. Two tables:
//   save_lists       — id, user_id, name, emoji, is_default
//   save_list_items  — list_id, listing_id  (composite PK)
//
// All queries here are RLS-gated, so caller errors collapse to empty
// results rather than throwing.

import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';
import {
  getSavedIds,
  invalidateSavedCache,
  updateSavedCache,
} from '@/lib/engagementCache';
import { enqueueOfflineAction, isNetworkError } from '@/lib/offlineSync';

const LISTING_COLUMNS =
  'id, seller_id, title, brand, size, price, category, gender, condition, images, is_sold, likes, tags, created_at';

export type SaveList = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  is_default: boolean;
  created_at: string;
  // Filled in by listSaveLists — not part of the raw row.
  item_count?: number;
};

// Idempotent — seeds the four starter lists on first call, no-op after.
// Memoized per user per session: the RPC is cheap but it's still a network
// round-trip on every profile focus otherwise.
const ensuredFor = new Set<string>();
export async function ensureSaveLists(userId: string): Promise<void> {
  if (ensuredFor.has(userId)) return;
  const { error } = await supabase.rpc('ensure_save_lists', { p_user_id: userId });
  if (error) {
    console.warn('[saves] ensureSaveLists', error.message);
    return; // don't memoize failures
  }
  ensuredFor.add(userId);
}

export async function listSaveLists(userId: string): Promise<SaveList[]> {
  // One round-trip: pull lists, then counts. Cheaper than nested embed
  // because counts run as a separate group-by we can index.
  const [{ data: lists, error: e1 }, { data: counts, error: e2 }] = await Promise.all([
    supabase
      .from('save_lists')
      .select('*')
      .eq('user_id', userId)
      // Default list always sorts first; everything else newest-first.
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('save_list_items')
      .select('list_id, save_lists!inner(user_id)')
      .eq('save_lists.user_id', userId),
  ]);
  if (e1) {
    console.warn('[saves] listSaveLists', e1.message);
    return [];
  }
  if (e2) console.warn('[saves] count', e2.message);
  const tally = new Map<string, number>();
  for (const row of (counts ?? []) as { list_id: string }[]) {
    tally.set(row.list_id, (tally.get(row.list_id) ?? 0) + 1);
  }
  return ((lists ?? []) as SaveList[]).map((l) => ({
    ...l,
    item_count: tally.get(l.id) ?? 0,
  }));
}

export async function createSaveList(
  userId: string,
  name: string,
  emoji: string = '🔖',
): Promise<SaveList | null> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  const { data, error } = await supabase
    .from('save_lists')
    .insert({ user_id: userId, name: trimmed, emoji })
    .select('*')
    .single();
  if (error) {
    console.warn('[saves] createSaveList', error.message);
    return null;
  }
  return data as SaveList;
}

export async function renameSaveList(
  listId: string,
  name: string,
  emoji?: string,
): Promise<boolean> {
  const patch: { name: string; emoji?: string } = { name: name.trim() };
  if (emoji) patch.emoji = emoji;
  const { error } = await supabase.from('save_lists').update(patch).eq('id', listId);
  if (error) {
    console.warn('[saves] renameSaveList', error.message);
    return false;
  }
  return true;
}

// Refuses to delete the protected default list — the DB doesn't enforce
// this so we guard client-side. Returns false on any failure.
export async function deleteSaveList(listId: string): Promise<boolean> {
  const { data: row, error: readErr } = await supabase
    .from('save_lists')
    .select('is_default')
    .eq('id', listId)
    .maybeSingle();
  if (readErr || !row) return false;
  if (row.is_default) return false;
  const { error } = await supabase.from('save_lists').delete().eq('id', listId);
  if (error) {
    console.warn('[saves] deleteSaveList', error.message);
    return false;
  }
  return true;
}

// Returns the set of list IDs that already contain a given listing. Used
// by the sheet to render checkmarks on the lists the user has already
// added this item to.
export async function getListsContaining(
  userId: string,
  listingId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('save_list_items')
    .select('list_id, save_lists!inner(user_id)')
    .eq('listing_id', listingId)
    .eq('save_lists.user_id', userId);
  if (error) {
    console.warn('[saves] getListsContaining', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { list_id: string }[]).map((r) => r.list_id));
}

export async function addToList(
  listId: string,
  listingId: string,
  userId?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('save_list_items')
    .insert({ list_id: listId, listing_id: listingId });
  // 23505 = already in the list. Treat as success.
  if (error && error.code !== '23505') {
    if (isNetworkError(error)) {
      if (userId) {
        await enqueueOfflineAction({
          type: 'save_list_item',
          userId,
          listId,
          listingId,
          op: 'add',
        });
      }
      invalidateSavedCache();
      return true;
    }
    console.warn('[saves] addToList', error.message);
    return false;
  }
  // Multi-list membership makes the net "saved anywhere" state ambiguous
  // here — invalidate instead of guessing.
  invalidateSavedCache();
  return true;
}

export async function removeFromList(
  listId: string,
  listingId: string,
  userId?: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('save_list_items')
    .delete()
    .eq('list_id', listId)
    .eq('listing_id', listingId);
  if (error) {
    if (isNetworkError(error)) {
      if (userId) {
        await enqueueOfflineAction({
          type: 'save_list_item',
          userId,
          listId,
          listingId,
          op: 'remove',
        });
      }
      invalidateSavedCache();
      return true;
    }
    console.warn('[saves] removeFromList', error.message);
    return false;
  }
  invalidateSavedCache();
  return true;
}

// "Is this listing saved by the user in *any* list?" — drives the
// bookmark icon's filled/empty state on cards. Answered from the batched
// engagement cache (one query per user per 30s, not one per card).
export async function isSaved(listingId: string, userId: string): Promise<boolean> {
  const ids = await getSavedIds(userId);
  return ids.has(listingId);
}

// Returns or lazily creates the user's default list ID. The DB seed
// function is idempotent so this safe-creates on first save.
export async function getOrCreateDefaultList(userId: string): Promise<string | null> {
  const { data, error: readErr } = await supabase
    .from('save_lists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (data?.id) return data.id;
  if (readErr && isNetworkError(readErr)) return null;

  await ensureSaveLists(userId);
  const { data: again, error: againErr } = await supabase
    .from('save_lists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (againErr && isNetworkError(againErr)) return null;
  return again?.id ?? null;
}

// Quick-save shortcut. Returns the new saved-state (true on success,
// previous value on failure) so the optimistic UI can roll back.
export async function toggleSave(
  listingId: string,
  userId: string,
  currentlySaved: boolean,
): Promise<boolean> {
  if (currentlySaved) {
    // Pull out of every list the user has it in. Mirrors how the icon
    // reads — once tapped-off, the listing is no longer "saved" anywhere.
    try {
      const lists = await getListsContaining(userId, listingId);
      if (lists.size > 0) {
        const { error } = await supabase
          .from('save_list_items')
          .delete()
          .in('list_id', Array.from(lists))
          .eq('listing_id', listingId);
        if (error && isNetworkError(error)) {
          await enqueueOfflineAction({
            type: 'save_toggle',
            userId,
            listingId,
            targetSaved: false,
          });
          updateSavedCache(userId, listingId, false);
          return false;
        }
      } else {
        // If lists were empty due to network or offline, queue the remove action
        await enqueueOfflineAction({
          type: 'save_toggle',
          userId,
          listingId,
          targetSaved: false,
        });
      }
    } catch (e) {
      if (isNetworkError(e)) {
        await enqueueOfflineAction({
          type: 'save_toggle',
          userId,
          listingId,
          targetSaved: false,
        });
        updateSavedCache(userId, listingId, false);
        return false;
      }
      console.warn('[saves] toggleSave remove', e);
      return currentlySaved;
    }
    updateSavedCache(userId, listingId, false);
    return false;
  }

  // Saving
  const listId = await getOrCreateDefaultList(userId);
  if (!listId) {
    // Default list couldn't be fetched (likely offline); queue the action
    await enqueueOfflineAction({
      type: 'save_toggle',
      userId,
      listingId,
      targetSaved: true,
    });
    updateSavedCache(userId, listingId, true);
    return true;
  }

  const ok = await addToList(listId, listingId, userId);
  if (ok) updateSavedCache(userId, listingId, true);
  return ok ? true : currentlySaved;
}

// All listings saved across any of the user's lists, newest-save first.
// De-duplicated so an item in multiple lists shows once. Used by the
// "Saved" feed chip and the profile saved tab's flat view.
export async function fetchSavedListings(userId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('save_list_items')
    .select(`created_at, listing:listings(${LISTING_COLUMNS}), save_lists!inner(user_id)`)
    .eq('save_lists.user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[saves] fetchSavedListings', error.message);
    return [];
  }
  const seen = new Set<string>();
  const out: Listing[] = [];
  for (const row of (data ?? []) as unknown as { listing: Listing | Listing[] | null }[]) {
    const l = Array.isArray(row.listing) ? row.listing[0] : row.listing;
    if (l && !seen.has(l.id)) {
      seen.add(l.id);
      out.push(l);
    }
  }
  return out;
}

// Listings inside a single list. Drilling into a list from the profile
// Saved tab uses this.
export async function fetchListingsInList(listId: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('save_list_items')
    .select(`created_at, listing:listings(${LISTING_COLUMNS})`)
    .eq('list_id', listId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[saves] fetchListingsInList', error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as { listing: Listing | Listing[] | null }[];
  return rows
    .map((row) => (Array.isArray(row.listing) ? row.listing[0] : row.listing))
    .filter((l): l is Listing => l != null);
}
