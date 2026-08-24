import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addToList, removeFromList, getListsContaining, toggleSave, getOrCreateDefaultList } from './saves';
import { supabase } from './supabase';
import { enqueueOfflineAction } from './offlineSync';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/offlineSync', () => ({
  enqueueOfflineAction: vi.fn().mockResolvedValue('offline-1'),
  isNetworkError: vi.fn((err: any) => Boolean(err && (err.code === 'NETWORK_ERROR' || err.message?.includes('fetch') || err.message?.includes('Network')))),
}));

vi.mock('@/lib/engagementCache', () => ({
  getSavedIds: vi.fn().mockResolvedValue(new Set()),
  updateSavedCache: vi.fn(),
  invalidateSavedCache: vi.fn(),
  fetchSavedIdsBatch: vi.fn(),
}));

describe('lib/saves network error handling and empty set behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('addToList returns false on network error when userId is missing', async () => {
    (supabase.from as any).mockReturnValue({
      insert: vi.fn().mockResolvedValue({
        error: { message: 'Failed to fetch', code: 'NETWORK_ERROR' },
      }),
    });

    const result = await addToList('list-1', 'listing-1');
    expect(result).toBe(false);
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it('addToList enqueues offline action and returns true on network error when userId is present', async () => {
    (supabase.from as any).mockReturnValue({
      insert: vi.fn().mockResolvedValue({
        error: { message: 'Failed to fetch', code: 'NETWORK_ERROR' },
      }),
    });

    const result = await addToList('list-1', 'listing-1', 'user-123');
    expect(result).toBe(true);
    expect(enqueueOfflineAction).toHaveBeenCalledWith({
      type: 'save_list_item',
      userId: 'user-123',
      listId: 'list-1',
      listingId: 'listing-1',
      op: 'add',
    });
  });

  it('removeFromList returns false on network error when userId is missing', async () => {
    (supabase.from as any).mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Network request failed', code: 'NETWORK_ERROR' },
          }),
        }),
      }),
    });

    const result = await removeFromList('list-1', 'listing-1');
    expect(result).toBe(false);
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it('removeFromList enqueues offline action and returns true on network error when userId is present', async () => {
    (supabase.from as any).mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'Network request failed', code: 'NETWORK_ERROR' },
          }),
        }),
      }),
    });

    const result = await removeFromList('list-1', 'listing-1', 'user-123');
    expect(result).toBe(true);
    expect(enqueueOfflineAction).toHaveBeenCalledWith({
      type: 'save_list_item',
      userId: 'user-123',
      listId: 'list-1',
      listingId: 'listing-1',
      op: 'remove',
    });
  });

  it('getListsContaining throws on database/network error', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Connection failed' },
          }),
        }),
      }),
    });

    await expect(getListsContaining('user-123', 'listing-1')).rejects.toThrow();
  });

  it('toggleSave treats empty membership set as successfully not saved without enqueuing save_toggle', async () => {
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      }),
    });

    const result = await toggleSave('listing-1', 'user-123', true);
    expect(result).toBe(false);
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });

  it('getOrCreateDefaultList returns discriminated status correctly', async () => {
    // 1. Success on read
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'default-list-1' }, error: null }),
          }),
        }),
      }),
    });

    const successRes = await getOrCreateDefaultList('user-1');
    expect(successRes).toEqual({ status: 'success', listId: 'default-list-1' });

    // 2. Network error on read
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Failed to fetch', code: 'NETWORK_ERROR' } }),
          }),
        }),
      }),
    });

    const netRes = await getOrCreateDefaultList('user-1');
    expect(netRes.status).toBe('network_error');

    // 3. Permanent error on read
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } }),
          }),
        }),
      }),
    });

    const permRes = await getOrCreateDefaultList('user-1');
    expect(permRes.status).toBe('error');
  });

  it('toggleSave enqueues save_toggle on network failure but not on permanent error', async () => {
    // Network error when finding default list
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Network timeout', code: 'NETWORK_ERROR' } }),
          }),
        }),
      }),
    });

    const netResult = await toggleSave('listing-net', 'user-1', false);
    expect(netResult).toBe(true);
    expect(enqueueOfflineAction).toHaveBeenCalledWith({
      type: 'save_toggle',
      userId: 'user-1',
      listingId: 'listing-net',
      targetSaved: true,
    });

    vi.clearAllMocks();

    // Permanent error
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Fatal DB Error', code: '500' } }),
          }),
        }),
      }),
    });

    const permResult = await toggleSave('listing-perm', 'user-1', false);
    expect(permResult).toBe(false);
    expect(enqueueOfflineAction).not.toHaveBeenCalled();
  });
});
