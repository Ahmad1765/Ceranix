// Browser push (Push API + service worker). Web counterpart of the Expo token
// flow in lib/notifications.ts, which calls into this on Platform.OS === 'web'.
//
// Works in Chrome, Edge and Firefox (desktop and Android). iOS Safari only
// exposes PushManager to a site installed to the home screen, so in a normal
// Safari tab webPushSupported() is false and the UI hides the toggle.

/**
 * VAPID public key. Public by design: the browser needs it to subscribe, and
 * the push service uses it to check that send-push (holding the private key,
 * the VAPID_PRIVATE_KEY function secret) is who it claims to be.
 */
export const VAPID_PUBLIC_KEY =
  'BO0e_1SY2rF28Ia3AeD5a0BwcJ67i5Wz6FCrDFqEnsz4zYvdRd__av23NDwBJKbGCZfYNMB82BV5TVsyvfs7K30';

const SW_URL = '/sw.js';

export function webPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function webPermission(): NotificationPermission | null {
  return webPushSupported() ? Notification.permission : null;
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  return navigator.serviceWorker.ready;
}

/** The existing subscription, without creating one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** Subscribe (or reuse the current subscription). Permission must already be granted. */
export async function subscribe(): Promise<PushSubscription | null> {
  if (!webPushSupported() || Notification.permission !== 'granted') return null;
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
  });
}

/** The two keys send-push encrypts with, from a subscription. */
export function subscriptionKeys(sub: PushSubscription): { p256dh: string; auth: string } | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return p256dh && auth ? { p256dh, auth } : null;
}

/** A short label for the Settings device list, e.g. "Chrome on Windows". */
export function browserLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
