import { describe, it, expect } from 'vitest';
import { routeForNotificationData } from './notificationRouting';

describe('routeForNotificationData', () => {
  it('routes a message to its conversation', () => {
    expect(routeForNotificationData({ type: 'message', conversationId: 'c1' })).toEqual({
      pathname: '/conversation/[id]',
      params: { id: 'c1' },
    });
  });

  it('routes an order to its invoice, not the public listing', () => {
    // A "Sold!" / payment-confirmation tap is about the transaction. It used to
    // open /product/[id], which is the marketing page for the item.
    expect(routeForNotificationData({ type: 'order', listingId: 'l1' })).toEqual({
      pathname: '/invoice/[id]',
      params: { id: 'l1' },
    });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'message'],
    ['a number', 7],
    ['an empty object', {}],
    ['an unknown type', { type: 'price_drop', listingId: 'l1' }],
    ['a message with no conversation id', { type: 'message' }],
    ['a message with a blank conversation id', { type: 'message', conversationId: '  ' }],
    ['a message with a non-string id', { type: 'message', conversationId: 42 }],
    ['an order with no listing id', { type: 'order' }],
  ])('returns null for %s', (_label, input) => {
    expect(routeForNotificationData(input)).toBeNull();
  });
});
