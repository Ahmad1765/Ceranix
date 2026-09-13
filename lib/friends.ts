import { Platform, Share, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { BRAND } from '@/lib/brand';
import { getProfileInviteUrl, getInviteMessage } from '@/lib/contactNormalization';

export { getProfileInviteUrl, getInviteMessage };

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
        await (navigator as any).share({
          title: BRAND,
          text: message,
          url,
        });
        return { success: true, action: 'shared' };
      }
      await Clipboard.setStringAsync(url);
      return { success: true, action: 'copied' };
    }

    const result = await Share.share(
      Platform.select({
        ios: { message, url },
        default: { message: `${message}\n${url}` },
      }) as any,
    );

    if (result.action === Share.sharedAction) {
      return { success: true, action: 'shared' };
    }
    return { success: false, action: 'dismissed' };
  } catch (error) {
    console.warn('[friends] shareInviteLink error:', error);
    try {
      await Clipboard.setStringAsync(url);
      return { success: true, action: 'copied' };
    } catch {
      return { success: false };
    }
  }
}

/**
 * Opens WhatsApp with pre-filled invitation text.
 */
export async function shareViaWhatsApp(username?: string | null, fullName?: string | null): Promise<boolean> {
  const text = encodeURIComponent(getInviteMessage(username, fullName));
  const url = `https://wa.me/?text=${text}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return true;
    }
    // Fallback to web link if scheme check is restrictive
    await Linking.openURL(url);
    return true;
  } catch (error) {
    console.warn('[friends] shareViaWhatsApp error:', error);
    return false;
  }
}

/**
 * Opens SMS composer with pre-filled invitation text.
 */
export async function shareViaSMS(
  username?: string | null,
  fullName?: string | null,
  phoneNumber?: string,
): Promise<boolean> {
  const body = encodeURIComponent(getInviteMessage(username, fullName));
  const target = phoneNumber ? encodeURIComponent(phoneNumber) : '';
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${target}${separator}body=${body}`;

  try {
    await Linking.openURL(url);
    return true;
  } catch (error) {
    console.warn('[friends] shareViaSMS error:', error);
    return false;
  }
}

/**
 * Copies the profile link to the clipboard.
 */
export async function copyInviteLink(username?: string | null): Promise<boolean> {
  const url = getProfileInviteUrl(username);
  try {
    await Clipboard.setStringAsync(url);
    return true;
  } catch (e) {
    console.warn('[friends] copyInviteLink error:', e);
    return false;
  }
}
