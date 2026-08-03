import { describe, it, expect } from 'vitest';
import { sellerCredentials } from './credentials';
import type { User } from '@/types';

// The three rows the own-profile Details tab already renders as controls: a
// seller-level card with a progress bar, and settings rows for bundle discount
// and vacation mode. These are the rule this suite exists to protect — a
// duplicate here previously only surfaced as a Playwright strict-mode violation,
// and only because a test happened to assert that exact string.
const OWNER_ACTIONABLE = ['level', 'bundle', 'vacation'] as const;

function makeProfile(over: Partial<User> = {}): User {
  return {
    id: 'u1',
    username: 'seller',
    avatar_url: null,
    full_name: 'A Seller',
    bio: null,
    location: 'Lahore',
    rating: 4.6,
    total_sales: 12,
    created_at: '2024-03-02T00:00:00.000Z',
    is_verified: true,
    vacation_mode: true,
    bundle_discount_pct: 10,
    followers_count: 40,
    following_count: 3,
    ...over,
  };
}

const STATS = { listingsCount: 8, totalLikes: 30 };
const keysFor = (viewer: 'owner' | 'visitor', profile = makeProfile()) =>
  sellerCredentials(profile, STATS, { viewer }).map((r) => r.key);

describe('sellerCredentials', () => {
  it('states every fact to a visitor, who cannot act on any of it', () => {
    const keys = keysFor('visitor');
    for (const key of OWNER_ACTIONABLE) {
      expect(keys).toContain(key);
    }
    expect(keys).toEqual(
      expect.arrayContaining(['rating', 'sales', 'verified', 'location', 'since']),
    );
  });

  it('never repeats a fact the owner already has a control for', () => {
    const keys = keysFor('owner');
    for (const key of OWNER_ACTIONABLE) {
      expect(keys).not.toContain(key);
    }
  });

  it('still gives the owner the facts they have no control for', () => {
    expect(keysFor('owner')).toEqual(['rating', 'sales', 'verified', 'location', 'since']);
  });

  it('defaults to the visitor view', () => {
    expect(sellerCredentials(makeProfile(), STATS).map((r) => r.key)).toEqual(keysFor('visitor'));
  });

  it('hides the starting tier so a new account is credited, not labelled', () => {
    const newcomer = makeProfile({ total_sales: 0, rating: 0 });
    expect(keysFor('visitor', newcomer)).not.toContain('level');
  });

  it('omits rows with no data rather than rendering them empty', () => {
    const bare = makeProfile({
      rating: 0,
      total_sales: 0,
      is_verified: false,
      vacation_mode: false,
      bundle_discount_pct: 0,
      location: '   ',
    });
    expect(keysFor('visitor', bare)).toEqual(['since']);
  });
});
