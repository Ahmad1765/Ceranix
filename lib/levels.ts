// Seller status & progression — Phase 1 of the gamification system.
//
// Everything here is a PURE function of data the app already stores
// (profiles.total_sales / rating / avatar / bio / location / is_verified and
// the seller's own listings). No new tables, no network. This keeps the
// "level up your shop" surface shippable and unit-testable today; the
// event-sourced mechanics (streaks, challenges, event badges, leaderboards)
// layer on top in later phases without changing these signatures.
//
// Palette/clutter rules live in the UI; this module is logic only.

import type { User } from '@/types';

export type LevelId = 1 | 2 | 3 | 4 | 5;

export interface LevelInfo {
  id: LevelId;
  name: string;
  /** Completed sales required to reach this level. */
  minSales: number;
  /** Rating gate (0 = no gate). Only enforced once the seller HAS a rating, so
   *  unrated newcomers are never blocked from early levels. */
  minRating: number;
}

// Thresholds are sales-driven with a light rating gate on the upper tiers so
// "Top Seller" actually means trustworthy, not just high-volume.
export const LEVELS: readonly LevelInfo[] = [
  { id: 1, name: 'Newcomer', minSales: 0, minRating: 0 },
  { id: 2, name: 'Riser', minSales: 1, minRating: 0 },
  { id: 3, name: 'Trusted Seller', minSales: 10, minRating: 4.0 },
  { id: 4, name: 'Top Seller', minSales: 50, minRating: 4.5 },
  { id: 5, name: 'Elite', minSales: 200, minRating: 4.7 },
] as const;

export interface SellerStats {
  totalSales: number;
  /** 0 when the seller has no rating yet. */
  rating: number;
  listingsCount: number;
  totalLikes: number;
  followers: number;
}

export interface LevelProgress {
  current: LevelInfo;
  next: LevelInfo | null;
  /** 0..1 across the gap between the current level floor and the next level. */
  progress: number;
  /** Human-readable requirement for the next level, or null at max level. */
  nextRequirement: string | null;
}

function qualifies(level: LevelInfo, stats: SellerStats): boolean {
  if (stats.totalSales < level.minSales) return false;
  // Rating gate applies only when a rating exists — never punish unrated sellers.
  if (level.minRating > 0 && stats.rating > 0 && stats.rating < level.minRating) {
    return false;
  }
  return true;
}

export function computeLevel(stats: SellerStats): LevelProgress {
  let current: LevelInfo = LEVELS[0];
  for (const lvl of LEVELS) {
    if (qualifies(lvl, stats)) current = lvl;
  }
  const next = LEVELS.find((l) => l.id === current.id + 1) ?? null;

  if (!next) {
    return { current, next: null, progress: 1, nextRequirement: null };
  }

  const span = Math.max(1, next.minSales - current.minSales);
  const progress = Math.max(0, Math.min(1, (stats.totalSales - current.minSales) / span));

  const parts: string[] = [];
  const salesNeeded = Math.max(0, next.minSales - stats.totalSales);
  if (salesNeeded > 0) {
    parts.push(`${salesNeeded} more ${salesNeeded === 1 ? 'sale' : 'sales'}`);
  }
  if (next.minRating > 0 && stats.rating > 0 && stats.rating < next.minRating) {
    parts.push(`a ${next.minRating.toFixed(1)}★ rating`);
  }
  const nextRequirement =
    parts.length > 0 ? `${parts.join(' + ')} to reach ${next.name}` : `Reach ${next.name}`;

  return { current, next, progress, nextRequirement };
}

// ── Profile completion (activation) ──────────────────────────────────────────

export interface CompletionStep {
  key: string;
  label: string;
  done: boolean;
}

export interface ProfileCompletion {
  steps: CompletionStep[];
  /** 0..100 */
  pct: number;
  /** Next incomplete step's label, or null when complete. */
  nextLabel: string | null;
  isComplete: boolean;
}

export function profileCompletion(user: User, listingsCount: number): ProfileCompletion {
  const steps: CompletionStep[] = [
    { key: 'avatar', label: 'Add a profile photo', done: !!user.avatar_url },
    { key: 'bio', label: 'Write a short bio', done: !!user.bio && user.bio.trim().length > 0 },
    {
      key: 'location',
      label: 'Set your location',
      done: !!user.location && user.location.trim().length > 0,
    },
    { key: 'first_listing', label: 'List your first item', done: listingsCount > 0 },
    { key: 'three_listings', label: 'List 3 items', done: listingsCount >= 3 },
    { key: 'verify', label: 'Verify your account', done: !!user.is_verified },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, pct, nextLabel: next?.label ?? null, isComplete: next === null };
}

// ── Computed achievement badges ──────────────────────────────────────────────
// Only badges fully derivable from current data live here. Event-sourced badges
// (Quick Shipper, Streak Master, Challenge Champ) arrive in Phase 4 via
// user_badges and are merged into the same display strip.

export interface Badge {
  key: string;
  label: string;
  /** Feather glyph name — typed loosely so this module stays icon-lib agnostic. */
  icon: string;
  earned: boolean;
}

export function computeBadges(stats: SellerStats, user: User, isComplete: boolean): Badge[] {
  return [
    { key: 'first_sale', label: 'First sale', icon: 'tag', earned: stats.totalSales >= 1 },
    { key: 'ten_sales', label: '10 sales', icon: 'award', earned: stats.totalSales >= 10 },
    { key: 'fifty_sales', label: '50 sales', icon: 'trending-up', earned: stats.totalSales >= 50 },
    { key: 'curator', label: 'Curator', icon: 'grid', earned: stats.listingsCount >= 10 },
    { key: 'tastemaker', label: 'Tastemaker', icon: 'heart', earned: stats.totalLikes >= 100 },
    { key: 'popular', label: 'Popular', icon: 'users', earned: stats.followers >= 50 },
    { key: 'verified', label: 'Verified', icon: 'check-circle', earned: !!user.is_verified },
    { key: 'complete', label: 'Shop complete', icon: 'check-square', earned: isComplete },
  ];
}

/** Count of earned badges — handy for the "X earned" affordance. */
export function earnedBadgeCount(badges: Badge[]): number {
  return badges.filter((b) => b.earned).length;
}
