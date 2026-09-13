import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  normalizeEmail,
  getProfileInviteUrl,
  getInviteMessage,
} from './contactNormalization';
import { getContactPepper } from './cryptoPepper';

describe('Contact Sync Normalization & Crypto', () => {
  it('normalizes local UK numbers to E.164 using country code GB', () => {
    // Valid UK mobile format
    const e164 = normalizePhoneNumber('07911 123456', 'GB');
    expect(e164).toBe('+447911123456');
  });

  it('normalizes local Pakistani numbers to E.164 using country code PK', () => {
    // Valid PK mobile format (0300 1234567)
    const e164 = normalizePhoneNumber('0300 1234567', 'PK');
    expect(e164).toBe('+923001234567');
  });

  it('normalizes international numbers already containing country codes', () => {
    const e164 = normalizePhoneNumber('+1 (415) 555-2671', 'US');
    expect(e164).toBe('+14155552671');
  });

  it('returns null or stripped fallback for completely invalid strings', () => {
    expect(normalizePhoneNumber('', 'US')).toBeNull();
    expect(normalizePhoneNumber('abcd', 'US')).toBeNull();
  });

  it('normalizes email addresses by trimming and lowercasing', () => {
    expect(normalizeEmail('  User.Name@Example.COM  ')).toBe('user.name@example.com');
    expect(normalizeEmail('test@ceranix.com')).toBe('test@ceranix.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });

  it('provides a deterministic application pepper', () => {
    const pepper = getContactPepper();
    expect(typeof pepper).toBe('string');
    expect(pepper.length).toBeGreaterThanOrEqual(16);
  });
});

describe('Social Invite Links & URLs', () => {
  it('generates clean profile invite URLs', () => {
    const url = getProfileInviteUrl('carrinex');
    expect(url).toContain('/user/@carrinex');
  });

  it('strips redundant leading @ in usernames', () => {
    const url = getProfileInviteUrl('@atelier');
    expect(url).toContain('/user/@atelier');
  });

  it('generates formatted invitation text', () => {
    const msg = getInviteMessage('vintage_vault', 'Vintage Vault');
    expect(msg).toContain('Vintage Vault');
    expect(msg).toContain('/user/@vintage_vault');
  });
});
