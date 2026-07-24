import { useEffect, useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, Platform, Dimensions } from 'react-native';
import { Text } from '@/lib/rnText';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

// JS-driven on web (no RCTAnimation), native-driven on iOS/Android.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

type Activity = {
  id: string;
  username: string;
  brand: string | null;
  title: string;
  created_at: string;
};

const CYCLE_MS = 5200;
const INK = '#0F0F0F';
const PURPLE = '#6C47FF';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Sized like the iPhone Dynamic Island: centered, capsule, sits just below the
// status bar with breathing room on both sides.
const ISLAND_MIN_W = 240;
const ISLAND_MAX_W = Math.min(360, SCREEN_WIDTH - 64);

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d || Number.isNaN(d)) return 'now';
  const seconds = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function LiveActivityTicker() {
  const [items, setItems] = useState<Activity[]>([]);
  const [index, setIndex] = useState(0);
  const slide = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(0)).current;
  // Dynamic Island-style entrance: tiny "blob" that expands into the pill
  const islandScale = useRef(new Animated.Value(0.2)).current;
  const islandOpacity = useRef(new Animated.Value(0)).current;
  // Press-to-expand spring (subtle squish-grow like iOS interactive widgets)
  const pressScale = useRef(new Animated.Value(1)).current;

  // Pulse the live dot continuously
  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(dotPulse, { toValue: 0, duration: 800, useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    pulseAnim.start();
    return () => {
      pulseAnim.stop();
    };
  }, [dotPulse]);

  // Fetch recent listings (one-shot; cheap and good enough).
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, brand, created_at, seller:profiles!listings_seller_id_fkey(username)')
        .eq('is_sold', false)
        .order('created_at', { ascending: false })
        .limit(8);
      if (!active) return;
      if (error || !Array.isArray(data)) return;
      const mapped: Activity[] = (data as any[])
        .filter((row) => row && row.seller && row.seller.username)
        .map((row) => ({
          id: row.id,
          username: row.seller.username,
          brand: row.brand ?? null,
          title: row.title,
          created_at: row.created_at,
        }));
      if (!active) return;
      setItems(mapped);
    })();
    return () => {
      active = false;
    };
  }, []);

  const latestItemsRef = useRef(items);
  latestItemsRef.current = items;

  // Cycle through items
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    if (items.length === 0) return;
    // Dynamic Island expand-in: blob → pill
    islandScale.setValue(0.2);
    islandOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(islandScale, {
        toValue: 1,
        useNativeDriver: USE_NATIVE_DRIVER,
        damping: 14,
        stiffness: 180,
        mass: 0.9,
      }),
      Animated.timing(islandOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
    // Initial fade-in
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

    if (items.length > 1) {
      t = setInterval(() => {
        // Slide current up + fade, then swap and slide new in from below.
        Animated.parallel([
          Animated.timing(slide, {
            toValue: -16,
            duration: 220,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]).start(() => {
          setIndex((i) => (i + 1) % latestItemsRef.current.length);
          slide.setValue(16);
          opacity.setValue(0);
          Animated.parallel([
            Animated.spring(slide, {
              toValue: 0,
              useNativeDriver: USE_NATIVE_DRIVER,
              damping: 18,
              stiffness: 220,
              mass: 0.7,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 220,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]).start();
        });
      }, CYCLE_MS);
    }
    return () => {
      if (t) clearInterval(t);
    };
  }, [items.length, slide, opacity, islandScale, islandOpacity]);

  if (items.length === 0) return null;

  const current = items[index] ?? items[0];
  const label = current.brand || current.title;

  const dotStyle = {
    opacity: dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
    transform: [
      {
        scale: dotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }),
      },
    ],
  };

  return (
    <View style={{ alignItems: 'center', paddingTop: 4, paddingBottom: 8 }}>
      <Animated.View
        style={{
          opacity: islandOpacity,
          transform: [{ scale: Animated.multiply(islandScale, pressScale) }],
          ...Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.28,
              shadowRadius: 14,
            },
            android: { elevation: 6 },
            default: { boxShadow: '0px 6px 14px rgba(0,0,0,0.28)' },
          }),
        }}
      >
        <Pressable
          onPress={() => router.push(`/product/${current.id}`)}
          onPressIn={() =>
            Animated.spring(pressScale, {
              toValue: 1.04,
              useNativeDriver: USE_NATIVE_DRIVER,
              damping: 14,
              stiffness: 280,
            }).start()
          }
          onPressOut={() =>
            Animated.spring(pressScale, {
              toValue: 1,
              useNativeDriver: USE_NATIVE_DRIVER,
              damping: 14,
              stiffness: 280,
            }).start()
          }
          style={{
            minWidth: ISLAND_MIN_W,
            maxWidth: ISLAND_MAX_W,
            backgroundColor: INK,
            borderRadius: 999,
            paddingLeft: 10,
            paddingRight: 4,
            paddingVertical: 4,
            flexDirection: 'row',
            alignItems: 'center',
            // Subtle inner highlight rim — sells the "depth" of the notch
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          {/* Live pulse dot */}
          <Animated.View
            style={[
              {
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: PURPLE,
                marginLeft: 2,
                marginRight: 8,
              },
              dotStyle,
            ]}
          />
          <Text
            style={{
              fontSize: 9,
              fontWeight: '900',
              color: PURPLE,
              letterSpacing: 1.2,
              marginRight: 10,
            }}
          >
            LIVE
          </Text>

          <Animated.View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              opacity,
              transform: [{ translateY: slide }],
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: 'white',
                fontSize: 12,
                fontWeight: '600',
                flex: 1,
              }}
            >
              <Text style={{ fontWeight: '800' }}>@{current.username}</Text>
              {' · '}
              <Text style={{ fontWeight: '800' }}>{label}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)' }}> · {timeAgo(current.created_at)}</Text>
            </Text>
          </Animated.View>

          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 6,
            }}
          >
            <Feather name="arrow-up-right" size={12} color="white" />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
