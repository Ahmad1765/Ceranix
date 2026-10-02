import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, router, Redirect } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getOptimizedImageUrl, cardImageUrl, IMAGE_TRANSITION } from '@/lib/images';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { type as typography, radii, tabularNumberStyle, shadow } from '@/lib/theme';
import { useListingQuery } from '@/lib/queries';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queries/keys';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8, CONTENT_MAX_WIDTH } from '@/lib/responsive';
import { supabase } from '@/lib/supabase';
import { buyerProtectionFee, formatPrice, getParcelDeliveryFee } from '@/lib/fees';
import { ShieldCheckIcon } from '@/components/ui/ShieldCheckIcon';
import {
  computeBundlePricing,
  sanitizeBundleItemIds,
  computeCheckoutItemPrice,
} from '@/lib/bundle';
import { AddressSheet, type AddressForm } from '@/components/settings/AddressSheet';
import { BuyerProtectionSheet } from '@/components/product/BuyerProtectionSheet';
import {
  PaymentOptionsModal,
  type PaymentMethodOption,
  type SelectedPaymentMethod,
} from '@/components/payment/PaymentOptionsModal';
import { paymentService, normalizeAddressInput } from '@/lib/paymentService';
import { ShippingAddressSchema } from '@/lib/schemas/order';
import { getOrCreateConversation, cancelBundleOffersForSoldItem } from '@/lib/chat';
import { SELECT_LISTING_WITH_SELLER } from '@/lib/listings';
import { BRAND } from '@/lib/brand';
import type { ShippingAddress, Listing } from '@/types';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN PATTERN PRIMITIVES (EXTRACTED FROM SETTINGS & SELL SCREENS)
// ─────────────────────────────────────────────────────────────────────────────

function SectionEyebrow({
  title,
  icon,
  badge,
  actionText,
  onAction,
}: {
  title: string;
  icon?: keyof typeof Feather.glyphMap;
  badge?: string;
  actionText?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 8,
        marginTop: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Feather name={icon} size={14} color={theme.mute} />}
        <Text
          style={{
            fontSize: 12,
            fontFamily: typography.family.sansSemibold,
            color: theme.mute,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
      </View>

      {actionText && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: typography.family.sansBold,
              color: theme.purple,
            }}
          >
            {actionText}
          </Text>
        </Pressable>
      ) : badge ? (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radii.pill,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontFamily: typography.family.sansBold,
              color: theme.mute,
              letterSpacing: 0.1,
            }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function GroupCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const { theme, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.panel,
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: isDark ? '#262626' : 'rgba(0,0,0,0.08)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.2 : 0.04,
          shadowRadius: 3,
          elevation: 1,
          marginBottom: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function KeyValueRow({
  label,
  value,
  isLast = false,
  rightElement,
  onPress,
}: {
  label: string;
  value?: string;
  isLast?: boolean;
  rightElement?: React.ReactNode;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const rowContent = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 13,
        minHeight: 50,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
      }}
    >
      <Text
        style={{
          fontSize: 14.5,
          fontFamily: typography.family.sansMedium,
          color: theme.ink,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>

      {rightElement ? (
        rightElement
      ) : value ? (
        <Text
          numberOfLines={2}
          style={[
            {
              fontSize: 14,
              fontFamily: typography.family.sansMedium,
              color: theme.mute,
              flexShrink: 1,
              textAlign: 'right',
              marginLeft: 16,
            },
            tabularNumberStyle,
          ]}
        >
          {value}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
        accessibilityRole="button"
      >
        {rowContent}
      </Pressable>
    );
  }

  return rowContent;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT & CHECKOUT SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function PaymentScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    id,
    offer,
    bundle_ids,
    fulfillment: fulfillmentParam,
    paymentMethod: paymentMethodParam,
  } = useLocalSearchParams<{
    id: string;
    offer?: string;
    bundle_ids?: string;
    fulfillment?: string;
    paymentMethod?: string;
  }>();
  const { user, profile, loading: authLoading } = useAuth();
  const toast = useToast();

  const isDemo = id === 'demo' || !id;

  const listingQ = useListingQuery(id && !isDemo ? String(id) : null);
  const fetchedListing = listingQ.data ?? null;

  // Mock demo listing for instant demo preview matching the mockup
  const demoListing: Listing = useMemo(
    () => ({
      id: 'demo',
      title: 'Samsung 75" Oled 4K Smart TV',
      brand: 'Samsung',
      price: 1250,
      size: '75 inch',
      condition: 'like_new',
      category: 'other',
      description: '75 inch OLED 4K UHD smart television',
      gender: 'unisex',
      seller_id: 'demo-seller',
      seller: {
        id: 'demo-seller',
        username: 'atelier_electronics',
        full_name: 'Atelier Electronics',
        avatar_url:
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        rating: 4.9,
        total_sales: 128,
        bio: null,
        location: null,
        created_at: new Date().toISOString(),
      },
      images: [
        'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&auto=format&fit=crop&q=80',
      ],
      thumbnails: [
        'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=240&auto=format&fit=crop&q=80',
      ],
      is_sold: false,
      views: 342,
      likes: 28,
      created_at: new Date().toISOString(),
    }),
    [],
  );

  const listing = fetchedListing || (isDemo ? demoListing : null);

  const bundleIdsParam = typeof bundle_ids === 'string' ? bundle_ids : '';
  const bundleItemIds = useMemo(
    () => sanitizeBundleItemIds(bundleIdsParam, id, listing?.id),
    [bundleIdsParam, id, listing?.id],
  );
  const isBundle = bundleItemIds.length > 0;

  const [bundledListings, setBundledListings] = useState<Listing[]>([]);
  const [bundleFetchStatus, setBundleFetchStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >(isBundle ? 'loading' : 'idle');
  const [bundleFetchError, setBundleFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (bundleItemIds.length === 0) {
      setBundledListings([]);
      setBundleFetchStatus('idle');
      setBundleFetchError(null);
      return;
    }
    if (!listing?.seller_id) return;

    let active = true;
    setBundleFetchStatus('loading');
    setBundleFetchError(null);

    (async () => {
      try {
        const queryIds = bundleItemIds.filter(
          (itemId) => itemId !== String(listing.id || id),
        );
        const { data, error } = await supabase
          .from('listings')
          .select(SELECT_LISTING_WITH_SELLER)
          .in('id', queryIds)
          .eq('seller_id', listing.seller_id)
          .eq('is_sold', false);

        if (!active) return;

        if (error) {
          console.warn('[payment] Error fetching bundle listings', error.message);
          setBundleFetchStatus('error');
          setBundleFetchError(error.message || 'Failed to load bundle listings.');
          toast.show('Failed to load bundle items. Please try again.', {
            variant: 'default',
            icon: 'alert-triangle',
          });
          return;
        }

        const rows = (data as unknown as Listing[]) ?? [];
        if (rows.length !== bundleItemIds.length) {
          setBundleFetchStatus('error');
          setBundleFetchError('One or more bundled items are no longer available.');
          toast.show('Some items in this bundle are no longer available.', {
            variant: 'default',
            icon: 'alert-triangle',
          });
          return;
        }

        setBundledListings(rows);
        setBundleFetchStatus('success');
      } catch (err: any) {
        if (!active) return;
        setBundleFetchStatus('error');
        setBundleFetchError(err?.message || 'Error loading bundle items.');
        toast.show('Error loading bundle items.', {
          variant: 'default',
          icon: 'alert-triangle',
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [bundleIdsParam, bundleItemIds, listing?.seller_id, listing?.id, id, toast]);

  const allOrderItems = useMemo(
    () => (listing ? [listing, ...bundledListings] : []),
    [listing, bundledListings],
  );

  // Fulfillment: tracked courier by default
  const fulfillment = fulfillmentParam === 'handshake' ? 'handshake' : 'managed';

  // Shipping address state
  const demoAddress: ShippingAddress = useMemo(
    () => ({
      id: 'mock_demo_addr',
      user_id: 'demo-user',
      recipient_name: 'John Doe',
      line1: '12, Palm Groove',
      line2: null,
      city: 'Lagos',
      state: 'Lagos State',
      postal_code: '100001',
      country: 'NG',
      phone: '+234 - 123 -201-419',
      is_default: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    [],
  );

  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(
    isDemo ? demoAddress : null,
  );
  const [addressLoading, setAddressLoading] = useState(!isDemo);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);

  // Delivery Notes state with Fragile preset
  const [deliveryNotes, setDeliveryNotes] = useState<string>('Fragile');

  // Payment method selection state
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodOption>('card');
  const [cardBrand, setCardBrand] = useState<string | null>('Visa');
  const [cardLast4, setCardLast4] = useState<string | null>('4242');
  const [walletNumber, setWalletNumber] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState<boolean>(true);
  const [hasChosenMethod, setHasChosenMethod] = useState<boolean>(true);
  const [paymentOptionsOpen, setPaymentOptionsOpen] = useState(false);

  // Buyer protection sheet
  const [bpSheetOpen, setBpSheetOpen] = useState(false);

  // Checkout submission state
  const [paying, setPaying] = useState(false);

  // Fetch user default address on mount
  useEffect(() => {
    if (isDemo || !user?.id) {
      setAddressLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('shipping_addresses')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;
        if (error) throw error;
        if (data) {
          setShippingAddress(data as ShippingAddress);
        }
      } catch (err) {
        console.warn('[payment] Error fetching address:', err);
      } finally {
        if (active) setAddressLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user?.id, isDemo]);

  const offerAmount = (() => {
    const n = Number(offer);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  })();

  const bundleCalculation = useMemo(() => {
    if (!listing) return null;
    const addOnPrices = bundledListings.map((b) => Number(b.price ?? 0));
    return computeBundlePricing(
      listing.price,
      addOnPrices,
      listing.seller?.bundle_discount_pct ?? 0,
    );
  }, [listing, bundledListings]);

  const bundleSavings = bundleCalculation?.savings ?? 0;
  const bundleSubtotal = bundleCalculation?.subtotal ?? Number(listing?.price ?? 0);
  const bundleDiscountPct = bundleCalculation?.pct ?? 0;

  if (authLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <ActivityIndicator color={theme.purple} />
      </SafeAreaView>
    );
  }

  if (!user && !isDemo) {
    return <Redirect href="/auth/login" />;
  }

  if (!listing && id && listingQ.isPending) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <ActivityIndicator color={theme.purple} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Feather name="alert-circle" size={32} color={theme.mute} />
        <Text
          style={{
            fontSize: 17,
            fontFamily: typography.family.sansBold,
            color: theme.ink,
            marginTop: 12,
          }}
        >
          Item unavailable
        </Text>
        <Pressable
          onPress={() => safeBack()}
          style={({ pressed }) => ({
            marginTop: 16,
            height: 44,
            borderRadius: radii.pill,
            paddingHorizontal: 20,
            backgroundColor: theme.ink,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{
              color: theme.background,
              fontFamily: typography.family.sansBold,
              fontSize: 14,
            }}
          >
            Go back
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Price breakdown calculations
  const itemPrice = computeCheckoutItemPrice({
    offerAmount,
    isBundle,
    bundleCalculationTotal: bundleCalculation?.total,
    listingPrice: Number(listing.price ?? 0),
  });

  const parcelSize = listing?.parcel_size || 'medium';
  const bpFee = buyerProtectionFee(itemPrice);
  const deliveryFee =
    fulfillment === 'handshake' ? 0 : getParcelDeliveryFee(parcelSize);
  const salesTax = 0;
  const totalAmount =
    Math.round((itemPrice + bpFee + deliveryFee + salesTax) * 100) / 100;

  const handleSaveAddress = async (form: AddressForm) => {
    let validated: any;
    try {
      const normalized = normalizeAddressInput(form);
      validated = ShippingAddressSchema.parse(normalized);
    } catch {
      toast.show('Please fill in required address fields', {
        variant: 'default',
        icon: 'alert-triangle',
      });
      return;
    }

    const effectiveUserId = user?.id || 'demo-user';
    const payload = {
      user_id: effectiveUserId,
      recipient_name: validated.recipientName.trim(),
      line1: validated.line1.trim(),
      line2: validated.line2?.trim() || null,
      city: validated.city.trim(),
      state: validated.state?.trim() || null,
      postal_code: validated.postalCode.trim(),
      country: validated.country.trim(),
      phone: validated.phone?.trim() || null,
      is_default: true,
    };

    const previousAddress = shippingAddress;
    const mockAddress: ShippingAddress = {
      id: `mock_addr_${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setShippingAddress(mockAddress);
    setAddressSheetOpen(false);

    if (isDemo || !user?.id) {
      toast.show('Shipping address updated', { variant: 'default', icon: 'check' });
      return;
    }

    try {
      const isRealUuid =
        Boolean(previousAddress?.id) &&
        !previousAddress!.id.startsWith('mock_') &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          previousAddress!.id,
        );

      const rpcPayload = isRealUuid
        ? { ...payload, id: previousAddress!.id }
        : payload;

      let savedAddress: ShippingAddress | null = null;

      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'upsert_shipping_address_with_default',
        { p_payload: rpcPayload },
      );

      if (!rpcError && rpcData) {
        savedAddress = rpcData as ShippingAddress;
      } else {
        await supabase
          .from('shipping_addresses')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('is_default', true);

        if (isRealUuid) {
          const { data: updateData, error: updateError } = await (supabase
            .from('shipping_addresses')
            .update(payload)
            .eq('id', previousAddress!.id)
            .eq('user_id', user.id)
            .select()
            .single() as any);

          if (updateError) throw updateError;
          savedAddress = updateData as ShippingAddress;
        } else {
          const { data: insertData, error: insertError } = await (supabase
            .from('shipping_addresses')
            .insert(payload)
            .select()
            .single() as any);

          if (insertError) throw insertError;
          savedAddress = insertData as ShippingAddress;
        }
      }

      if (savedAddress) {
        setShippingAddress(savedAddress);
      }
      toast.show('Shipping address saved', { variant: 'default', icon: 'check' });
    } catch (err: any) {
      setShippingAddress(previousAddress);
      toast.show(err?.message || 'Could not save address. Please try again.', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    }
  };

  const handleSelectPaymentMethod = (selected: SelectedPaymentMethod) => {
    setSelectedMethod(selected.method);
    if (selected.cardBrand) setCardBrand(selected.cardBrand);
    if (selected.cardLast4) setCardLast4(selected.cardLast4);
    if (selected.walletNumber) setWalletNumber(selected.walletNumber);
    if (selected.saveCard !== undefined) setSaveCard(selected.saveCard);
    if (selected.method !== 'card' || selected.cardLast4) {
      setHasChosenMethod(true);
    }
    setPaymentOptionsOpen(false);
  };

  const handlePay = async () => {
    if (paying) return;

    if (isBundle && bundleFetchStatus !== 'success') {
      toast.show(
        bundleFetchStatus === 'error'
          ? bundleFetchError ||
              'Unable to checkout: some bundle items could not be loaded.'
          : 'Please wait for bundle items to load.',
        {
          variant: 'default',
          icon: 'alert-circle',
        },
      );
      return;
    }

    if (fulfillment !== 'handshake') {
      if (!shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.phone) {
        toast.show('Please provide a complete delivery address with phone number', {
          variant: 'default',
          icon: 'map-pin',
        });
        setAddressSheetOpen(true);
        return;
      }

      const cleanPhone = (shippingAddress.phone || '').replace(/[\s\-\(\)]/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        toast.show('Please enter a valid contact phone number (10 to 15 digits)', {
          variant: 'default',
          icon: 'phone',
        });
        setAddressSheetOpen(true);
        return;
      }
    }

    const isMethodReady =
      hasChosenMethod && (selectedMethod !== 'card' || Boolean(cardLast4));
    if (!isMethodReady) {
      toast.show('Please choose a payment method', {
        variant: 'default',
        icon: 'credit-card',
      });
      setPaymentOptionsOpen(true);
      return;
    }

    tap('medium');
    setPaying(true);
    try {
      const effectiveBuyerId = user?.id || 'demo-user';
      const result = await paymentService.checkout({
        listingId: String(listing.id),
        bundleItemIds: isBundle ? bundleItemIds : undefined,
        paymentMethod: selectedMethod === 'cod' ? 'cod' : 'card',
        buyerId: effectiveBuyerId,
        sellerId: listing.seller_id,
        listingPrice: Number(listing.price),
        offerAmount: itemPrice,
        shippingAddress,
        shippingMethod: 'managed',
        deliveryNotes: deliveryNotes.trim() || undefined,
      });

      if (!result.success) {
        throw new Error(result.error || result.message || 'Checkout failed');
      }

      const allItemIds = Array.from(
        new Set([String(listing.id), ...bundleItemIds]),
      );
      allItemIds.forEach((itemId) => {
        queryClient.setQueryData<Listing>(qk.listing(itemId), (old) =>
          old ? { ...old, is_sold: true } : old,
        );
        queryClient.invalidateQueries({ queryKey: qk.listing(itemId) });
        cancelBundleOffersForSoldItem(itemId).catch(() => {});
      });
      queryClient.invalidateQueries({ queryKey: ['myOrders'] });
      queryClient.invalidateQueries({ queryKey: ['feedListings'] });
      queryClient.invalidateQueries({ queryKey: ['homeFeed'] });

      const isPaid = result.status === 'paid';
      const allTitles = allOrderItems.map((item) => item.title).filter(Boolean);
      const orderMessageContent =
        isBundle && allTitles.length > 1
          ? `Done!\nThank you, your order for a ${allTitles.length}-item bundle (${allTitles.join(', ')}) has been received.`
          : isPaid
            ? "Done!\nThank you, we have received your payment. It's being processed."
            : "Done!\nYour order has been placed. It's being processed.";

      try {
        const conv = await getOrCreateConversation({
          buyerId: effectiveBuyerId,
          sellerId: listing.seller_id,
          listingId: listing.id,
        });
        if (conv?.id) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            sender_id: effectiveBuyerId,
            content: orderMessageContent,
            kind: 'system',
            metadata: {
              paid: isPaid,
              payment_status: isPaid ? 'paid' : result.status,
              order_status: result.status,
              amount: totalAmount,
              is_bundle: isBundle,
              bundle_item_ids: isBundle ? bundleItemIds : undefined,
            },
          });
        }
      } catch {
        // chat confirmation fallback
      }

      const targetOrderId = result.orderId || listing.id;
      router.replace({
        pathname: `/invoice/${targetOrderId}`,
        params: {
          paid: isPaid ? '1' : '0',
          placed: '1',
          side: 'bought',
          title:
            isBundle && allTitles.length > 1
              ? `Bundle (${allTitles.length} items)`
              : listing.title,
          amount: String(totalAmount),
        },
      } as any);
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not complete payment', {
        variant: 'default',
        icon: 'alert-triangle',
      });
    } finally {
      setPaying(false);
    }
  };

  const imageUrl = listing
    ? getOptimizedImageUrl(cardImageUrl(listing, 0), { width: 240 })
    : null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.background }}
      edges={['top', 'bottom']}
    >
      {/* ── Top Header Navigation Bar (Quiet Atelier Standard) ── */}
      <View
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
          paddingTop: Platform.OS === 'ios' ? 10 : 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: CONTENT_MAX_WIDTH,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {/* Circular Back / Close Button */}
          <Pressable
            onPress={() => safeBack()}
            hitSlop={HIT_SLOP_8}
            accessibilityRole="button"
            accessibilityLabel="Close checkout"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Feather name="arrow-left" size={18} color={theme.ink} />
          </Pressable>

          {/* Centered Title */}
          <Text
            style={{
              fontSize: 16,
              fontFamily: typography.family.sansBold,
              color: theme.ink,
              letterSpacing: -0.2,
            }}
          >
            {isBundle ? 'Bundle Checkout' : 'Checkout'}
          </Text>

          {/* Canonical Mercari Shield Badge */}
          <View
            style={{
              width: 36,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheckIcon size={20} />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 40,
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          alignSelf: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Module 1: Item / Bundle Showcase ── */}
        <SectionEyebrow
          title={isBundle ? 'Bundle Summary' : 'Item Summary'}
          icon="shopping-bag"
          badge={isBundle ? `${1 + bundleItemIds.length} items` : undefined}
        />
        <GroupCard style={{ padding: 14 }}>
          {isBundle ? (
            bundleFetchStatus === 'loading' ? (
              <View
                style={{
                  paddingVertical: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator color={theme.purple} />
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.mute,
                    marginTop: 8,
                    fontFamily: typography.family.sans,
                  }}
                >
                  Loading bundle items...
                </Text>
              </View>
            ) : bundleFetchStatus === 'error' ? (
              <View
                style={{
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: isDark
                    ? 'rgba(239, 68, 68, 0.15)'
                    : '#FEE2E2',
                  borderWidth: 1,
                  borderColor: isDark ? '#EF4444' : '#FCA5A5',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: isDark ? '#FCA5A5' : '#991B1B',
                    fontFamily: typography.family.sansBold,
                  }}
                >
                  {bundleFetchError ||
                    'Could not load bundle items. Please go back and try again.'}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
              >
                {allOrderItems.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      width: 124,
                      padding: 8,
                      borderRadius: 12,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Image
                      source={{
                        uri: getOptimizedImageUrl(cardImageUrl(item, 0), {
                          width: 240,
                        }),
                      }}
                      style={{
                        width: '100%',
                        height: 90,
                        borderRadius: 8,
                        backgroundColor: theme.surface,
                      }}
                      contentFit="cover"
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                        marginTop: 6,
                      }}
                    >
                      {item.brand || item.title}
                    </Text>
                    <Text
                      style={[
                        {
                          fontSize: 11.5,
                          color: theme.mute,
                          marginTop: 2,
                          fontFamily: typography.family.sansMedium,
                        },
                        tabularNumberStyle,
                      ]}
                    >
                      {formatPrice(Number(item.price ?? 0))}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={IMAGE_TRANSITION}
                />
              ) : (
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="image" size={22} color={theme.mute} />
                </View>
              )}

              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 15,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                    letterSpacing: -0.2,
                    marginBottom: 3,
                  }}
                >
                  {listing.title}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  {listing.brand ? (
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                      }}
                    >
                      {listing.brand}
                    </Text>
                  ) : null}
                  {listing.brand && listing.size ? (
                    <Text style={{ fontSize: 13, color: theme.muteSoft }}>·</Text>
                  ) : null}
                  {listing.size ? (
                    <Text
                      style={{
                        fontSize: 13,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                      }}
                    >
                      {listing.size}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    {
                      fontSize: 15,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      marginTop: 4,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {formatPrice(itemPrice)}
                </Text>
              </View>
            </View>
          )}
        </GroupCard>

        {/* ── Module 2: Delivery Details (Mirroring Invoice Screen Architecture) ── */}
        <SectionEyebrow
          title="Delivery Details"
          icon="truck"
          actionText={shippingAddress?.line1 ? 'Edit' : 'Add'}
          onAction={() => setAddressSheetOpen(true)}
        />
        <GroupCard>
          <KeyValueRow
            label="Receiver"
            onPress={() => setAddressSheetOpen(true)}
            rightElement={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  style={{
                    fontSize: 14.5,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                  }}
                >
                  {shippingAddress?.recipient_name ||
                    profile?.full_name ||
                    'Add recipient'}
                </Text>
                <Feather name="chevron-right" size={14} color={theme.mute} />
              </View>
            }
          />
          <KeyValueRow
            label="Address"
            onPress={() => setAddressSheetOpen(true)}
            rightElement={
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 1,
                  justifyContent: 'flex-end',
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 14,
                    fontFamily: typography.family.sansMedium,
                    color: shippingAddress?.line1 ? theme.mute : theme.purple,
                    textAlign: 'right',
                    maxWidth: 220,
                  }}
                >
                  {shippingAddress?.line1
                    ? `${shippingAddress.line1}, ${shippingAddress.city}`
                    : 'Tap to add address'}
                </Text>
                <Feather name="chevron-right" size={14} color={theme.mute} />
              </View>
            }
          />
          <KeyValueRow
            label="Contact"
            onPress={() => setAddressSheetOpen(true)}
            rightElement={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  style={[
                    {
                      fontSize: 14,
                      fontFamily: typography.family.sansMedium,
                      color: shippingAddress?.phone ? theme.ink : '#EF4444',
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {shippingAddress?.phone || 'Required — tap to add'}
                </Text>
                <Feather name="chevron-right" size={14} color={theme.mute} />
              </View>
            }
          />
          <KeyValueRow
            label="Courier"
            rightElement={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: radii.pill,
                    backgroundColor: isDark
                      ? 'rgba(108, 71, 255, 0.16)'
                      : '#F2F3FE',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily: typography.family.sansBold,
                      color: isDark ? '#A5B4FC' : '#5356EE',
                    }}
                  >
                    Tracked (1–3d)
                  </Text>
                </View>
                <Text
                  style={[
                    {
                      fontSize: 14,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {formatPrice(deliveryFee)}
                </Text>
              </View>
            }
          />
          <KeyValueRow
            label="Note"
            isLast
            rightElement={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {['Fragile', 'Handle with care', 'Leave at door'].map((preset) => {
                  const isSelected = deliveryNotes === preset;
                  return (
                    <Pressable
                      key={preset}
                      onPress={() => {
                        tap('light');
                        setDeliveryNotes(isSelected ? '' : preset);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      style={({ pressed }) => ({
                        height: 30,
                        paddingHorizontal: 10,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(239, 68, 68, 0.16)'
                            : '#FEF2F2'
                          : isDark
                            ? 'rgba(255, 255, 255, 0.06)'
                            : '#F3F4F6',
                        borderWidth: 1,
                        borderColor: isSelected
                          ? isDark
                            ? 'rgba(239, 68, 68, 0.3)'
                            : '#FECACA'
                          : 'transparent',
                        opacity: pressed ? 0.8 : 1,
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontFamily: typography.family.sansBold,
                          color: isSelected ? theme.danger : theme.mute,
                        }}
                      >
                        {preset === 'Fragile' ? '⚠️ Fragile' : preset}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            }
          />
        </GroupCard>

        {/* ── Module 3: Payment Method & Security ── */}
        <SectionEyebrow
          title="Payment Method"
          icon="credit-card"
          actionText={hasChosenMethod ? 'Change' : 'Choose'}
          onAction={() => setPaymentOptionsOpen(true)}
        />
        <GroupCard>
          <Pressable
            onPress={() => setPaymentOptionsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Select payment method"
            style={({ pressed }) => [
              {
                paddingHorizontal: 16,
                paddingVertical: 14,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            {!hasChosenMethod || (selectedMethod === 'card' && !cardLast4) ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark
                        ? 'rgba(108, 71, 255, 0.15)'
                        : '#F2F3FE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="plus" size={18} color={theme.purple} />
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: 14.5,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                      }}
                    >
                      Choose payment method
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                        marginTop: 1,
                      }}
                    >
                      Card, JazzCash, Easypaisa, or Cash on Delivery
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            ) : selectedMethod === 'jazzcash' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: '#ED1B24',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '900',
                        color: '#FFFFFF',
                        letterSpacing: 0.3,
                      }}
                    >
                      JazzCash
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: 14.5,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                      }}
                    >
                      JazzCash Mobile Account
                    </Text>
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                        marginTop: 2,
                      }}
                    >
                      {walletNumber || 'Mobile Account Linked'}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            ) : selectedMethod === 'easypaisa' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: '#00A859',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '900',
                        color: '#FFFFFF',
                        letterSpacing: 0.3,
                      }}
                    >
                      easypaisa
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: 14.5,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                      }}
                    >
                      Easypaisa Mobile Account
                    </Text>
                    <Text
                      style={{
                        fontSize: 12.5,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                        marginTop: 2,
                      }}
                    >
                      {walletNumber || 'Mobile Account Linked'}
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            ) : selectedMethod === 'apple_pay' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                      backgroundColor: isDark ? '#000000' : '#111111',
                    }}
                  >
                    <Ionicons name="logo-apple" size={13} color="#FFFFFF" />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: '#FFFFFF',
                        marginLeft: 3,
                      }}
                    >
                      Pay
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                    }}
                  >
                    Apple Pay
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            ) : selectedMethod === 'cod' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: isDark
                        ? 'rgba(16, 185, 129, 0.15)'
                        : '#ECFDF5',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name="package" size={16} color="#10B981" />
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: 14.5,
                        fontFamily: typography.family.sansBold,
                        color: theme.ink,
                      }}
                    >
                      Cash on Delivery
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: theme.mute,
                        fontFamily: typography.family.sans,
                        marginTop: 1,
                      }}
                    >
                      Pay cash to courier when delivered
                    </Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 4,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#E0E0E0',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '900',
                        color: '#1A1F71',
                        fontStyle: 'italic',
                      }}
                    >
                      {(cardBrand ?? 'VISA').toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14.5,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                    }}
                  >
                    {cardBrand || 'Card'} ending with {cardLast4}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={theme.mute} />
              </View>
            )}
          </Pressable>

          {/* Save Card Checkbox Container */}
          {selectedMethod === 'card' && cardLast4 && (
            <View
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: theme.border,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Pressable
                onPress={() => {
                  tap('light');
                  setSaveCard(!saveCard);
                }}
                style={{ flexDirection: 'row', alignItems: 'flex-start' }}
              >
                <View
                  style={[
                    {
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 1,
                    },
                    saveCard && {
                      backgroundColor: theme.purple,
                      borderColor: theme.purple,
                    },
                  ]}
                >
                  {saveCard && (
                    <Feather name="check" size={12} color="#FFFFFF" />
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: typography.family.sansSemibold,
                      color: theme.ink,
                    }}
                  >
                    Save card details for future payments
                  </Text>
                  <Text
                    style={{
                      fontSize: 11.5,
                      color: theme.mute,
                      fontFamily: typography.family.sans,
                      marginTop: 2,
                      lineHeight: 15,
                    }}
                  >
                    You can remove the card anytime in Settings.
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </GroupCard>

        {/* ── Module 4: Order Summary (Mirroring Invoice Screen Architecture) ── */}
        <SectionEyebrow title="Order Summary" icon="list" />
        <GroupCard>
          <KeyValueRow
            label={
              isBundle
                ? `Subtotal (${allOrderItems.length} items)`
                : offerAmount
                  ? 'Offer price'
                  : 'Order price'
            }
            value={formatPrice(
              isBundle && !offerAmount ? bundleSubtotal : itemPrice,
            )}
          />

          {isBundle && !offerAmount && bundleSavings > 0 && (
            <KeyValueRow
              label={`Bundle discount (${bundleDiscountPct}%)`}
              rightElement={
                <Text
                  style={[
                    {
                      fontSize: 14,
                      color: theme.purple,
                      fontFamily: typography.family.sansBold,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  − {formatPrice(bundleSavings)}
                </Text>
              }
            />
          )}

          <KeyValueRow
            label="Buyer protection fee"
            onPress={() => setBpSheetOpen(true)}
            rightElement={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ShieldCheckIcon size={14} />
                <Text
                  style={[
                    {
                      fontSize: 14,
                      color: theme.ink,
                      fontFamily: typography.family.sansMedium,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {bpFee > 0 ? formatPrice(bpFee) : 'Free'}
                </Text>
                <Feather name="info" size={13} color={theme.muteSoft} />
              </View>
            }
          />

          <KeyValueRow
            label={`${BRAND} Delivery`}
            value={deliveryFee > 0 ? formatPrice(deliveryFee) : 'Free'}
          />

          <KeyValueRow
            label="Total to pay"
            isLast
            rightElement={
              <Text
                style={[
                  {
                    fontSize: 16.5,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                    letterSpacing: -0.3,
                  },
                  tabularNumberStyle,
                ]}
              >
                {formatPrice(totalAmount)}
              </Text>
            }
          />
        </GroupCard>

        {/* ── Module 5: Buyer Protection (Mirroring Invoice Screen Architecture) ── */}
        <SectionEyebrow title="Buyer Protection" icon="shield" />
        <GroupCard>
          <Pressable
            onPress={() => setBpSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="View Buyer Protection details"
            style={({ pressed }) => [
              {
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 8 }}>
              <ShieldCheckIcon size={24} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14.5,
                    fontFamily: typography.family.sansBold,
                    color: theme.ink,
                  }}
                >
                  {BRAND} Buyer Protection
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.mute,
                    fontFamily: typography.family.sans,
                    marginTop: 2,
                    lineHeight: 16,
                  }}
                >
                  48-hour inspection period · Full refund if item differs or doesn&apos;t arrive
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={16} color={theme.mute} />
          </Pressable>
        </GroupCard>
      </ScrollView>

      {/* ── Fixed Footer Dock: Sticky Checkout Bar (One Primary CTA) ── */}
      <View
        style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.border,
          backgroundColor: theme.panel,
          paddingTop: 12,
          paddingBottom: Math.max(Platform.OS === 'ios' ? 14 : 16, insets.bottom),
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 11.5,
                  color: theme.mute,
                  fontFamily: typography.family.sansMedium,
                }}
              >
                Total to pay
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 1,
                }}
              >
                <Text
                  style={[
                    {
                      fontSize: 19,
                      fontFamily: typography.family.sansBold,
                      color: theme.ink,
                      letterSpacing: -0.3,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {formatPrice(totalAmount)}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: radii.pill,
                    backgroundColor: isDark
                      ? 'rgba(108, 71, 255, 0.16)'
                      : '#F2F3FE',
                  }}
                >
                  <ShieldCheckIcon size={12} />
                  <Text
                    style={{
                      fontSize: 11,
                      color: isDark ? '#A5B4FC' : '#5356EE',
                      fontFamily: typography.family.sansBold,
                    }}
                  >
                    Protected
                  </Text>
                </View>
              </View>
            </View>

            {/* Primary Checkout Button: 10px Solid Ink matching ProductActionBar */}
            <Pressable
              onPress={handlePay}
              disabled={paying || (isBundle && bundleFetchStatus !== 'success')}
              accessibilityRole="button"
              accessibilityLabel={`Buy now for ${formatPrice(totalAmount)}`}
              style={({ pressed }) => {
                const isBlocked =
                  paying || (isBundle && bundleFetchStatus !== 'success');
                return [
                  {
                    height: 48,
                    minWidth: 160,
                    paddingHorizontal: 24,
                    backgroundColor:
                      isBlocked && !paying
                        ? isDark
                          ? '#374151'
                          : '#D1D5DB'
                        : theme.ink,
                    borderColor:
                      isBlocked && !paying
                        ? isDark
                          ? '#374151'
                          : '#D1D5DB'
                        : theme.ink,
                    borderWidth: 1,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  (pressed || paying) &&
                    !isBlocked && {
                      opacity: 0.88,
                      transform: [{ scale: 0.98 }],
                    },
                ];
              }}
            >
              {paying ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  style={[
                    {
                      fontSize: 15,
                      fontFamily: typography.family.sansBold,
                      color: '#FFFFFF',
                      letterSpacing: 0.2,
                    },
                    tabularNumberStyle,
                  ]}
                >
                  {isBundle && bundleFetchStatus === 'loading'
                    ? 'Loading bundle...'
                    : selectedMethod === 'cod'
                      ? 'Confirm Order'
                      : 'Buy now'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Address Edit Sheet */}
      <AddressSheet
        visible={addressSheetOpen}
        onClose={() => setAddressSheetOpen(false)}
        onSave={handleSaveAddress}
        initial={shippingAddress}
      />

      {/* Payment Options Selection Modal */}
      <PaymentOptionsModal
        visible={paymentOptionsOpen}
        onClose={() => setPaymentOptionsOpen(false)}
        selectedMethod={selectedMethod}
        onSelect={handleSelectPaymentMethod}
      />

      {/* Buyer Protection Breakdown Sheet */}
      <BuyerProtectionSheet
        visible={bpSheetOpen}
        itemPrice={itemPrice}
        onClose={() => setBpSheetOpen(false)}
      />
    </SafeAreaView>
  );
}
