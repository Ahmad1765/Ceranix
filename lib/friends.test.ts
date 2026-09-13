import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockShare = vi.fn();
const mockOpenURL = vi.fn();
const mockCanOpenURL = vi.fn();
const mockSetStringAsync = vi.fn();

vi.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: any) => obj.web ?? obj.default,
  },
  Share: {
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
    share: (...args: any[]) => mockShare(...args),
  },
  Linking: {
    openURL: (...args: any[]) => mockOpenURL(...args),
    canOpenURL: (...args: any[]) => mockCanOpenURL(...args),
  },
}));

vi.mock('expo-clipboard', () => ({
  setStringAsync: (...args: any[]) => mockSetStringAsync(...args),
}));

describe('lib/friends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('isAppleDevice returns a boolean safely', async () => {
    const { isAppleDevice } = await import('./friends');
    expect(typeof isAppleDevice()).toBe('boolean');
  });

  it('shareInviteLink uses navigator.share on web when available', async () => {
    const { shareInviteLink } = await import('./friends');
    const mockNavShare = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      share: mockNavShare,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const res = await shareInviteLink('testuser', 'Test User');
    expect(res.success).toBe(true);
    expect(res.action).toBe('shared');
    expect(mockNavShare).toHaveBeenCalled();
  });

  it('shareInviteLink handles AbortError gracefully without copying', async () => {
    const { shareInviteLink } = await import('./friends');
    const abortError = new Error('User cancelled');
    abortError.name = 'AbortError';
    const mockNavShare = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('navigator', {
      share: mockNavShare,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const res = await shareInviteLink('testuser', 'Test User');
    expect(res.success).toBe(false);
    expect(res.action).toBe('dismissed');
    expect(mockSetStringAsync).not.toHaveBeenCalled();
  });

  it('shareViaSMS on web formats URL properly and sets location', async () => {
    const { shareViaSMS } = await import('./friends');
    const mockLocation = { href: '' };
    vi.stubGlobal('window', { location: mockLocation });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const res = await shareViaSMS('testuser', 'Test User', '+1234567890');
    expect(res).toBe(true);
    expect(mockLocation.href).toContain('sms:+1234567890&body=');
  });

  it('shareViaWhatsApp on mobile web navigates directly to wa.me', async () => {
    const { shareViaWhatsApp } = await import('./friends');
    const mockLocation = { href: '' };
    vi.stubGlobal('window', { location: mockLocation });
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const res = await shareViaWhatsApp('testuser', 'Test User');
    expect(res).toBe(true);
    expect(mockLocation.href).toContain('https://wa.me/?text=');
  });
});
