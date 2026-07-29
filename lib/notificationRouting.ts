// Where a tapped notification should land. Pure and dependency-free so the
// mapping is unit-testable — the alternative (inlining it in the response
// listener) can only be checked on a physical device with a real push.
//
// The payload comes from the network, so nothing here trusts its shape: an
// unknown type or a missing id returns null and the tap is a no-op rather than
// a navigation to a broken route.

export type NotificationRoute = {
  pathname: string;
  params: Record<string, string>;
};

function id(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

export function routeForNotificationData(data: unknown): NotificationRoute | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  switch (d.type) {
    case 'message': {
      const conversationId = id(d.conversationId);
      return conversationId
        ? { pathname: '/conversation/[id]', params: { id: conversationId } }
        : null;
    }
    case 'order': {
      const listingId = id(d.listingId);
      return listingId
        ? { pathname: '/product/[id]', params: { id: listingId } }
        : null;
    }
    default:
      return null;
  }
}
