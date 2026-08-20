import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  coalesceActions,
  isNetworkError,
  enqueueOfflineAction,
  getOfflineQueue,
  flushOfflineSyncQueue,
  type OfflineAction,
} from '@/lib/offlineSync';

// In-memory mock storage
const mockStorage: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStorage[key] ?? null),
    setItem: vi.fn(async (key: string, val: string) => {
      mockStorage[key] = val;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete mockStorage[key];
    }),
  },
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: vi.fn(() => () => {}),
  },
}));

let mockRpcError: any = null;
let mockInsertError: any = null;
let mockDeleteError: any = null;
const executedCalls: any[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: 'list_123' }, error: null })),
            })),
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
        insert: vi.fn(async (data: any) => {
          executedCalls.push({ action: 'insert', table, data });
          return { error: mockInsertError };
        }),
        delete: vi.fn(() => ({
          eq: vi.fn((col: string, val: string) => ({
            eq: vi.fn((col2: string, val2: string) => {
              executedCalls.push({ action: 'delete', table, [col]: val, [col2]: val2 });
              return Promise.resolve({ error: mockDeleteError });
            }),
          })),
          in: vi.fn(() => ({
            eq: vi.fn(async () => {
              executedCalls.push({ action: 'delete_in', table });
              return { error: mockDeleteError };
            }),
          })),
        })),
      };
    }),
    rpc: vi.fn(async () => ({ error: mockRpcError })),
  },
}));

vi.mock('@/lib/engagementCache', () => ({
  updateLikedCache: vi.fn(),
  updateSavedCache: vi.fn(),
  invalidateSavedCache: vi.fn(),
}));

describe('Offline Action Sync Queue', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    mockRpcError = null;
    mockInsertError = null;
    mockDeleteError = null;
    executedCalls.length = 0;
  });

  describe('coalesceActions', () => {
    it('collapses consecutive like/unlike actions on the same listing to the latest target state', () => {
      const actions: OfflineAction[] = [
        { id: '1', type: 'like_toggle', userId: 'u1', listingId: 'l1', targetLiked: true, timestamp: 100 },
        { id: '2', type: 'like_toggle', userId: 'u1', listingId: 'l1', targetLiked: false, timestamp: 200 },
        { id: '3', type: 'like_toggle', userId: 'u1', listingId: 'l1', targetLiked: true, timestamp: 300 },
      ];

      const coalesced = coalesceActions(actions);
      expect(coalesced).toHaveLength(1);
      expect(coalesced[0].id).toBe('3');
      expect((coalesced[0] as any).targetLiked).toBe(true);
    });

    it('keeps actions for distinct listings separate', () => {
      const actions: OfflineAction[] = [
        { id: '1', type: 'like_toggle', userId: 'u1', listingId: 'l1', targetLiked: true, timestamp: 100 },
        { id: '2', type: 'like_toggle', userId: 'u1', listingId: 'l2', targetLiked: true, timestamp: 200 },
      ];

      const coalesced = coalesceActions(actions);
      expect(coalesced).toHaveLength(2);
      expect(coalesced.map((a) => a.id)).toEqual(['1', '2']);
    });

    it('collapses save list item add/remove on the same list and listing', () => {
      const actions: OfflineAction[] = [
        { id: '1', type: 'save_list_item', userId: 'u1', listId: 'list1', listingId: 'l1', op: 'add', timestamp: 100 },
        { id: '2', type: 'save_list_item', userId: 'u1', listId: 'list1', listingId: 'l1', op: 'remove', timestamp: 200 },
      ];

      const coalesced = coalesceActions(actions);
      expect(coalesced).toHaveLength(1);
      expect((coalesced[0] as any).op).toBe('remove');
    });
  });

  describe('isNetworkError', () => {
    it('detects network, offline, and fetch errors correctly', () => {
      expect(isNetworkError(new Error('Network request failed'))).toBe(true);
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
      expect(isNetworkError(new Error('Device is offline'))).toBe(true);
      expect(isNetworkError(new Error('Connection timeout'))).toBe(true);
      expect(isNetworkError({ message: 'Network request failed' })).toBe(true);
      expect(isNetworkError({ message: 'Failed to fetch', code: 'PGRST' })).toBe(true);
      expect(isNetworkError({ message: 'Invalid credentials' })).toBe(false);
      expect(isNetworkError(new Error('Invalid credentials'))).toBe(false);
      expect(isNetworkError(null)).toBe(false);
    });
  });

  describe('enqueue and flush', () => {
    it('enqueues actions and persists them to storage', async () => {
      await enqueueOfflineAction({
        type: 'like_toggle',
        userId: 'u1',
        listingId: 'l1',
        targetLiked: true,
      });

      const queue = await getOfflineQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].userId).toBe('u1');
      expect(queue[0].listingId).toBe('l1');
    });

    it('flushes queued actions against Supabase successfully', async () => {
      await enqueueOfflineAction({
        type: 'like_toggle',
        userId: 'u1',
        listingId: 'l1',
        targetLiked: true,
      });

      const { syncedCount, errors } = await flushOfflineSyncQueue();
      expect(syncedCount).toBe(1);
      expect(errors).toBe(0);

      const queueAfter = await getOfflineQueue();
      expect(queueAfter).toHaveLength(0);
      expect(executedCalls).toHaveLength(1);
      expect(executedCalls[0].action).toBe('insert');
      expect(executedCalls[0].data).toEqual({ user_id: 'u1', listing_id: 'l1' });
    });

    it('keeps actions in queue if network error occurs during flush', async () => {
      mockInsertError = new Error('Network request failed');

      await enqueueOfflineAction({
        type: 'like_toggle',
        userId: 'u1',
        listingId: 'l1',
        targetLiked: true,
      });

      const { syncedCount, errors } = await flushOfflineSyncQueue();
      expect(syncedCount).toBe(0);
      expect(errors).toBe(1);

      // Action must stay in queue for next retry
      const queueAfter = await getOfflineQueue();
      expect(queueAfter).toHaveLength(1);
    });
  });
});
