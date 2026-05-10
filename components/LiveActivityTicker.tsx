import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { Listing } from '@/types';

type Activity = {
  id: string;
  username: string;
  brand: string | null;
  title: string;
  created_at: string;
};

const CYCLE_MS = 5200;
const INK = '#0a0a0a';
const LIME = '#d8f53a';

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

  // Pulse the live dot continuously
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
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
      if (error || !data) return;
      const mapped: Activity[] = (data as unknown as (Listing & { seller: { username: string } })[])
        .filter((row) => row?.seller?.username)
        .map((row) => ({
          id: row.id,
          username: row.seller.username,
          brand: row.brand ?? null,
          title: row.title,
          created_at: row.created_at,
        }));
      setItems(mapped);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Cycle through items
  useEffect(() => {
    if (items.length === 0) return;
    // Initial fade-in
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    if (items.length === 1) return;

    const t = setInterval(() => {
      // Slide current up + fade, then swap and slide new in from below.
      Animated.parallel([
        Animated.timing(slide, {
          toValue: -16,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIndex((i) => (i + 1) % items.length);
        slide.setValue(16);
        opacity.setValue(0);
        Animated.parallel([
          Animated.spring(slide, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 220,
            mass: 0.7,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, CYCLE_MS);
    return () => clearInterval(t);
  }, [items.length, slide, opacity]);

  if (items.length === 0) return null;

  const current = items[index];
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
    <Pressable
      onPress={() => router.push(`/product/${current.id}`)}
      style={{
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 8,
        backgroundColor: INK,
        borderRadius: 999,
        paddingLeft: 14,
        paddingRight: 6,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        ...Platform.select({
          ios: {
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          },
          android: { elevation: 3 },
        }),
      }}
    >
      {/* Live pulse dot */}
      <Animated.View
        style={[
          {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: LIME,
            marginRight: 10,
          },
          dotStyle,
        ]}
      />
      <Text
        style={{
          fontSize: 10,
          fontWeight: '900',
          color: LIME,
          letterSpacing: 1.4,
          marginRight: 12,
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
            fontSize: 13,
            fontWeight: '600',
            flex: 1,
          }}
        >
          <Text style={{ fontWeight: '800' }}>@{current.username}</Text>
          {' just listed '}
          <Text style={{ fontWeight: '800' }}>{label}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.55)' }}> · {timeAgo(current.created_at)}</Text>
        </Text>
      </Animated.View>

      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 8,
        }}
      >
        <Feather name="arrow-up-right" size={14} color="white" />
      </View>
    </Pressable>
  );
}
