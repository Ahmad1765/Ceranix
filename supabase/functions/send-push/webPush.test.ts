import { describe, it, expect } from 'vitest';
import {
  buildWebPushPayload,
  isAllowedWebPushEndpoint,
  isExpiredSubscriptionStatus,
  urlForData,
} from './webPush';
import { routeForNotificationData } from '../../../lib/notificationRouting';

describe('isAllowedWebPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:def',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://web.push.apple.com/QOabc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('allows %s', (url) => expect(isAllowedWebPushEndpoint(url)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://evil.example.com/fcm.googleapis.com/',
    'https://fcm.googleapis.com.evil.com/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://x.notify.windows.com.evil.com/',
    '',
    null,
    'https://fcm.googleapis.com/' + 'a'.repeat(1000),
  ])('rejects %s', (url) => expect(isAllowedWebPushEndpoint(url)).toBe(false));
});

describe('urlForData matches the native tap routing', () => {
  const cases: Record<string, string>[] = [
    { type: 'message', conversationId: 'c-123' },
    { type: 'order', listingId: 'l-456' },
  ];
  it.each(cases)('%o', (data) => {
    const route = routeForNotificationData(data)!;
    const expected = route.pathname.replace('[id]', route.params.id);
    expect(urlForData(data)).toBe(expected);
  });

  it('falls back to home for unknown data', () => {
    expect(urlForData({ type: 'mystery' })).toBe('/');
    expect(routeForNotificationData({ type: 'mystery' })).toBeNull();
  });
});

describe('buildWebPushPayload', () => {
  it('tags by conversation so a chat collapses into one notification', () => {
    const p = buildWebPushPayload({
      userId: 'u',
      title: 'ayesha',
      body: 'Is this still available?',
      data: { type: 'message', conversationId: 'c-1' },
      idempotencyKey: 'k',
    });
    expect(p).toMatchObject({ title: 'ayesha', url: '/conversation/c-1', tag: 'c-1' });
  });
});

describe('isExpiredSubscriptionStatus', () => {
  it('treats 404 and 410 as gone, everything else as transient', () => {
    expect(isExpiredSubscriptionStatus(404)).toBe(true);
    expect(isExpiredSubscriptionStatus(410)).toBe(true);
    expect(isExpiredSubscriptionStatus(429)).toBe(false);
    expect(isExpiredSubscriptionStatus(500)).toBe(false);
    expect(isExpiredSubscriptionStatus(undefined)).toBe(false);
  });
});
