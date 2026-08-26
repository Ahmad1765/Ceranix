// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT & ORDER QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Tuning staleTime for Asynchronous Webhook Settlement
// When a buyer completes a checkout session, Stripe fires a webhook to update the
// database asynchronously. Setting a short `staleTime` (15s) on `useMyOrdersQuery`
// ensures that when the user returns to the Orders screen, React Query promptly
// re-fetches the latest order state without waiting for a long standard cache TTL.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { fetchMyOrders, type MyOrder } from '@/lib/payments';
import { qk } from './keys';

/**
 * Fetch the buyer and seller order transaction history for the current user.
 */
export function useMyOrdersQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.myOrders(userId),
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: (): Promise<MyOrder[]> => fetchMyOrders(userId as string),
  });
}
