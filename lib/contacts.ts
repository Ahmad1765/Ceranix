/**
 * Web / Default Contact Sync Adapter
 *
 * Browsers do not permit automated address book reading due to sandbox security.
 * This adapter safely stubs the native sync functionality on Web and desktop,
 * preventing any native module crashes, and reports `isContactsSyncSupported = false`.
 */

export type MatchedFriend = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  followers_count: number;
};

export type UnmatchedContact = {
  id: string;
  name: string;
  phoneNumber?: string;
  email?: string;
};

export type SyncProgress = {
  phase: 'idle' | 'reading' | 'hashing' | 'matching' | 'completed' | 'error';
  processedCount: number;
  totalCount: number;
  message: string;
};

export type ContactSyncResult = {
  matchedFriends: MatchedFriend[];
  unmatchedContacts: UnmatchedContact[];
};

export const isContactsSyncSupported = false;

export async function requestContactsPermission(): Promise<boolean> {
  return false;
}

export async function syncContacts(
  _onProgress?: (progress: SyncProgress) => void,
): Promise<ContactSyncResult> {
  return {
    matchedFriends: [],
    unmatchedContacts: [],
  };
}

export async function registerMyHashes(
  _phone?: string | null,
  _email?: string | null,
): Promise<void> {
  // No-op on unsupported platforms
}
