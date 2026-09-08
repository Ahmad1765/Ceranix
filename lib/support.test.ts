import { describe, it, expect, vi } from 'vitest';
import {
  isSupportConversation,
  isDirectConversation,
  SUPPORT_BOT_USER_ID,
  SUPPORT_BOT_USERNAME,
} from '@/lib/support';
import type { ConversationRow } from '@/lib/chat';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

describe('support & direct conversation helpers', () => {
  const baseConversation: ConversationRow = {
    id: 'conv-1',
    listing_id: null,
    buyer_id: 'user-buyer-1',
    seller_id: 'user-seller-1',
    last_message: 'Hello',
    updated_at: '2026-09-08T00:00:00Z',
    buyer: {
      id: 'user-buyer-1',
      username: 'buyer_one',
      avatar_url: null,
      full_name: 'Buyer One',
      location: null,
      rating: 5,
      total_sales: 0,
    },
    seller: {
      id: 'user-seller-1',
      username: 'seller_one',
      avatar_url: null,
      full_name: 'Seller One',
      location: null,
      rating: 5,
      total_sales: 10,
    },
  };

  describe('isSupportConversation', () => {
    it('returns false for null or undefined', () => {
      expect(isSupportConversation(null)).toBe(false);
      expect(isSupportConversation(undefined)).toBe(false);
    });

    it('returns false for normal direct user conversation', () => {
      expect(isSupportConversation(baseConversation)).toBe(false);
    });

    it('returns true when seller_id is support bot', () => {
      const conv = { ...baseConversation, seller_id: SUPPORT_BOT_USER_ID };
      expect(isSupportConversation(conv)).toBe(true);
    });

    it('returns true when buyer_id is support bot', () => {
      const conv = { ...baseConversation, buyer_id: SUPPORT_BOT_USER_ID };
      expect(isSupportConversation(conv)).toBe(true);
    });

    it('returns true when seller username is support bot', () => {
      const conv = {
        ...baseConversation,
        seller: { ...baseConversation.seller!, username: SUPPORT_BOT_USERNAME },
      };
      expect(isSupportConversation(conv)).toBe(true);
    });

    it('returns true when buyer username is support bot', () => {
      const conv = {
        ...baseConversation,
        buyer: { ...baseConversation.buyer!, username: SUPPORT_BOT_USERNAME },
      };
      expect(isSupportConversation(conv)).toBe(true);
    });
  });

  describe('isDirectConversation', () => {
    it('returns false for null or undefined', () => {
      expect(isDirectConversation(null)).toBe(false);
      expect(isDirectConversation(undefined)).toBe(false);
    });

    it('returns true for direct user-to-user non-listing conversation', () => {
      expect(isDirectConversation(baseConversation)).toBe(true);
    });

    it('returns false for transactional conversations tied to a listing', () => {
      const conv = { ...baseConversation, listing_id: 'listing-123' };
      expect(isDirectConversation(conv)).toBe(false);
    });

    it('returns false for support bot conversations even if listing_id is null', () => {
      const conv = { ...baseConversation, seller_id: SUPPORT_BOT_USER_ID };
      expect(isDirectConversation(conv)).toBe(false);
    });

    it('returns false for support conversations tied to a listing', () => {
      const conv = {
        ...baseConversation,
        listing_id: 'listing-123',
        seller_id: SUPPORT_BOT_USER_ID,
      };
      expect(isDirectConversation(conv)).toBe(false);
    });
  });
});
