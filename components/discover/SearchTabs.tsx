// Discover search hub: the segmented pill row plus the three non-item panels
// (Aesthetics / Brands / Users) it switches between. Speaks the app's own
// editorial language — Fraunces serif titles, uppercase Inter eyebrows, the
// promo card's tonal purple disc, hairline dividers, purple accents — strict
// purple/white/black throughout. Data is derived upstream in discover.tsx;
// only the Users panel owns state (its follow mask), because that state is
// meaningless to the rest of the screen.

import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Animated, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { getOptimizedImageUrl } from '@/lib/images';
import { fetchFollowingMask, toggleFollow } from '@/lib/follows';
import { useToast } from '@/lib/toast';
import { colors, radii, type } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import type { Aesthetic } from '@/lib/aesthetics';
import type { User } from '@/types';

const PAD = 16;
const SERIF_BOLD = type.family.serifBold; // Fraunces_700Bold
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const eyebrowStyle = {
  fontSize: 11,
  fontFamily: type.family.sansBold,
  color: colors.mute,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};

export type DiscoverTab = 'items' | 'aesthetics' | 'brands' | 'users';

const TABS: { id: DiscoverTab; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'aesthetics', label: 'Aesthetics' },
  { id: 'brands', label: 'Brands' },
  { id: 'users', label: 'Users' },
];

// Pills hidden from the row (2026-07-04): the Items chip is suppressed per
// product call. The item grid is still the default view — it just no longer has
// its own chip. To restore, remove 'items' from this set.
const HIDDEN_TABS = new Set<DiscoverTab>(['items']);
const VISIBLE_TABS = TABS.filter((t) => !HIDDEN_TABS.has(t.id));

// ── Segmented pills ─────────────────────────────────────────────────────────
// Same idiom as the home feed's AnimatedTabPill: white pill that fills with
// soft purple + purple border when active, spring scale on press.
export function DiscoverSegments({
  tab,
  onChange,
}: {
  tab: DiscoverTab;
  onChange: (tab: DiscoverTab) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: PAD, gap: 8 }}
      style={{ marginTop: 14, flexGrow: 0 }}
    >
      {VISIBLE_TABS.map(({ id, label }) => (
        <SegmentPill
          key={id}
          label={label}
          active={tab === id}
          onPress={() => onChange(id)}
        />
      ))}
    </ScrollView>
  );
}

function SegmentPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colorAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Color interpolation can't ride the native driver.
    const anim = Animated.timing(colorAnim, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [active, colorAnim]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.white, 'rgba(108,71,255,0.12)'],
  });
  const borderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E5E5E5', colors.purple],
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scaleAnim, { toValue: 0.93, useNativeDriver: USE_NATIVE_DRIVER, speed: 30, bounciness: 4 }).start()
      }
      onPressOut={() =>
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, speed: 20, bounciness: 6 }).start()
      }
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Search ${label.toLowerCase()}`}
    >
      <Animated.View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: radii.pill,
          borderWidth: 1,
          backgroundColor,
          borderColor,
          transform: [{ scale: scaleAnim }],
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontFamily: type.family.sansBold,
            color: active ? colors.ink : colors.mute,
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Hub section title ───────────────────────────────────────────────────────
// The serif heading the editorial rails use (Daily picks / Recently viewed),
// so the hub panels read as chapters of the same magazine.
export function HubTitle({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <View style={{ paddingHorizontal: PAD, marginTop: 20, marginBottom: 12 }}>
      {eyebrow ? <Text style={[eyebrowStyle, { marginBottom: 4 }]}>{eyebrow}</Text> : null}
      <Text style={{ fontFamily: SERIF_BOLD, fontSize: 20, color: colors.ink, letterSpacing: -0.3 }}>
        {title}
      </Text>
    </View>
  );
}

// ── Aesthetics ──────────────────────────────────────────────────────────────
export interface AestheticCardData {
  aesthetic: Aesthetic;
  /** Live listings matching the aesthetic's keywords. */
  count: number;
  /** Up to 3 preview thumbnails from those matches. */
  images: string[];
}

export function AestheticsPanel({
  cards,
  onOpen,
}: {
  cards: AestheticCardData[];
  onOpen: (aesthetic: Aesthetic) => void;
}) {
  return (
    <View style={{ paddingHorizontal: PAD, gap: 14 }}>
      {cards.map((card) => (
        <AestheticCard key={card.aesthetic.slug} card={card} onPress={() => onOpen(card.aesthetic)} />
      ))}
    </View>
  );
}

function AestheticCard({ card, onPress }: { card: AestheticCardData; onPress: () => void }) {
  const { aesthetic, count, images } = card;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Explore the ${aesthetic.name} aesthetic`}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      <View
        style={{
          borderRadius: radii['3xl'],
          backgroundColor: colors.ink,
          padding: 20,
          overflow: 'hidden',
        }}
      >
        {/* Tonal purple disc — the promo banner's depth cue, reused so the
            hub and the idle feed share one visual family. Not a gradient. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -70,
            top: -80,
            width: 190,
            height: 190,
            borderRadius: 95,
            backgroundColor: colors.purple,
            opacity: 0.3,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 10.5,
                fontFamily: type.family.sansBold,
                color: 'rgba(255,255,255,0.62)',
                letterSpacing: 1.3,
                textTransform: 'uppercase',
              }}
            >
              {count > 0 ? `${count} ${count === 1 ? 'item live' : 'items live'}` : 'Aesthetic'}
            </Text>
            <Text
              style={{
                fontFamily: SERIF_BOLD,
                fontSize: 25,
                color: colors.white,
                letterSpacing: -0.3,
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {aesthetic.name}
            </Text>
          </View>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 10,
            }}
          >
            <Feather name="arrow-up-right" size={15} color={colors.white} />
          </View>
        </View>

        <Text
          style={{
            fontSize: 14.5,
            lineHeight: 21,
            color: 'rgba(255,255,255,0.78)',
            marginTop: 10,
          }}
          numberOfLines={3}
        >
          {aesthetic.description}
        </Text>

        {/* Preview collage — always three tiles so cards keep one rhythm;
            unmatched slots stay as quiet placeholders (never an empty hole). */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => {
            const uri = images[i] ? getOptimizedImageUrl(images[i], { width: 240 }) : null;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  aspectRatio: 0.72,
                  borderRadius: radii.lg,
                  overflow: 'hidden',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}

// ── Brands ──────────────────────────────────────────────────────────────────
export interface BrandEntry {
  name: string;
  count: number;
  /** Cover image from the brand's newest listing, when known. */
  image?: string | null;
}

// Rows in the Shop-by-brand language: cover thumb, serif brand name, eyebrow
// stock line, and the purple outbound arrow the trending chips use.
export function BrandsPanel({
  brands,
  onSelect,
}: {
  brands: BrandEntry[];
  onSelect: (brand: string) => void;
}) {
  return (
    <View style={{ paddingHorizontal: PAD }}>
      {brands.map((b) => (
        <BrandRow key={b.name} brand={b} onPress={() => onSelect(b.name)} />
      ))}
    </View>
  );
}

function BrandRow({ brand, onPress }: { brand: BrandEntry; onPress: () => void }) {
  const img = brand.image ? getOptimizedImageUrl(brand.image, { width: 120 }) : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Shop ${brand.name}, ${brand.count} ${brand.count === 1 ? 'item' : 'items'}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: colors.hair,
        backgroundColor: pressed ? colors.panel : 'transparent',
        borderRadius: pressed ? radii.md : 0,
      })}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: radii.md,
          overflow: 'hidden',
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {img ? (
          <Image
            source={{ uri: img }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 18, color: colors.purple }}>
            {brand.name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontFamily: SERIF_BOLD, fontSize: 16, color: colors.ink }}
          numberOfLines={1}
        >
          {brand.name}
        </Text>
        <Text style={[eyebrowStyle, { letterSpacing: 1, marginTop: 2 }]} numberOfLines={1}>
          {brand.count} {brand.count === 1 ? 'item' : 'items'}
        </Text>
      </View>
      <Feather name="arrow-up-right" size={16} color={colors.purple} />
    </Pressable>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────
export type PersonRow = Pick<
  User,
  'id' | 'username' | 'full_name' | 'avatar_url' | 'followers_count' | 'is_verified'
>;

// People list with inline follow. Owns the viewer→targets follow mask: fetched
// once per result set, then mutated optimistically on toggle (the RPC result
// reconciles it, a failure reverts it).
export function UsersPanel({ users, viewerId }: { users: PersonRow[]; viewerId: string | null }) {
  const toast = useToast();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  const ids = users.map((u) => u.id).join(',');
  useEffect(() => {
    let on = true;
    if (!viewerId || users.length === 0) {
      setFollowing(new Set());
      return;
    }
    fetchFollowingMask(viewerId, users.map((u) => u.id)).then((mask) => {
      if (on) setFollowing(mask);
    });
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId, ids]);

  const toggle = async (id: string) => {
    if (!viewerId) {
      toast.show('Sign in to follow sellers', { variant: 'info', icon: 'log-in' });
      router.push('/auth/login');
      return;
    }
    if (pending.has(id)) return;
    const wasFollowing = following.has(id);
    // Optimistic flip; reconciled from the RPC below.
    setFollowing((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(id);
      else next.add(id);
      return next;
    });
    setPending((prev) => new Set(prev).add(id));
    try {
      const state = await toggleFollow(viewerId, id, wasFollowing);
      setFollowing((prev) => {
        const next = new Set(prev);
        if (state.isFollowing) next.add(id);
        else next.delete(id);
        return next;
      });
    } catch {
      setFollowing((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.add(id);
        else next.delete(id);
        return next;
      });
      toast.show("Couldn't update follow", { variant: 'default', icon: 'alert-triangle' });
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <View style={{ paddingHorizontal: 8 }}>
      {users.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          isSelf={u.id === viewerId}
          isFollowing={following.has(u.id)}
          onToggle={() => toggle(u.id)}
        />
      ))}
    </View>
  );
}

function UserRow({
  user,
  isSelf,
  isFollowing,
  onToggle,
}: {
  user: PersonRow;
  isSelf: boolean;
  isFollowing: boolean;
  onToggle: () => void;
}) {
  const avatar = user.avatar_url ? getOptimizedImageUrl(user.avatar_url, { width: 120 }) : null;
  const initial = (user.full_name || user.username || 'U').trim().charAt(0).toUpperCase();
  const followers = Number(user.followers_count ?? 0);
  return (
    <Pressable
      onPress={() => router.push(`/user/${user.id}` as any)}
      accessibilityRole="button"
      accessibilityLabel={`View @${user.username}'s profile`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.panel : 'transparent',
      })}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          overflow: 'hidden',
          backgroundColor: colors.purpleSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
          />
        ) : (
          <Text style={{ fontFamily: SERIF_BOLD, fontSize: 18, color: colors.purple }}>{initial}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            style={{ fontSize: 14.5, fontFamily: type.family.sansBold, color: colors.ink }}
            numberOfLines={1}
          >
            {user.full_name || user.username}
          </Text>
          {user.is_verified && <Feather name="check-circle" size={12} color={colors.purple} />}
        </View>
        <Text style={{ fontSize: 12.5, color: colors.mute, marginTop: 1 }} numberOfLines={1}>
          @{user.username}
          {followers > 0 ? ` · ${followers} ${followers === 1 ? 'follower' : 'followers'}` : ''}
        </Text>
      </View>
      {!isSelf ? (
        <Pressable
          hitSlop={HIT_SLOP_8}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={isFollowing ? `Unfollow @${user.username}` : `Follow @${user.username}`}
          style={({ pressed }) => ({
            paddingHorizontal: 18,
            paddingVertical: 8,
            borderRadius: radii.pill,
            backgroundColor: isFollowing ? colors.panel : colors.purple,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: type.family.sansBold,
              color: isFollowing ? colors.ink : colors.white,
            }}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}
