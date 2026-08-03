import { computeLevel } from '@/lib/levels';
import type { User } from '@/types';
import type { Credential } from './CredentialList';

/** Who is reading the credentials — see the rule in `sellerCredentials`. */
export type CredentialViewer = 'owner' | 'visitor';

/**
 * Build the Details tab's seller-credential rows from data the profile screens
 * already hold. This is the marketplace's answer to a CV: everything here is
 * either stored on the profile row or derived from the seller's own listings,
 * so there is no field for a user to fill in and leave blank.
 *
 * Both profile screens call this so a seller's credentials read identically
 * whether they're looking at their own page or a buyer is.
 *
 * ── The one rule ──────────────────────────────────────────────────────────
 * A fact the viewer can ACT on is never also a read-only credential row.
 *
 * The own-profile Details tab already renders three of these as controls: a
 * seller-level card with a progress bar, and settings rows for bundle discount
 * and vacation mode. Repeating them here would state the same fact twice on one
 * screen, so they are visitor-only. A visitor can't change any of it, which is
 * exactly why the same three are worth stating to them.
 *
 * This is deliberately ONE parameter rather than a per-field opt-out: every
 * exclusion so far has had this same cause, and a flag per field invites the
 * next one to drift. When adding a credential, decide its audience here.
 */
export function sellerCredentials(
  profile: User,
  stats: { listingsCount: number; totalLikes: number },
  options: { viewer?: CredentialViewer } = {},
): Credential[] {
  const { viewer = 'visitor' } = options;
  // Owners reach these through a control elsewhere in the same tab.
  const showActionableFacts = viewer === 'visitor';
  const rating = Number(profile.rating ?? 0);
  const totalSales = Number(profile.total_sales ?? 0);
  const followers = profile.followers_count ?? 0;
  const level = computeLevel({
    totalSales,
    rating,
    listingsCount: stats.listingsCount,
    totalLikes: stats.totalLikes,
    followers,
  }).current;
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : null;

  const rows: Credential[] = [];

  // Level 1 is the starting tier — showing it would label a brand-new account
  // rather than credit it, so it stays hidden until the seller has earned a step.
  if (showActionableFacts && level.id >= 2) {
    rows.push({ key: 'level', icon: 'award', label: 'Seller level', value: level.name });
  }
  if (rating > 0) {
    rows.push({ key: 'rating', icon: 'star', label: 'Seller rating', value: `${rating.toFixed(1)} / 5` });
  }
  if (totalSales > 0) {
    rows.push({
      key: 'sales',
      icon: 'check-circle',
      label: 'Completed sales',
      value: String(totalSales),
    });
  }
  if (profile.is_verified) {
    rows.push({ key: 'verified', icon: 'shield', label: 'Identity verified' });
  }
  if (profile.location && profile.location.trim().length > 0) {
    rows.push({ key: 'location', icon: 'map-pin', label: 'Ships from', value: profile.location });
  }
  if (memberSince) {
    rows.push({ key: 'since', icon: 'clock', label: 'Member since', value: String(memberSince) });
  }
  if (showActionableFacts && (profile.bundle_discount_pct ?? 0) > 0) {
    rows.push({
      key: 'bundle',
      icon: 'percent',
      label: 'Bundle discount',
      value: `${profile.bundle_discount_pct}%`,
    });
  }
  // Last on purpose: it's a caveat, and a buyer should read the credentials
  // before the caveat that qualifies them.
  if (showActionableFacts && profile.vacation_mode) {
    rows.push({
      key: 'vacation',
      icon: 'pause-circle',
      label: 'On vacation — replies may be slower than usual',
    });
  }

  return rows;
}
