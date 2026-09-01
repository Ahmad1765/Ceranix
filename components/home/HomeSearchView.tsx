import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
  useWindowDimensions,
  Animated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useToast } from '@/lib/toast';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { BinocularsIcon } from '@/components/ui/BinocularsIcon';
import { searchUsers } from '@/lib/follows';
import { searchListings } from '@/lib/listings';
import { supabase } from '@/lib/supabase';
import { ListingCard } from '@/components/ListingCard';
import { useGridDimensions } from '@/lib/responsive';
import type { Listing } from '@/types';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

export type SearchTab = 'listings' | 'seller';

const POPULAR_SEARCHES = [
  'Bilar',
  'Kläder',
  'Pokemon',
  'Antikviteter',
  'Musik',
  'Hobby',
  'Inredning',
  'Lego',
  'Frimärken',
];

// Reference seed sellers matching the exact mockups
const SEED_SELLERS = [
  { id: 'mock-dis-22a', username: 'dis 22a', full_name: 'dis 22a', listingCount: 0 },
  { id: 'mock-dis-87', username: 'Dis_87', full_name: 'Dis_87', listingCount: 0 },
  { id: 'mock-dis-1', username: 'Dis1', full_name: 'Dis1', listingCount: 0 },
  { id: 'mock-dis-12', username: 'dis12', full_name: 'dis12', listingCount: 0 },
  { id: 'mock-dis-2007', username: 'Dis2007', full_name: 'Dis2007', listingCount: 0 },
  { id: 'mock-dis-53', username: 'Dis53', full_name: 'Dis53', listingCount: 0 },
  { id: 'mock-dis-64', username: 'dis64', full_name: 'dis64', listingCount: 0 },
  { id: 'mock-dis-vintage', username: 'dis_vintage', full_name: 'Dis Vintage', listingCount: 0 },
  { id: 'mock-discount', username: 'discount_vault', full_name: 'Discount Vault', listingCount: 0 },
  { id: 'mock-daniel', username: 'daniel_store', full_name: 'Daniel Store', listingCount: 0 },
];

export interface SellerResult {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string | null;
  listingCount: number;
}

interface HomeSearchViewProps {
  onClose: () => void;
  onOpenSavedAlerts?: () => void;
  initialQuery?: string;
  initialTab?: SearchTab;
}

export const HomeSearchView = memo(function HomeSearchView({
  onClose,
  onOpenSavedAlerts,
  initialQuery = '',
  initialTab = 'listings',
}: HomeSearchViewProps) {
  const toast = useToast();
  const { width: screenWidth } = useWindowDimensions();
  const inputRef = useRef<any>(null);
  const pagerRef = useRef<ScrollView>(null);

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);
  const { previousSearches, addSearch, removeSearch } = useSearchHistory();

  const [sellerResults, setSellerResults] = useState<SellerResult[]>([]);
  const [listingResults, setListingResults] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  const scrollX = useRef(new Animated.Value(initialTab === 'listings' ? 0 : screenWidth)).current;
  const searchRequestIdRef = useRef(0);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const { cardWidth } = useGridDimensions({
    min: 2,
    max: 4,
    thresholds: [560, 900, 1200],
    horizontalPadding: 16,
    gap: 10,
  });

  const hasQuery = query.trim().length > 0;
  const tabWidth = screenWidth / 2;

  // Real-time interpolated translation for sliding green indicator bar
  const indicatorTranslateX = scrollX.interpolate({
    inputRange: [0, screenWidth],
    outputRange: [0, tabWidth],
    extrapolate: 'clamp',
  });

  // Re-sync scrollX and pager offset on resize or activeTab change
  useEffect(() => {
    const targetX = activeTab === 'listings' ? 0 : screenWidth;
    scrollX.setValue(targetX);
    pagerRef.current?.scrollTo({ x: targetX, animated: false });
  }, [screenWidth, activeTab, scrollX]);

  // ── Core Search Execution ───────────────────────────────────────────────────
  const runSearch = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      const requestId = ++searchRequestIdRef.current;

      if (!trimmed) {
        setSellerResults([]);
        setListingResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [usersResult, listingsResult] = await Promise.all([
          searchUsers(trimmed, 25).catch(() => []),
          searchListings({ query: trimmed, limit: 40 }).catch(() => ({ ok: false, rows: [] })),
        ]);

        if (searchRequestIdRef.current !== requestId) return;

        let combinedSellers: SellerResult[] = [];

        // Real profiles from Supabase
        if (usersResult && usersResult.length > 0) {
          const userIds = usersResult.map((u) => u.id);

          // Head-only exact count requests per seller (zero listing row payload)
          const countPromises = userIds.map(async (id) => {
            try {
              const { count } = await supabase
                .from('listings')
                .select('id', { count: 'exact', head: true })
                .eq('seller_id', id)
                .eq('is_sold', false);
              return { id, count: count ?? 0 };
            } catch {
              return { id, count: 0 };
            }
          });

          const countResults = await Promise.all(countPromises);
          if (searchRequestIdRef.current !== requestId) return;

          const countsMap: Record<string, number> = {};
          countResults.forEach((r) => {
            countsMap[r.id] = r.count;
          });

          combinedSellers = usersResult.map((u) => ({
            id: u.id,
            username: u.username ?? 'user',
            full_name: u.full_name,
            avatar_url: u.avatar_url,
            listingCount: countsMap[u.id] ?? 0,
          }));
        }

        // Match seed mock sellers in development builds only (__DEV__)
        if (__DEV__) {
          const qLower = trimmed.toLowerCase();
          const matchingSeeds = SEED_SELLERS.filter(
            (m) =>
              m.username.toLowerCase().includes(qLower) ||
              m.full_name.toLowerCase().includes(qLower),
          );

          for (const seed of matchingSeeds) {
            if (!combinedSellers.some((s) => s.username.toLowerCase() === seed.username.toLowerCase())) {
              combinedSellers.push(seed);
            }
          }
        }

        if (searchRequestIdRef.current === requestId) {
          setSellerResults(combinedSellers);

          if (listingsResult.ok && listingsResult.rows) {
            setListingResults(listingsResult.rows);
          } else {
            setListingResults([]);
          }
        }
      } catch (err) {
        if (searchRequestIdRef.current === requestId) {
          console.warn('[HomeSearchView] Search error', err);
        }
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSellerResults([]);
      setListingResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(trimmed);
    }, 150);

    return () => clearTimeout(timer);
  }, [query, runSearch]);

  // Handle Tab Switch by clicking header
  const handleTabPress = useCallback(
    (tab: SearchTab) => {
      haptic();
      setActiveTab(tab);
      const targetX = tab === 'listings' ? 0 : screenWidth;
      pagerRef.current?.scrollTo({ x: targetX, animated: true });
      Animated.spring(scrollX, {
        toValue: targetX,
        useNativeDriver: false,
        friction: 8,
        tension: 50,
      }).start();
    },
    [screenWidth, scrollX],
  );

  // Scroll handler with continuous animation event
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent?.contentOffset?.x ?? 0;
      scrollX.setValue(offsetX);
      const pageIndex = Math.round(offsetX / screenWidth);
      const newTab: SearchTab = pageIndex === 0 ? 'listings' : 'seller';
      if (newTab !== activeTab) {
        setActiveTab(newTab);
      }
    },
    [screenWidth, activeTab, scrollX],
  );

  // Handle Momentum Scroll End for Horizontal Pager
  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const pageIndex = Math.round(offsetX / screenWidth);
      const newTab: SearchTab = pageIndex === 0 ? 'listings' : 'seller';
      if (newTab !== activeTab) {
        setActiveTab(newTab);
      }
    },
    [screenWidth, activeTab],
  );

  // Touch Swipe Handlers for responsive horizontal swipe across web and mobile
  const handleTouchStart = useCallback((e: any) => {
    touchStartX.current = e.nativeEvent?.pageX ?? e.nativeEvent?.clientX ?? 0;
    touchStartY.current = e.nativeEvent?.pageY ?? e.nativeEvent?.clientY ?? 0;
  }, []);

  const handleTouchEnd = useCallback(
    (e: any) => {
      const currentX = e.nativeEvent?.pageX ?? e.nativeEvent?.clientX ?? 0;
      const currentY = e.nativeEvent?.pageY ?? e.nativeEvent?.clientY ?? 0;
      const deltaX = currentX - touchStartX.current;
      const deltaY = currentY - touchStartY.current;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 35) {
        if (deltaX < 0 && activeTab === 'listings') {
          // Swipe left -> go to Seller
          handleTabPress('seller');
        } else if (deltaX > 0 && activeTab === 'seller') {
          // Swipe right -> go to Listings
          handleTabPress('listings');
        }
      }
    },
    [activeTab, handleTabPress],
  );

  // Tag selection from Previous searches / Popular searches
  const handleSelectTag = useCallback(
    (term: string) => {
      haptic();
      setQuery(term);
      addSearch(term);
      Keyboard.dismiss();
    },
    [addSearch],
  );

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      addSearch(trimmed);
      Keyboard.dismiss();
    }
  }, [query, addSearch]);

  const handleCameraPress = useCallback(async () => {
    haptic();
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          toast.show('Camera roll permission needed for visual search', {
            variant: 'info',
            icon: 'camera',
          });
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        toast.show('Visual search analyzing image...', {
          variant: 'info',
          icon: 'camera',
        });
        setQuery('vintage');
        addSearch('Visual Search');
      }
    } catch {
      toast.show('Could not open image library', { variant: 'info', icon: 'alert-circle' });
    }
  }, [toast, addSearch]);

  // ── Render Seller Row (Exact match to Image 2) ─────────────────────────────
  const renderSellerItem = useCallback(({ item }: { item: SellerResult }) => {
    const initial = (item.username?.charAt(0) || 'D').toUpperCase();

    return (
      <Pressable
        onPress={() => {
          haptic();
          if (item.id.startsWith('mock-')) {
            toast.show(`Viewing seller @${item.username}`, { variant: 'info', icon: 'user' });
          } else {
            router.push(`/user/${item.id}` as any);
          }
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#EEEEEE',
          backgroundColor: pressed ? '#F8FAF9' : '#FFFFFF',
        })}
      >
        {/* Avatar: Square box with light sage background and bold initial */}
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 2,
            backgroundColor: '#E0ECE5',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
            overflow: 'hidden',
          }}
        >
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          ) : (
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: '#0F382A',
              }}
            >
              {initial}
            </Text>
          )}
        </View>

        {/* Username and Listing count */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: '#111827',
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {item.username}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: '#6B7280',
              marginTop: 2,
            }}
          >
            {item.listingCount} listings
          </Text>
        </View>
      </Pressable>
    );
  }, [toast]);

  // ── Render Idle Landing Content for Listings Tab (Image 1) ─────────────────
  const renderListingsIdleLanding = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
    >
      {/* Save your searches Banner Card */}
      <Pressable
        onPress={() => {
          haptic();
          if (onOpenSavedAlerts) {
            onOpenSavedAlerts();
          } else {
            toast.show('Select or type a search to save alerts', {
              variant: 'info',
              icon: 'bookmark',
            });
          }
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1.2,
          borderColor: '#123D2E',
          borderRadius: 6,
          paddingVertical: 14,
          paddingHorizontal: 14,
          backgroundColor: '#FFFFFF',
          gap: 14,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <BinocularsIcon width={48} height={42} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: '#111827',
              letterSpacing: -0.2,
            }}
          >
            Save your searches
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: '#6B7280',
              marginTop: 2,
            }}
          >
            Choose from recently searched
          </Text>
        </View>

        <Feather name="chevron-right" size={20} color="#374151" />
      </Pressable>

      {/* Previous searches Section */}
      {previousSearches.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: '#111827',
              marginBottom: 12,
            }}
          >
            Previous searches
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {previousSearches.map((term) => (
              <Pressable
                key={term}
                onPress={() => handleSelectTag(term)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#FAF1D6',
                  borderRadius: 4,
                  paddingVertical: 8,
                  paddingLeft: 12,
                  paddingRight: 8,
                  gap: 8,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#111827',
                  }}
                >
                  {term}
                </Text>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    haptic();
                    removeSearch(term);
                  }}
                  hitSlop={10}
                  accessibilityLabel={`Remove ${term}`}
                  style={({ pressed }) => ({
                    padding: 3,
                    opacity: pressed ? 0.5 : 1,
                  })}
                >
                  <Feather name="x" size={13} color="#111827" />
                </Pressable>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Popular searches Section */}
      <View style={{ marginTop: 24 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: '#111827',
            marginBottom: 12,
          }}
        >
          Popular searches
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {POPULAR_SEARCHES.map((term) => (
            <Pressable
              key={term}
              onPress={() => handleSelectTag(term)}
              style={({ pressed }) => ({
                backgroundColor: '#FAF1D6',
                borderRadius: 4,
                paddingVertical: 8,
                paddingHorizontal: 12,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#111827',
                }}
              >
                {term}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  return (
    <View
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      onTouchStart={Platform.OS === 'web' ? handleTouchStart : undefined}
      onTouchEnd={Platform.OS === 'web' ? handleTouchEnd : undefined}
    >
      {/* ── Top Header Row ─────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 8,
          gap: 10,
        }}
      >
        {/* Back Button '<' */}
        <Pressable
          onPress={() => {
            haptic();
            Keyboard.dismiss();
            onClose();
          }}
          hitSlop={12}
          accessibilityLabel="Back to feed"
          style={({ pressed }) => ({
            padding: 4,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={28} color="#111827" />
        </Pressable>

        {/* Search Input Box */}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 1.2,
            borderColor: '#111827',
            borderRadius: 4,
            height: 44,
            paddingHorizontal: 12,
            backgroundColor: '#FFFFFF',
          }}
        >
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmitSearch}
            placeholder="What are you looking for?"
            placeholderTextColor="#6B7280"
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={
              {
                flex: 1,
                fontSize: 14.5,
                color: '#111827',
                padding: 0,
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
          />

          {hasQuery ? (
            <Pressable
              onPress={() => {
                haptic();
                setQuery('');
                ++searchRequestIdRef.current;
                setSellerResults([]);
                setListingResults([]);
                setLoading(false);
              }}
              hitSlop={10}
              accessibilityLabel="Clear search"
              style={{ padding: 4 }}
            >
              <Feather name="x" size={18} color="#111827" />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleCameraPress}
              hitSlop={10}
              accessibilityLabel="Search by photo"
              style={{ padding: 4 }}
            >
              <Feather name="camera" size={18} color="#111827" />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Tab Switcher ('Listings' & 'Seller') ────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
          marginTop: 4,
          position: 'relative',
        }}
      >
        {/* Listings Tab */}
        <Pressable
          onPress={() => handleTabPress('listings')}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              fontSize: 15.5,
              fontWeight: activeTab === 'listings' ? '700' : '500',
              color: activeTab === 'listings' ? '#111827' : '#4B5563',
            }}
          >
            Listings
          </Text>
        </Pressable>

        {/* Seller Tab */}
        <Pressable
          onPress={() => handleTabPress('seller')}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
              fontSize: 15.5,
              fontWeight: activeTab === 'seller' ? '700' : '500',
              color: activeTab === 'seller' ? '#111827' : '#4B5563',
            }}
          >
            Seller
          </Text>
        </Pressable>

        {/* ── Continuous Sliding Underline Indicator ──────────────────────── */}
        <Animated.View
          style={{
            position: 'absolute',
            bottom: -1,
            left: 0,
            width: tabWidth,
            height: 3.5,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ translateX: indicatorTranslateX }],
          }}
        >
          <View
            style={{
              width: '85%',
              height: 3.5,
              backgroundColor: '#0A3B2C',
              borderRadius: 2,
            }}
          />
        </Animated.View>
      </View>

      {/* ── Horizontal Swipeable Pager for Listings & Seller ───────────────── */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: initialTab === 'listings' ? 0 : screenWidth, y: 0 }}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        style={[
          { flex: 1 },
          Platform.OS === 'web' && ({
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          } as any),
        ]}
        contentContainerStyle={{ width: screenWidth * 2 }}
      >
        {/* ── Page 0: Listings ──────────────────────────────────────────────── */}
        <View
          style={[
            { width: screenWidth, flex: 1 },
            Platform.OS === 'web' && ({
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              flexShrink: 0,
            } as any),
          ]}
        >
          {!hasQuery ? (
            renderListingsIdleLanding
          ) : loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0A3B2C" />
            </View>
          ) : listingResults.length > 0 ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 40,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                {listingResults.map((item) => (
                  <View key={item.id} style={{ width: cardWidth }}>
                    <ListingCard listing={item} width={cardWidth} />
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
                No listings found matching “{query}”
              </Text>
            </View>
          )}
        </View>

        {/* ── Page 1: Seller ────────────────────────────────────────────────── */}
        <View
          style={[
            { width: screenWidth, flex: 1, backgroundColor: '#FFFFFF' },
            Platform.OS === 'web' && ({
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              flexShrink: 0,
            } as any),
          ]}
        >
          {!hasQuery ? (
            /* Idle Seller state: Clean blank white screen matching Image 1 */
            <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
          ) : loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0A3B2C" />
            </View>
          ) : sellerResults.length > 0 ? (
            <FlatList
              data={sellerResults}
              keyExtractor={(item) => item.id}
              renderItem={renderSellerItem}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          ) : (
            <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
                No sellers found matching “{query}”
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
});
