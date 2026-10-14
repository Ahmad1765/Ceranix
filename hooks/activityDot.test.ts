import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { hasNewActivity } from './activityDot';
import type { ConversationRow } from '@/lib/chat';

const ME = 'me';
const conv = (over: Partial<ConversationRow>): ConversationRow =>
  ({
    id: 'c1',
    listing_id: null,
    buyer_id: ME,
    seller_id: 'them',
    last_message: 'hi',
    last_sender_id: 'them',
    updated_at: '2026-10-15T10:00:00Z',
    buyer_last_read_at: '2026-10-15T09:00:00Z',
    seller_last_read_at: null,
    ...over,
  }) as ConversationRow;

describe('hasNewActivity', () => {
  it('lights for an unread message from someone else', () => {
    expect(hasNewActivity([conv({})], ME, null, null)).toBe(true);
  });

  it('stays off once I have read the thread', () => {
    expect(hasNewActivity([conv({ buyer_last_read_at: '2026-10-15T11:00:00Z' })], ME, null, null)).toBe(false);
  });

  it('stays off when I sent the last message', () => {
    expect(hasNewActivity([conv({ last_sender_id: ME })], ME, null, null)).toBe(false);
  });

  it('lights for a sale after Activity was last opened, not before', () => {
    expect(hasNewActivity([], ME, '2026-10-15T12:00:00Z', '2026-10-15T11:00:00Z')).toBe(true);
    expect(hasNewActivity([], ME, '2026-10-15T10:00:00Z', '2026-10-15T11:00:00Z')).toBe(false);
  });

  it('stays off with no data', () => {
    expect(hasNewActivity(undefined, ME, null, null)).toBe(false);
  });
});
