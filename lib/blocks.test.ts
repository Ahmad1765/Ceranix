import { describe, it, expect, beforeEach, vi } from 'vitest';
import { blockUser, unblockUser, isUserBlocked, getBlockedUserIds } from './blocks';
import { supabase } from './supabase';

const mockStorage: Record<string, string> = {};

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStorage[key] ?? null),
    setItem: vi.fn(async (key: string, val: string) => {
      // Small simulated delay to thoroughly exercise concurrency locking
      await new Promise((r) => setTimeout(r, 5));
      mockStorage[key] = val;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete mockStorage[key];
    }),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('blocks lib', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  it('blocks and unblocks a user correctly', async () => {
    const blocker = 'user-1';
    const target = 'user-2';

    expect(await isUserBlocked(blocker, target)).toBe(false);

    const success = await blockUser({
      blockerId: blocker,
      blockedId: target,
      reason: 'spam',
    });
    expect(success).toBe(true);
    expect(await isUserBlocked(blocker, target)).toBe(true);

    const unblockSuccess = await unblockUser({
      blockerId: blocker,
      blockedId: target,
    });
    expect(unblockSuccess).toBe(true);
    expect(await isUserBlocked(blocker, target)).toBe(false);
  });

  it('handles concurrent blockUser calls without overwriting each other', async () => {
    const blocker = 'user-1';
    const targetA = 'user-2';
    const targetB = 'user-3';

    await Promise.all([
      blockUser({ blockerId: blocker, blockedId: targetA }),
      blockUser({ blockerId: blocker, blockedId: targetB }),
    ]);

    const list = await getBlockedUserIds(blocker);
    expect(list).toContain(targetA);
    expect(list).toContain(targetB);
    expect(list.length).toBe(2);
  });

  it('completes blocking successfully even if reports insert encounters an error', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce({
      insert: vi.fn().mockResolvedValueOnce({ error: { message: 'Database error' } }),
    } as any);

    const blocker = 'user-1';
    const target = 'user-99';

    const success = await blockUser({
      blockerId: blocker,
      blockedId: target,
      reason: 'harassment',
    });

    expect(success).toBe(true);
    expect(await isUserBlocked(blocker, target)).toBe(true);
  });
});
