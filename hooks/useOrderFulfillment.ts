import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { paymentService } from '@/lib/paymentService';
import { useToast } from '@/lib/toast';
import { captureError } from '@/lib/sentry';
import type { Order, FulfillmentStatus } from '@/types';

export interface UseOrderFulfillmentReturn {
  order: Order | null;
  loading: boolean;
  mutating: boolean;
  error: string | null;
  advanceStatus: (
    targetStatus: FulfillmentStatus,
    meta?: {
      courier?: string;
      trackingNumber?: string;
      supplierOrderId?: string;
      supplierName?: string;
      sellerPickupAddress?: any;
    },
  ) => Promise<boolean>;
  openDispute: (reason: string, evidenceUrls?: string[]) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Hook providing real-time order fulfillment synchronization, strict transition execution,
 * and optimistic UI updates for buyer tracking and seller fulfillment dashboards.
 */
export function useOrderFulfillment(
  orderId: string | null | undefined,
  initialOrder?: Order | null,
): UseOrderFulfillmentReturn {
  const [order, setOrder] = useState<Order | null>(initialOrder ?? null);
  const [loading, setLoading] = useState<boolean>(!initialOrder && !!orderId);
  const [mutating, setMutating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const prevOrderRef = useRef<Order | null>(null);

  // Synchronize when initialOrder updates
  useEffect(() => {
    if (initialOrder) {
      setOrder(initialOrder);
    }
  }, [initialOrder]);

  // Initial Fetch & Real-time Subscription
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      setOrder(data ? (data as Order) : null);
    } catch (err: any) {
      console.warn('[useOrderFulfillment] fetch error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    fetchOrder();

    // Setup Supabase Realtime subscription for instant multi-device sync
    const channelName = `order_realtime_${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setOrder(null);
          } else if (payload.new) {
            setOrder((current) => ({
              ...(current ?? {}),
              ...(payload.new as Order),
            }));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, fetchOrder]);

  /**
   * Optimistically advances fulfillment status and commits mutation via atomic Postgres RPC.
   */
  const advanceStatus = useCallback(
    async (
      targetStatus: FulfillmentStatus,
      meta?: {
        courier?: string;
        trackingNumber?: string;
        supplierOrderId?: string;
        supplierName?: string;
        sellerPickupAddress?: any;
      },
    ): Promise<boolean> => {
      if (!orderId || !order) return false;

      // 1. Snapshot previous state for rollback
      prevOrderRef.current = { ...order };
      setMutating(true);
      setError(null);

      // 2. Optimistic UI update
      setOrder((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fulfillment_status: targetStatus,
          status: targetStatus === 'completed' ? 'completed' : prev.status,
          courier_name: meta?.courier ?? prev.courier_name,
          tracking_number: meta?.trackingNumber ?? prev.tracking_number,
          supplier_order_id: meta?.supplierOrderId ?? prev.supplier_order_id,
          supplier_name: meta?.supplierName ?? prev.supplier_name,
          seller_pickup_address: meta?.sellerPickupAddress ?? prev.seller_pickup_address,
          packed_at: targetStatus === 'packing' ? new Date().toISOString() : prev.packed_at,
          shifted_at: targetStatus === 'shifting' ? new Date().toISOString() : prev.shifted_at,
          shipped_at: targetStatus === 'shifting' ? new Date().toISOString() : prev.shipped_at,
          delivered_at: targetStatus === 'delivered' ? new Date().toISOString() : prev.delivered_at,
          completed_at: targetStatus === 'completed' ? new Date().toISOString() : prev.completed_at,
        };
      });

      // 3. Remote RPC call
      try {
        const updated = await paymentService.advanceOrderFulfillment({
          orderId,
          targetStatus,
          courier: meta?.courier,
          trackingNumber: meta?.trackingNumber,
          supplierOrderId: meta?.supplierOrderId,
          supplierName: meta?.supplierName,
          sellerPickupAddress: meta?.sellerPickupAddress,
        });

        setOrder(updated);
        toast.show(
          targetStatus === 'packing'
            ? 'Order status updated to Packing'
            : targetStatus === 'shifting'
            ? 'Order marked as Shifting / Dispatched'
            : targetStatus === 'completed'
            ? 'Order completed!'
            : 'Status updated',
          { variant: 'success', icon: 'check' },
        );
        return true;
      } catch (err: any) {
        // Rollback optimistic state
        if (prevOrderRef.current) {
          setOrder(prevOrderRef.current);
        }
        captureError(err, { fn: 'useOrderFulfillment.advanceStatus', orderId, targetStatus });
        setError(err.message || 'Failed to update order status');
        toast.show(err.message || "Couldn't update order status", {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      } finally {
        setMutating(false);
      }
    },
    [orderId, order, toast],
  );

  /**
   * Optimistically opens buyer protection dispute and calls atomic RPC.
   */
  const openDispute = useCallback(
    async (reason: string, evidenceUrls: string[] = []): Promise<boolean> => {
      if (!orderId || !order) return false;

      prevOrderRef.current = { ...order };
      setMutating(true);
      setError(null);

      // Optimistic update
      setOrder((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          fulfillment_status: 'disputed',
          status: 'disputed',
          dispute_reason: reason,
          dispute_evidence_urls: evidenceUrls,
          disputed_at: new Date().toISOString(),
        };
      });

      try {
        const updated = await paymentService.openOrderDispute({
          orderId,
          reason,
          evidenceUrls,
        });

        setOrder(updated);
        toast.show('Dispute opened. Funds placed on temporary hold.', {
          variant: 'info',
          icon: 'shield',
        });
        return true;
      } catch (err: any) {
        if (prevOrderRef.current) {
          setOrder(prevOrderRef.current);
        }
        captureError(err, { fn: 'useOrderFulfillment.openDispute', orderId });
        setError(err.message || 'Failed to open dispute');
        toast.show(err.message || "Couldn't open dispute", {
          variant: 'default',
          icon: 'alert-triangle',
        });
        return false;
      } finally {
        setMutating(false);
      }
    },
    [orderId, order, toast],
  );

  return {
    order,
    loading,
    mutating,
    error,
    advanceStatus,
    openDispute,
    refresh: fetchOrder,
  };
}
