import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/sentry';

// Reason taxonomy for reporting a listing. Kept short so the native action
// sheet stays scannable on both platforms.
export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'counterfeit', label: 'Counterfeit or fake' },
  { id: 'prohibited', label: 'Prohibited or unsafe item' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'spam', label: 'Spam or scam' },
];

export const SELLER_REPORT_REASONS: { id: string; label: string; description?: string }[] = [
  { id: 'scam', label: 'Suspicious activity or scam', description: 'Suspected fraudulent behavior or payment off-app' },
  { id: 'fake_items', label: 'Selling counterfeit or fake items', description: 'Listing replica or unauthentic designer items' },
  { id: 'harassment', label: 'Abusive behavior or harassment', description: 'Inappropriate messages or hostile communication' },
  { id: 'prohibited', label: 'Selling prohibited items', description: 'Items that violate marketplace community guidelines' },
  { id: 'other', label: 'Other issue', description: 'Other community guideline violations' },
];

export async function reportListing(opts: {
  listingId: string;
  reporterId: string;
  reason: string;
  reportedUserId?: string | null;
  details?: string | null;
}): Promise<boolean> {
  const { listingId, reporterId, reason, reportedUserId = null, details = null } = opts;
  try {
    const { error } = await supabase.from('reports').insert({
      listing_id: listingId,
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      details,
    });
    if (error) {
      console.warn('[reports] insert failed', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    captureError(e, { fn: 'reportListing' });
    return false;
  }
}

export async function reportUser(opts: {
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details?: string | null;
  listingId?: string | null;
}): Promise<boolean> {
  const { reporterId, reportedUserId, reason, details = null, listingId = null } = opts;
  try {
    const { error } = await supabase.from('reports').insert({
      listing_id: listingId,
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      reason,
      details,
    });
    if (error) {
      console.warn('[reports] user report failed', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    captureError(e, { fn: 'reportUser' });
    return false;
  }
}
