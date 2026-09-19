/**
 * Contact Sync Cryptographic Pepper
 *
 * Phone numbers and email addresses have low mathematical entropy (~10 digits).
 * Standard SHA-256 hashes of raw phone numbers can be reversed using precomputed
 * rainbow tables.
 *
 * SECURITY NOTE:
 * Because this pepper is bundled into the client application binary or exposed via
 * `EXPO_PUBLIC_CONTACTS_PEPPER`, client-bundled peppers cannot prevent attackers from
 * building precomputed lookup tables. Server-side peppering or hashed lookup is the
 * stronger control.
 *
 * KEY ROTATION IMPACT:
 * Changing `EXPO_PUBLIC_CONTACTS_PEPPER` invalidates existing hashes registered via
 * `register_my_contact_hashes`. Any rotation requires client re-registration backfill
 * or adding a version marker to stored hashes in the database.
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
