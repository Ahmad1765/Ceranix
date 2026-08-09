import { describe, it, expect } from 'vitest';
import {
  LEVELS,
  computeLevel,
  profileCompletion,
  computeBadges,
  earnedBadgeCount,
  type SellerStats,
} from '@/lib/levels';
import type { User } from '@/types';

// Minimal SellerStats builder — override only what each test cares about.
function stats(overrides: Partial<SellerStats> = {}): SellerStats {
  return {
    totalSales: 0,
    rating: 0,
    listingsCount: 0,
    totalLikes: 0,
    followers: 0,
    ...overrides,
  };
}

// Minimal User builder. Cast through unknown since tests only touch the few
// fields the completion/badge logic reads.
function user(overrides: Partial<User> = {}): User {
  return { id: 'u1', username: 'tester', ...overrides } as unknown as User;
}

describe('computeLevel', () => {
  it('a brand-new seller is a Newcomer at 0% with the next requirement', () => {
    const r = computeLevel(stats());
    expect(r.current.name).toBe('Newcomer');
    expect(r.next?.name).toBe('Riser');
    expect(r.progress).toBe(0);
    expect(r.nextRequirement).toContain('1 more sale');
  });

  it('one sale promotes to Riser', () => {
    const r = computeLevel(stats({ totalSales: 1 }));
    expect(r.current.name).toBe('Riser');
  });

  it('does NOT block an unrated seller from the rating-gated Trusted level', () => {
    // 10 sales, no rating yet (0) — the gate only applies once a rating exists.
    const r = computeLevel(stats({ totalSales: 10, rating: 0 }));
    expect(r.current.name).toBe('Trusted Seller');
  });

  it('blocks a low-rated seller below the rating gate', () => {
    // 10 sales but a 3.5 rating < 4.0 gate → stays at Riser.
    const r = computeLevel(stats({ totalSales: 10, rating: 3.5 }));
    expect(r.current.name).toBe('Riser');
    expect(r.nextRequirement).toContain('4.0★');
  });

  it('promotes a well-rated seller through the gate', () => {
    const r = computeLevel(stats({ totalSales: 10, rating: 4.2 }));
    expect(r.current.name).toBe('Trusted Seller');
  });

  it('caps at Elite (max level) with progress 1 and no next requirement', () => {
    const r = computeLevel(stats({ totalSales: 500, rating: 5 }));
    expect(r.current.name).toBe('Elite');
    expect(r.next).toBeNull();
    expect(r.progress).toBe(1);
    expect(r.nextRequirement).toBeNull();
  });

  it('reports fractional progress between two levels', () => {
    // Riser floor = 1 sale, Trusted floor = 10 → 5 sales ≈ (5-1)/(10-1).
    const r = computeLevel(stats({ totalSales: 5, rating: 0 }));
    expect(r.current.name).toBe('Riser');
    expect(r.progress).toBeCloseTo((5 - 1) / (10 - 1), 5);
  });

  it('keeps progress within [0, 1]', () => {
    for (const totalSales of [0, 1, 3, 9, 11, 49, 51, 199, 201, 9999]) {
      const r = computeLevel(stats({ totalSales, rating: 5 }));
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
    }
  });
});

describe('profileCompletion', () => {
  it('an empty profile is 0% with the first step surfaced', () => {
    const c = profileCompletion(user(), 0);
    expect(c.pct).toBe(0);
    expect(c.isComplete).toBe(false);
    expect(c.nextLabel).toBe('Add a profile photo');
  });

  it('a fully set-up profile is 100% and complete', () => {
    const c = profileCompletion(
      user({
        avatar_url: 'a.png',
        bio: 'hi there',
        location: 'NYC',
        is_verified: true,
      }),
      3,
    );
    expect(c.pct).toBe(100);
    expect(c.isComplete).toBe(true);
    expect(c.nextLabel).toBeNull();
  });

  it('treats whitespace-only bio/location as not done', () => {
    const c = profileCompletion(user({ bio: '   ', location: '  ' }), 0);
    const bio = c.steps.find((s) => s.key === 'bio');
    const loc = c.steps.find((s) => s.key === 'location');
    expect(bio?.done).toBe(false);
    expect(loc?.done).toBe(false);
  });

  it('counts first + three listings independently', () => {
    const one = profileCompletion(user(), 1);
    expect(one.steps.find((s) => s.key === 'first_listing')?.done).toBe(true);
    expect(one.steps.find((s) => s.key === 'three_listings')?.done).toBe(false);

    const three = profileCompletion(user(), 3);
    expect(three.steps.find((s) => s.key === 'three_listings')?.done).toBe(true);
  });
});

describe('computeBadges', () => {
  it('earns sales + engagement badges at their thresholds', () => {
    const badges = computeBadges(
      stats({ totalSales: 50, listingsCount: 10, totalLikes: 100, followers: 50 }),
      user({ is_verified: true }),
      true,
    );
    const earned = new Set(badges.filter((b) => b.earned).map((b) => b.key));
    expect(earned).toContain('first_sale');
    expect(earned).toContain('ten_sales');
    expect(earned).toContain('fifty_sales');
    expect(earned).toContain('curator');
    expect(earned).toContain('tastemaker');
    expect(earned).toContain('popular');
    expect(earned).toContain('verified');
    expect(earned).toContain('complete');
  });

  it('earns nothing for a blank account', () => {
    const badges = computeBadges(stats(), user(), false);
    expect(earnedBadgeCount(badges)).toBe(0);
  });

  it('earnedBadgeCount matches the number of earned badges', () => {
    const badges = computeBadges(stats({ totalSales: 1 }), user(), false);
    expect(earnedBadgeCount(badges)).toBe(badges.filter((b) => b.earned).length);
  });
});

describe('LEVELS table', () => {
  it('is ordered by ascending sales thresholds', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].minSales).toBeGreaterThan(LEVELS[i - 1].minSales);
    }
  });
});
