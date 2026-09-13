import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { BRAND, APP_URL } from '@/lib/brand';

export type { CountryCode };

/**
 * Normalizes phone numbers to standard E.164 format.
 */
export function normalizePhoneNumber(rawNumber: string, defaultCountry: CountryCode): string | null {
  if (!rawNumber) return null;
  const clean = rawNumber.trim();
  try {
    const parsed = parsePhoneNumberFromString(clean, defaultCountry);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
  } catch {
    // fallback parsing
  }

  // Fallback heuristic cleanup if parser didn't match
  const stripped = clean.replace(/[\s\-\(\)\.]/g, '');
  if (/^\+[1-9]\d{6,14}$/.test(stripped)) {
    return stripped;
  }
  return null;
}

/**
 * Normalizes an email address by trimming and lowercasing.
 */
export function normalizeEmail(rawEmail: string): string | null {
  if (!rawEmail) return null;
  const clean = rawEmail.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return clean;
  }
  return null;
}

/**
 * Builds a universal deep link to a user's closet or the app.
 */
export function getProfileInviteUrl(username?: string | null): string {
  if (username && username.trim().length > 0) {
    const clean = username.trim().replace(/^@+/, '');
    return `${APP_URL}/user/@${clean}`;
  }
  return APP_URL;
}

/**
 * Standard branded invitation message text.
 */
export function getInviteMessage(username?: string | null, fullName?: string | null): string {
  const name = fullName || (username ? `@${username.replace(/^@+/, '')}` : '');
  const url = getProfileInviteUrl(username);

  if (name) {
    return `Hey! Follow ${name}'s closet on ${BRAND} — the quiet resale marketplace for curated fashion: ${url}`;
  }
  return `Join me on ${BRAND} to buy and sell curated preloved fashion: ${url}`;
}
