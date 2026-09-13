import { Platform, Share, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BRAND } from '@/lib/brand';
import { getProfileInviteUrl, getInviteMessage } from '@/lib/contactNormalization';

export { getProfileInviteUrl, getInviteMessage };

/**
 * Helper to detect Apple mobile devices (iPhone, iPad, iPod) across native and web.
 */
export function isAppleDevice(): boolean {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
    );
  }
  return false;
}

/**
 * Triggers native OS share sheet (works on iOS, Android, and Web).
 */
export async function shareInviteLink(
  username?: string | null,
  fullName?: string | null,
): Promise<{ success: boolean; action?: string }> {
  const message = getInviteMessage(username, fullName);
  const url = getProfileInviteUrl(username);

  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          await (navigator as any).share({
            title: BRAND,
            text: message,
            url,
          });
          return { success: true, action: 'shared' };
        } catch (shareErr: any) {
          // If the user cancelled/dismissed iOS Safari's native share sheet, do not copy or toast
          if (shareErr?.name === 'AbortError') {
            return { success: false, action: 'dismissed' };
          }
        }
      }
      const copied = await copyInviteLink(username);
      return { success: copied, action: copied ? 'copied' : 'failed' };
    }

    const fullMessage = `${message}\n${url}`;
    const result = await Share.share(
      Platform.select({
        ios: { message: fullMessage },
        default: { message: fullMessage },
      }) as any,
    );

    if (result.action === Share.sharedAction) {
      return { success: true, action: 'shared' };
    }
    return { success: false, action: 'dismissed' };
  } catch (error) {
    console.warn('[friends] shareInviteLink error:', error);
    try {
      const copied = await copyInviteLink(username);
      return { success: copied, action: copied ? 'copied' : 'failed' };
    } catch {
      return { success: false };
    }
  }
}

/**
 * Opens WhatsApp with pre-filled invitation text, with robust iOS and Web fallbacks.
 */
export async function shareViaWhatsApp(username?: string | null, fullName?: string | null): Promise<boolean> {
  const message = getInviteMessage(username, fullName);
  const text = encodeURIComponent(message);
  const nativeUrl = `whatsapp://send?text=${text}`;
  const webUrl = `https://wa.me/?text=${text}`;

  // On Web (Desktop or Mobile Safari / Chrome):
  // react-native-web stubs canOpenURL to always true. Using whatsapp:// opens an empty about:blank tab.
  // We use wa.me which handles mobile app handoff and desktop web smoothly.
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') {
        const isMobile = typeof navigator !== 'undefined' && (
          /iPad|iPhone|iPod|Android/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
        );
        if (isMobile) {
          window.location.href = webUrl;
        } else {
          window.open(webUrl, '_blank', 'noopener,noreferrer');
        }
        return true;
      }
    } catch (e) {
      console.warn('[friends] Web WhatsApp open error:', e);
    }
  }

  // On Native iOS / Android:
  try {
    const canOpenNative = await Linking.canOpenURL(nativeUrl).catch(() => false);
    if (canOpenNative) {
      await Linking.openURL(nativeUrl);
      return true;
    }
    const canOpenWeb = await Linking.canOpenURL(webUrl).catch(() => false);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return true;
    }
    // Fallback: try opening web link directly
    await Linking.openURL(webUrl);
    return true;
  } catch (error) {
    console.warn('[friends] shareViaWhatsApp error, falling back to Share:', error);
    try {
      const res = await Share.share({ message: `${message}\n${getProfileInviteUrl(username)}` });
      return res.action === Share.sharedAction;
    } catch {
      return false;
    }
  }
}

/**
 * Opens SMS composer with pre-filled invitation text, with robust iOS and Safari fallbacks.
 */
export async function shareViaSMS(
  username?: string | null,
  fullName?: string | null,
  phoneNumber?: string,
): Promise<boolean> {
  const message = getInviteMessage(username, fullName);
  const body = encodeURIComponent(message);
  const cleanPhone = phoneNumber ? phoneNumber.replace(/[^\d+]/g, '') : '';
  const target = cleanPhone;
  const isApple = isAppleDevice();

  // On Web (Mobile Safari on iOS / Chrome):
  // In Safari, window.open is blocked for sms: schemes. Must assign window.location.href.
  if (Platform.OS === 'web') {
    try {
      // If no recipient is specified on web, navigator.share provides a much better experience
      // on iOS Safari than opening 'sms:' with an empty destination.
      if (!target && typeof navigator !== 'undefined' && (navigator as any).share) {
        try {
          await (navigator as any).share({
            title: BRAND,
            text: message,
            url: getProfileInviteUrl(username),
          });
          return true;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return false;
        }
      }

      const separator = isApple ? '&' : '?';
      const webSmsUrl = target ? `sms:${target}${separator}body=${body}` : `sms:${separator}body=${body}`;

      if (typeof window !== 'undefined') {
        window.location.href = webSmsUrl;
        return true;
      }
    } catch (e) {
      console.warn('[friends] Web SMS open error:', e);
    }
  }

  // On Native iOS / Android:
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = target ? `sms:${target}${separator}body=${body}` : `sms:${separator}body=${body}`;

  try {
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    // On iOS devices where sms scheme is not supported (e.g. iPad, iPod, or simulator),
    // seamlessly fall back to the system share sheet
    const res = await Share.share({ message: `${message}\n${getProfileInviteUrl(username)}` });
    return res.action === Share.sharedAction;
  } catch (error) {
    console.warn('[friends] shareViaSMS error, falling back to Share:', error);
    try {
      const res = await Share.share({ message: `${message}\n${getProfileInviteUrl(username)}` });
      return res.action === Share.sharedAction;
    } catch {
      return false;
    }
  }
}

/**
 * Copies the profile link to the clipboard with robust fallbacks for non-HTTPS dev environments.
 */
export async function copyInviteLink(username?: string | null): Promise<boolean> {
  const url = getProfileInviteUrl(username);
  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          return true;
        } catch {
          // Fall through to fallback
        }
      }
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) return true;
      } catch {
        document.body.removeChild(textArea);
      }
    }
    await Clipboard.setStringAsync(url);
    return true;
  } catch (e) {
    console.warn('[friends] copyInviteLink error:', e);
    return false;
  }
}

