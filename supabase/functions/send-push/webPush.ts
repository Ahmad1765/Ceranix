// Pure web-push helpers for send-push. Free of Deno globals so vitest covers
// them (webPush.test.ts), same arrangement as mapper.ts.

import type { PushNotification } from './mapper.ts';

/**
 * Browsers' real push services. Mirrors public.is_allowed_web_push_endpoint:
 * send-push POSTs to the stored endpoint, so anything else would let a user
 * aim the edge function at an arbitrary host. Checked on both sides so a row
 * that predates the DB check (or a bypass of it) still can't be used.
 */
const ALLOWED_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

export function isAllowedWebPushEndpoint(endpoint: unknown): endpoint is string {
  return typeof endpoint === 'string' && endpoint.length <= 1000 && ALLOWED_ENDPOINT.test(endpoint);
}

/**
 * Where tapping the notification should open. Must agree with
 * lib/notificationRouting.ts (the native tap handler) — webPush.test.ts checks
 * that it does for every notification type.
 */
export function urlForData(data: Record<string, string>): string {
  if (data.type === 'message' && data.conversationId) {
    return `/conversation/${encodeURIComponent(data.conversationId)}`;
  }
  if (data.type === 'order' && data.listingId) {
    return `/invoice/${encodeURIComponent(data.listingId)}`;
  }
  return '/';
}

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  /** Collapses repeat notifications for the same chat/order into one. */
  tag: string;
  data: Record<string, string>;
};

export function buildWebPushPayload(n: PushNotification): WebPushPayload {
  return {
    title: n.title,
    body: n.body,
    url: urlForData(n.data),
    tag: n.data.conversationId ?? n.data.listingId ?? 'grabsty',
    data: n.data,
  };
}

/** 404/410 from a push service mean the subscription is gone for good. */
export function isExpiredSubscriptionStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}
