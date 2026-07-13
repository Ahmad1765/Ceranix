import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';
import { fetchListingById } from '@/lib/listings';
import { getCachedListing } from '@/lib/listingCache';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { safeBack } from '@/lib/nav';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { buyerProtectionFee, formatPrice } from '@/lib/fees';
import type { Listing } from '@/types';

function tap(style: 'light' | 'medium' = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(
    style === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Medium,
  );
}

function formatDate(iso: string | undefined | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// Turn a UUID into a clean 8-digit invoice number so the hero reads as a
// real reference rather than a hex hash.
function deriveInvoiceNumber(id: string): string {
  const hex = id.replace(/-/g, '').slice(0, 12);
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return '00000000';
  return String(Math.abs(n) % 100000000).padStart(8, '0');
}

// Supabase auto-generates handles like "user70c33" with random suffixes.
// Trim trailing hex noise so the invoice doesn't show raw machine output.
function stripHexSuffix(s: string): string {
  if (/^(user|profile)[0-9a-f]{4,}$/i.test(s)) {
    const cleaned = s.replace(/[0-9a-f]+$/i, '');
    if (cleaned.length >= 3) return cleaned;
  }
  const cleaned = s.replace(/[0-9a-f]{6,}$/i, '');
  return cleaned.length >= 3 ? cleaned : s;
}

function displayHandle(username: string | null | undefined): string {
  if (!username) return '—';
  return '@' + stripHexSuffix(username);
}

function displayName(
  fullName: string | null | undefined,
  username: string | null | undefined,
): string {
  const name = (fullName ?? '').trim();
  if (name) return name;
  if (!username) return 'User';
  return stripHexSuffix(username);
}

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const toast = useToast();
  const cached = getCachedListing(id ? String(id) : null);
  const [listing, setListing] = useState<Listing | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return;
    }
    const haveCached = !!getCachedListing(String(id));
    setLoading(!haveCached);
    (async () => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const res = await Promise.race([
          fetchListingById(String(id)),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Request timed out')), 25_000);
          }),
        ]);
        if (active && res) setListing(res);
        else if (active && !haveCached) setListing(null);
      } catch (e) {
        console.warn('[invoice] load failed', e);
        if (active && !haveCached) setListing(null);
      } finally {
        if (active) setLoading(false);
        if (timeoutId) clearTimeout(timeoutId);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          <Feather name="file-text" size={28} color={colors.mute} />
          <Text
            style={{
              fontSize: 17,
              fontWeight: '800',
              color: colors.ink,
              marginTop: 14,
              letterSpacing: -0.3,
            }}
          >
            Invoice not found
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.mute,
              marginTop: 6,
              textAlign: 'center',
              lineHeight: 19,
            }}
          >
            This invoice may have been removed or never existed.
          </Text>
          <Pressable
            onPress={() => safeBack()}
            style={({ pressed }) => ({
              marginTop: 22,
              height: 48,
              borderRadius: 14,
              paddingHorizontal: 24,
              backgroundColor: colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: 14 }}>
              Go back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const itemPrice = Number(listing.price ?? 0);
  const fee = buyerProtectionFee(itemPrice);
  const total = itemPrice + fee;
  const seller = listing.seller;
  const invoiceNumber = deriveInvoiceNumber(listing.id);
  const issueDate = listing.created_at;
  const dueDate = listing.created_at
    ? new Date(new Date(listing.created_at).getTime() + 14 * 86400_000).toISOString()
    : null;
  const sellerName = displayName(seller?.full_name, seller?.username);
  const sellerHandle = displayHandle(seller?.username);
  const buyerName = displayName(profile?.full_name, profile?.username);
  const buyerHandle = displayHandle(profile?.username);
  const status: 'paid' | 'pending' = listing.is_sold ? 'paid' : 'pending';
  const heroImage = listing.images?.[0];

  const onShare = async () => {
    tap('light');
    try {
      await Share.share({
        message: `Invoice ${invoiceNumber}\n${listing.title} · ${formatPrice(total)}`,
      });
    } catch {
      toast.show('Share failed', { variant: 'default', icon: 'alert-triangle' });
    }
  };

  const onPay = () => {
    tap('medium');
    router.push(`/payment/${listing.id}` as any);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }} edges={['top']}>
      {/* Top bar — minimal, no eyebrow (the panel announces itself) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 6,
          paddingBottom: 14,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Feather name="arrow-left" size={20} color={colors.ink} />
        </Pressable>
        <Pressable
          onPress={onShare}
          hitSlop={HIT_SLOP_8}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Feather name="share" size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Purple document panel */}
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: colors.primary,
            borderRadius: 32,
            paddingHorizontal: 26,
            paddingTop: 22,
            paddingBottom: 24,
            overflow: 'hidden',
          }}
        >
          {/* From / Billed-to — real parties (seller ↔ buyer), kept small */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View style={{ flex: 1, paddingRight: 16, minWidth: 0 }}>
              <Text style={InkEyebrow}>From</Text>
              <Text
                style={InkAddress}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {sellerName}
              </Text>
              <Text
                style={InkAddressMute}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {sellerHandle}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end', minWidth: 0 }}>
              <Text style={[InkEyebrow, { textAlign: 'right' }]}>Billed to</Text>
              <Text
                style={[InkAddress, { textAlign: 'right' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {buyerName}
              </Text>
              <Text
                style={[InkAddressMute, { textAlign: 'right' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {buyerHandle}
              </Text>
            </View>
          </View>

          {/* Hero — two confident lines, matches reference rhythm */}
          <View style={{ marginTop: 32, marginBottom: 28 }}>
            <Text
              style={{
                fontSize: 54,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -2.4,
                lineHeight: 56,
              }}
            >
              INVOICE
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 54,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -2.4,
                lineHeight: 56,
                marginTop: 2,
              }}
            >
              {invoiceNumber}
            </Text>
          </View>

          {/* Dates strip */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: 'rgba(15,15,15,0.18)',
              paddingTop: 12,
            }}
          >
            <View>
              <Text style={InkEyebrow}>Issued</Text>
              <Text style={InkValue}>{formatDate(issueDate)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[InkEyebrow, { textAlign: 'right' }]}>Due</Text>
              <Text style={[InkValue, { textAlign: 'right' }]}>{formatDate(dueDate)}</Text>
            </View>
          </View>
        </View>

        {/* White summary — uses whitespace rhythm, not dividers everywhere */}
        <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
          {/* Item hero row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 8,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: colors.primarySofter,
                overflow: 'hidden',
                marginRight: 14,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {heroImage ? (
                <Image
                  source={{ uri: heroImage }}
                  style={{ width: 56, height: 56 }}
                  contentFit="cover"
                />
              ) : (
                <Feather name="package" size={20} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: colors.ink,
                  letterSpacing: -0.3,
                }}
                numberOfLines={1}
              >
                {listing.title}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.mute,
                  marginTop: 3,
                  textTransform: 'capitalize',
                }}
              >
                {listing.category} · Qty 1
              </Text>
            </View>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '800',
                color: colors.ink,
                letterSpacing: -0.3,
              }}
            >
              {formatPrice(itemPrice)}
            </Text>
          </View>

          {/* Meta rows — no dividers, generous spacing carries the rhythm */}
          <View style={{ marginTop: 22 }}>
            <MetaRow label="Status">
              <StatusPill status={status} />
            </MetaRow>
            <Pressable
              onPress={() => {
                if (seller?.id) {
                  tap('light');
                  router.push(`/user/${seller.id}` as any);
                }
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
            >
              <MetaRow label="Seller">
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={MetaValue}>@{seller?.username ?? 'unknown'}</Text>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color="rgba(15,15,15,0.55)"
                    style={{ marginLeft: 4 }}
                  />
                </View>
              </MetaRow>
            </Pressable>
            <MetaRow label="Reference">
              <Text style={MetaValue}>#{invoiceNumber}</Text>
            </MetaRow>
            <MetaRow label="Item">
              <Text style={MetaValue}>{formatPrice(itemPrice)}</Text>
            </MetaRow>
            <MetaRow label="Buyer Protection">
              <Text style={MetaValue}>{formatPrice(fee)}</Text>
            </MetaRow>
          </View>

          {/* Total — full-width moment with hairline above */}
          <View
            style={{
              marginTop: 18,
              paddingTop: 22,
              borderTopWidth: 1,
              borderTopColor: colors.hairline,
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: colors.mute,
                paddingBottom: 6,
              }}
            >
              Total due
            </Text>
            <Text
              style={{
                fontSize: 44,
                fontWeight: '900',
                color: colors.ink,
                letterSpacing: -2,
                lineHeight: 46,
              }}
            >
              {formatPrice(total)}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom action — contextual primary, not a generic floating pill */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          pointerEvents: 'box-none',
        }}
      >
        {status === 'paid' ? (
          <Pressable
            onPress={() => {
              tap('light');
              toast.show('Download coming soon', { variant: 'info', icon: 'download' });
            }}
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 999,
              backgroundColor: colors.ink,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.14,
              shadowRadius: 16,
              elevation: 5,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <Feather name="download" size={16} color={colors.white} />
            <Text
              style={{
                marginLeft: 10,
                fontSize: 15,
                fontWeight: '800',
                color: colors.white,
                letterSpacing: 0.2,
              }}
            >
              Download invoice
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onPay}
            style={({ pressed }) => ({
              height: 64,
              borderRadius: 999,
              backgroundColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.16,
              shadowRadius: 18,
              elevation: 6,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.white,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="arrow-right" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '900',
                  color: colors.white,
                  letterSpacing: 0.2,
                  marginRight: 48,
                }}
              >
                Pay {formatPrice(total)}
              </Text>
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
      }}
    >
      <Text style={MetaLabel}>{label}</Text>
      {children}
    </View>
  );
}

function StatusPill({ status }: { status: 'paid' | 'pending' }) {
  const paid = status === 'paid';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 12,
        height: 28,
        borderRadius: 999,
        backgroundColor: paid ? colors.primarySofter : colors.panel,
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          backgroundColor: paid ? colors.primary : colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 6,
        }}
      >
        <Feather
          name={paid ? 'check' : 'clock'}
          size={10}
          color={colors.white}
        />
      </View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '800',
          color: colors.ink,
          letterSpacing: 0.2,
        }}
      >
        {paid ? 'Paid' : 'Pending'}
      </Text>
    </View>
  );
}

// — typography tokens local to this screen —

const InkEyebrow = {
  fontSize: 10,
  fontWeight: '700' as const,
  color: 'rgba(15,15,15,0.55)',
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
};

const InkAddress = {
  fontSize: 13,
  fontWeight: '700' as const,
  color: colors.ink,
  marginTop: 4,
};

const InkAddressMute = {
  fontSize: 12,
  color: 'rgba(15,15,15,0.62)',
  marginTop: 2,
};

const InkValue = {
  fontSize: 13,
  fontWeight: '700' as const,
  color: colors.ink,
  marginTop: 4,
};

const MetaLabel = {
  fontSize: 14,
  color: colors.mute,
  fontWeight: '500' as const,
};

const MetaValue = {
  fontSize: 14,
  fontWeight: '700' as const,
  color: colors.ink,
};
