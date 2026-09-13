/**
 * Contact Sync Cryptographic Pepper
 *
 * Phone numbers and email addresses have low mathematical entropy (~10 digits).
 * Standard SHA-256 hashes of raw phone numbers can be reversed using precomputed
 * rainbow tables.
 *
 * Appending a deterministic Global Pepper before hashing prevents precomputed
 * lookup table attacks while preserving deterministic reciprocal matching.
 */

const DEFAULT_PEPPER = 'crx_pepper_v1_carrinex_atelier_2026_q8';

export function getContactPepper(): string {
  // Uses environment variable if configured, otherwise falls back to the default pepper
  const envPepper = process.env.EXPO_PUBLIC_CONTACTS_PEPPER;
  if (typeof envPepper === 'string' && envPepper.trim().length > 0) {
    return envPepper.trim();
  }
  return DEFAULT_PEPPER;
}
