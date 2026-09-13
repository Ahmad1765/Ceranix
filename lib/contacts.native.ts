/**
 * Native (iOS & Android) Contact Sync Engine
 *
 * Bulletproof Contact Sync Architecture:
 * 1. E.164 Normalization: Uses libphonenumber-js + expo-localization to format
 *    local phone numbers (e.g. 0300 1234567) into international standard (+923001234567).
 * 2. Cryptographic Pepper: Appends a static application pepper to defeat rainbow tables.
 * 3. JS Bridge Batching: Hashes contacts in slices of 100 with event-loop yields
 *    (setTimeout) to preserve 60fps UI animations.
 * 4. PostgREST Chunking: Dispatches hashes in chunks of 500 to stay within HTTP
 *    payload limits.
 * 5. Privacy: Raw numbers/emails NEVER leave the device.
 */

import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import * as Localization from 'expo-localization';
import { supabase } from '@/lib/supabase';
import { getContactPepper } from '@/lib/cryptoPepper';
import {
  normalizePhoneNumber,
  normalizeEmail,
  type CountryCode,
} from '@/lib/contactNormalization';
import type {
  MatchedFriend,
  UnmatchedContact,
  SyncProgress,
  ContactSyncResult,
  ContactsPermissionStatus,
} from './contacts';

export type { MatchedFriend, UnmatchedContact, SyncProgress, ContactSyncResult, ContactsPermissionStatus };

export const isContactsSyncSupported = true;

const BATCH_HASH_SIZE = 100;
const RPC_CHUNK_SIZE = 500;

/**
 * Resolves the device's native country code (e.g. 'US', 'PK', 'GB').
 */
export function getDeviceCountry(): CountryCode {
  try {
    const locales = Localization.getLocales();
    const region = locales[0]?.regionCode;
    if (region && region.length === 2) {
      return region.toUpperCase() as CountryCode;
    }
  } catch {
    // fallback
  }
  return 'US';
}

export { normalizePhoneNumber, normalizeEmail };

/**
 * Hashes a normalized contact value with the application Global Pepper.
 */
export async function hashContactValue(value: string): Promise<string> {
  const pepper = getContactPepper();
  const payload = `${value.trim()}:${pepper}`;
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
}

/**
 * Checks current native address book permissions without prompting.
 */
export async function getContactsPermissionStatus(): Promise<ContactsPermissionStatus> {
  try {
    const res = await Contacts.getPermissionsAsync();
    const isGranted = res.granted || res.status === 'granted';
    return {
      granted: isGranted,
      canAskAgain: res.canAskAgain,
      accessPrivileges: (res as any).accessPrivileges ?? (isGranted ? 'all' : 'none'),
      status: res.status as any,
    };
  } catch (err) {
    console.warn('[contacts.native] getContactsPermissionStatus error:', err);
    return { granted: false, canAskAgain: false, accessPrivileges: 'none', status: 'denied' };
  }
}

/**
 * Requests native address book permissions.
 */
export async function requestContactsPermission(): Promise<ContactsPermissionStatus> {
  try {
    const res = await Contacts.requestPermissionsAsync();
    const isGranted = res.granted || res.status === 'granted';
    return {
      granted: isGranted,
      canAskAgain: res.canAskAgain,
      accessPrivileges: (res as any).accessPrivileges ?? (isGranted ? 'all' : 'none'),
      status: res.status as any,
    };
  } catch (err) {
    console.warn('[contacts.native] requestContactsPermission error:', err);
    return { granted: false, canAskAgain: false, accessPrivileges: 'none', status: 'denied' };
  }
}

/**
 * Presents native iOS 18+ contact access picker modal for limited access mode.
 */
export async function presentAccessPicker(): Promise<string[] | null> {
  try {
    if (Platform.OS === 'ios' && typeof (Contacts as any).presentAccessPickerAsync === 'function') {
      return await (Contacts as any).presentAccessPickerAsync();
    }
  } catch (err) {
    console.warn('[contacts.native] presentAccessPicker error:', err);
  }
  return null;
}

/**
 * Full bulletproof contact sync process.
 */
export async function syncContacts(
  onProgress?: (progress: SyncProgress) => void,
): Promise<ContactSyncResult> {
  const report = (phase: SyncProgress['phase'], processed: number, total: number, message: string) => {
    onProgress?.({
      phase,
      processedCount: processed,
      totalCount: total,
      message,
    });
  };

  report('reading', 0, 0, 'Checking address book permission…');

  // Check current permissions first
  let perm = await getContactsPermissionStatus();
  if (!perm.granted) {
    if (perm.status === 'undetermined' || perm.canAskAgain) {
      perm = await requestContactsPermission();
    }
  }

  if (!perm.granted) {
    report('error', 0, 0, 'Address book permission not granted');
    const isPermanentlyDenied = !perm.canAskAgain;
    const err = new Error(
      isPermanentlyDenied
        ? 'Contacts access is disabled in iOS Settings. Please enable Contacts permission in Settings to find friends.'
        : 'Contacts permission was not granted.',
    );
    (err as any).code = isPermanentlyDenied ? 'PERMISSION_PERMANENTLY_DENIED' : 'PERMISSION_DENIED';
    throw err;
  }

  report('reading', 0, 0, 'Accessing address book…');

  // 1. Fetch contacts
  const { data: contacts } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name],
  });

  if (!contacts || contacts.length === 0) {
    report('completed', 0, 0, 'No contacts found');
    return { matchedFriends: [], unmatchedContacts: [] };
  }

  const defaultCountry = getDeviceCountry();
  const totalContacts = contacts.length;

  report('hashing', 0, totalContacts, `Normalizing & hashing contacts (0 / ${totalContacts})…`);

  // 2. Batch Hashing with JS Bridge Yielding
  const uniqueHashesSet = new Set<string>();
  const unmatchedList: UnmatchedContact[] = [];
  const hashToContactIds = new Map<string, Set<string>>();

  for (let i = 0; i < totalContacts; i += BATCH_HASH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_HASH_SIZE);

    await Promise.all(
      batch.map(async (c) => {
        const contactName = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Friend';
        const contactId = c.id || `${i}-${contactName}`;
        let firstPhone: string | undefined;
        let firstEmail: string | undefined;

        // Process phone numbers
        if (c.phoneNumbers && c.phoneNumbers.length > 0) {
          for (const p of c.phoneNumbers) {
            if (p.number) {
              const e164 = normalizePhoneNumber(p.number, defaultCountry);
              if (e164) {
                if (!firstPhone) firstPhone = e164;
                const h = await hashContactValue(e164);
                uniqueHashesSet.add(h);
                if (!hashToContactIds.has(h)) {
                  hashToContactIds.set(h, new Set());
                }
                hashToContactIds.get(h)!.add(contactId);
              }
            }
          }
        }

        // Process emails
        if (c.emails && c.emails.length > 0) {
          for (const em of c.emails) {
            if (em.email) {
              const normEmail = normalizeEmail(em.email);
              if (normEmail) {
                if (!firstEmail) firstEmail = normEmail;
                const h = await hashContactValue(normEmail);
                uniqueHashesSet.add(h);
                if (!hashToContactIds.has(h)) {
                  hashToContactIds.set(h, new Set());
                }
                hashToContactIds.get(h)!.add(contactId);
              }
            }
          }
        }

        if (firstPhone || firstEmail) {
          unmatchedList.push({
            id: contactId,
            name: contactName,
            phoneNumber: firstPhone,
            email: firstEmail,
          });
        }
      }),
    );

    const processed = Math.min(i + BATCH_HASH_SIZE, totalContacts);
    report('hashing', processed, totalContacts, `Normalizing & hashing contacts (${processed} / ${totalContacts})…`);

    // Yield to the React Native event loop to keep the UI at 60fps
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // 3. Chunked Supabase Queries
  const allHashes = Array.from(uniqueHashesSet);
  report('matching', 0, allHashes.length, 'Matching friends on Ceranix…');

  const matchedFriendsMap = new Map<string, MatchedFriend>();
  const matchedContactIds = new Set<string>();

  for (let i = 0; i < allHashes.length; i += RPC_CHUNK_SIZE) {
    const chunk = allHashes.slice(i, i + RPC_CHUNK_SIZE);
    try {
      const { data, error } = await supabase.rpc('match_contacts', { p_hashes: chunk });
      if (error) {
        console.warn('[contacts.native] match_contacts RPC error:', error.message);
      } else if (Array.isArray(data)) {
        for (const row of data) {
          if (row.id && !matchedFriendsMap.has(row.id)) {
            matchedFriendsMap.set(row.id, {
              id: row.id,
              username: row.username,
              full_name: row.full_name,
              avatar_url: row.avatar_url,
              is_verified: !!row.is_verified,
              followers_count: Number(row.followers_count || 0),
              matched_hash: row.matched_hash,
            });
          }

          if (row.matched_hash && hashToContactIds.has(row.matched_hash)) {
            const ids = hashToContactIds.get(row.matched_hash);
            if (ids) {
              for (const cid of ids) {
                matchedContactIds.add(cid);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[contacts.native] match_contacts exception:', e);
    }
    // Brief yield between chunks
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const matchedFriends = Array.from(matchedFriendsMap.values());
  // Remove matched contacts so they no longer appear in the invite list
  const filteredUnmatchedContacts = unmatchedList.filter(
    (contact) => !matchedContactIds.has(contact.id),
  );
  report('completed', totalContacts, totalContacts, `Found ${matchedFriends.length} friends on Ceranix`);

  return {
    matchedFriends,
    unmatchedContacts: filteredUnmatchedContacts,
    accessPrivileges: perm.accessPrivileges,
  };
}

/**
 * Registers the current user's phone and email hashes with the backend
 * so friends can reciprocal-match them.
 */
export async function registerMyHashes(
  rawPhone?: string | null,
  rawEmail?: string | null,
): Promise<void> {
  const defaultCountry = getDeviceCountry();
  const phoneHashes: string[] = [];
  const emailHashes: string[] = [];

  if (rawPhone) {
    const e164 = normalizePhoneNumber(rawPhone, defaultCountry);
    if (e164) {
      phoneHashes.push(await hashContactValue(e164));
    }
  }

  if (rawEmail) {
    const norm = normalizeEmail(rawEmail);
    if (norm) {
      emailHashes.push(await hashContactValue(norm));
    }
  }

  if (phoneHashes.length > 0 || emailHashes.length > 0) {
    try {
      await supabase.rpc('register_my_contact_hashes', {
        p_phone_hashes: phoneHashes.length > 0 ? phoneHashes : null,
        p_email_hashes: emailHashes.length > 0 ? emailHashes : null,
      });
    } catch (e) {
      console.warn('[contacts.native] registerMyHashes error:', e);
    }
  }
}
