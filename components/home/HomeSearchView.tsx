import React, { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
  useWindowDimensions,
  BackHandler,
  Animated as RNAnimated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Text, TextInput } from '@/lib/rnText';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/lib/toast';
import { useTheme } from '@/context/ThemeContext';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { BinocularsIcon } from '@/components/ui/BinocularsIcon';
import { searchUsers } from '@/lib/follows';
import { searchListings } from '@/lib/listings';
import { getSearchSuggestions } from '@/lib/searchSuggestions';
import { PreSearchSuggestions } from './PreSearchSuggestions';
import {
  SearchFilterChips,
  type SearchFilterState,
  EMPTY_SEARCH_FILTERS,
} from '@/components/discover';
import { ListingCard } from '@/components/ListingCard';
import { useGridDimensions } from '@/lib/responsive';
import { radii, type as typography } from '@/lib/theme';
import type { Listing } from '@/types';

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

export type SearchTab = 'listings' | 'seller';

const POPULAR_SEARCHES = [
  'Vintage',
  'Sneakers',
  'Jackets',
  'Dresses',
  'Hoodies',
  'Jewelry',
  'Bags',
  'Nike',
  'Zara',
  'Denim',
  'Watches',
  'Electronics',
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
  const { theme, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const inputRef = useRef<any>(null);
  const pagerRef = useRef<ScrollView>(null);

  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);
  const [hasSubmitted, setHasSubmitted] = useState(initialQuery.trim().length > 0);
  const { previousSearches, addSearch, removeSearch } = useSearchHistory();

  const suggestions = useMemo(
    () =>
      getSearchSuggestions(query, {
        recentSearches: previousSearches,
        limit: 12,
      }),
    [query, previousSearches],
  );

  const [sellerResults, setSellerResults] = useState<SellerResult[]>([]);
  const [listingResults, setListingResults] = useState<Listing[]>([]);
  const [searchFilters, setSearchFilters] = useState<SearchFilterState>(EMPTY_SEARCH_FILTERS);
  const [loading, setLoading] = useState(false);

  const scrollX = useRef(new RNAnimated.Value(initialTab === 'listings' ? 0 : screenWidth)).current;
  const searchRequestIdRef = useRef(0);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Entrance / Exit Motion ──────────────────────────────────────────────────
  const animProgress = useSharedValue(0);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    animProgress.value = withTiming(1, {
      duration: 260,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [animProgress]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    haptic();
    Keyboard.dismiss();
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      addSearch(trimmed);
    }
    animProgress.value = withTiming(
      0,
      {
        duration: 200,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      },
    );
  }, [isClosing, onClose, animProgress, query, addSearch]);

  useEffect(() => {
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [handleClose]);

  const rootAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(animProgress.value, [0, 0.15, 1], [0, 0.9, 1]),
  }));

  const searchBarAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(animProgress.value, [0, 0.3, 1], [0, 0.8, 1]);
    const translateY = interpolate(animProgress.value, [0, 1], [-8, 0]);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(animProgress.value, [0, 1], [20, 0]);
    const opacity = interpolate(animProgress.value, [0, 0.25, 1], [0, 0, 1]);
    return {
      flex: 1,
      opacity,
      transform: [{ translateY }],
    };
  });

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

  // Real-time multi-criteria filtering on listingResults
  const displayListings = useMemo(() => {
    let list = listingResults;

    if (searchFilters.category) {
      list = list.filter((l) => l && l.category === searchFilters.category);
    }
    if (searchFilters.subcategory) {
      list = list.filter((l) => l && l.subcategory === searchFilters.subcategory);
    }
    if (searchFilters.brand) {
      const bLower = searchFilters.brand.toLowerCase();
      list = list.filter((l) => l && l.brand && l.brand.toLowerCase().includes(bLower));
    }
    if (searchFilters.sizes.length > 0) {
      list = list.filter((l) => l && l.size && searchFilters.sizes.includes(l.size));
    }
    if (searchFilters.conditions.length > 0) {
      list = list.filter((l) => l && l.condition && searchFilters.conditions.includes(l.condition));
    }
    if (searchFilters.priceMin != null) {
      list = list.filter((l) => l && l.price >= searchFilters.priceMin!);
    }
    if (searchFilters.priceMax != null) {
      list = list.filter((l) => l && l.price <= searchFilters.priceMax!);
    }
    if (searchFilters.color) {
      const colLower = searchFilters.color.toLowerCase();
      list = list.filter((l) => l && l.color && l.color.toLowerCase() === colLower);
    }
    if (searchFilters.material) {
      const matLower = searchFilters.material.toLowerCase();
      list = list.filter(
        (l) =>
          l &&
          ((l.description && l.description.toLowerCase().includes(matLower)) ||
            (Array.isArray(l.tags) &&
              l.tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(matLower)))),
      );
    }
    if (searchFilters.sort) {
      list = [...list];
      if (searchFilters.sort === 'price_asc') {
        list.sort((a, b) => a.price - b.price);
      } else if (searchFilters.sort === 'price_desc') {
        list.sort((a, b) => b.price - a.price);
      } else if (searchFilters.sort === 'newest') {
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (searchFilters.sort === 'popular') {
        list.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
      }
    }

    return list;
  }, [listingResults, searchFilters]);

  // Re-sync scrollX and pager offset on resize or activeTab change
  useEffect(() => {
    const targetX = activeTab === 'listings' ? 0 : screenWidth;
    scrollX.setValue(targetX);
    pagerRef.current?.scrollTo({ x: targetX, animated: false });
  }, [screenWidth, activeTab, scrollX]);

  // ── Core Search Execution ───────────────────────────────────────────────────
  const runSearch = useCallback(
    async (searchTerm: string, requestId: number) => {
      const trimmed = searchTerm.trim();

      if (!trimmed) {
        if (searchRequestIdRef.current === requestId) {
          setSellerResults([]);
          setListingResults([]);
          setLoading(false);
        }
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

        // Real profiles from Supabase (counts returned directly from server-side grouped query)
        if (usersResult && usersResult.length > 0) {
          combinedSellers = usersResult.map((u) => ({
            id: u.id,
            username: u.username ?? 'user',
            full_name: u.full_name,
            avatar_url: u.avatar_url,
            listingCount: u.listingCount ?? 0,
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
    // Increment searchRequestId immediately when query changes so in-flight searches immediately become stale
    const requestId = ++searchRequestIdRef.current;

    if (!trimmed) {
      setSellerResults([]);
      setListingResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(trimmed, requestId);
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
      RNAnimated.spring(scrollX, {
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
      if (hasSubmitted) return;
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
    [hasSubmitted, activeTab, handleTabPress],
  );

  // Suggestion selection from pre-search suggestions list
  const handleSelectSuggestion = useCallback(
    (term: string) => {
      haptic();
      setQuery(term);
      addSearch(term);
      setHasSubmitted(true);
      Keyboard.dismiss();
      const requestId = ++searchRequestIdRef.current;
      runSearch(term, requestId);
    },
    [addSearch, runSearch],
  );

  // Arrow click to populate search bar for query refinement
  const handlePopulateSuggestion = useCallback(
    (term: string) => {
      haptic();
      setQuery(term.trim() + ' ');
      setHasSubmitted(false);
      inputRef.current?.focus?.();
    },
    [],
  );

  // Tag selection from Previous searches / Popular searches
  const handleSelectTag = useCallback(
    (term: string) => {
      haptic();
      setQuery(term);
      addSearch(term);
      setHasSubmitted(true);
      Keyboard.dismiss();
      const requestId = ++searchRequestIdRef.current;
      runSearch(term, requestId);
    },
    [addSearch, runSearch],
  );

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      addSearch(trimmed);
      setHasSubmitted(true);
      Keyboard.dismiss();
      const requestId = ++searchRequestIdRef.current;
      runSearch(trimmed, requestId);
    }
  }, [query, addSearch, runSearch]);

  // ── Render Seller Row (Exact match to Image 2) ─────────────────────────────
  const renderSellerItem = useCallback(
    ({ item }: { item: SellerResult }) => {
      const initial = (item.username?.charAt(0) || 'D').toUpperCase();

      return (
        <Pressable
          onPress={() => {
            haptic();
            const trimmed = query.trim();
            if (trimmed.length > 0) {
              addSearch(trimmed);
            }
            if (__DEV__ && item.id.startsWith('mock-')) {
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
            borderBottomColor: theme.border,
            backgroundColor: pressed ? theme.surface : theme.background,
          })}
        >
          {/* Avatar: Square box with light sage background and bold initial */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 2,
              backgroundColor: isDark ? theme.surface : '#E0ECE5',
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
                  color: isDark ? theme.text : '#0F382A',
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
                color: theme.text,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {item.username}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: theme.mute,
                marginTop: 2,
              }}
            >
              {item.listingCount} listings
            </Text>
          </View>
        </Pressable>
      );
    },
    [toast, theme, isDark, query, addSearch],
  );

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
          borderColor: isDark ? theme.border : '#123D2E',
          borderRadius: 0,
          paddingVertical: 14,
          paddingHorizontal: 14,
          backgroundColor: 'transparent',
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
              color: theme.text,
              letterSpacing: -0.2,
            }}
          >
            Save your searches
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: theme.mute,
              marginTop: 2,
            }}
          >
            Choose from recently searched
          </Text>
        </View>

        <Feather name="chevron-right" size={20} color={theme.mute} />
      </Pressable>

      {/* Previous searches Section */}
      {previousSearches.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: theme.text,
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
                  backgroundColor: isDark ? theme.surface : '#FAF1D6',
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
                    color: theme.text,
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
                  <Feather name="x" size={13} color={theme.text} />
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
            color: theme.text,
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
                backgroundColor: isDark ? theme.surface : '#FAF1D6',
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
                  color: theme.text,
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
    <Animated.View
      style={[{ flex: 1, backgroundColor: theme.background }, rootAnimatedStyle]}
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
          borderBottomWidth: hasSubmitted ? 1 : 0,
          borderBottomColor: isDark ? '#242D31' : theme.border,
        }}
      >
        {/* Search Input Box */}
        <Animated.View
          style={[
            {
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isDark ? '#1C2327' : theme.surface,
              borderRadius: radii.pill,
              paddingLeft: 14,
              paddingRight: 10,
              height: 44,
              borderWidth: 1,
              borderColor: isDark ? '#2B353B' : theme.border,
            },
            searchBarAnimatedStyle,
          ]}
        >
          <Feather
            name="search"
            size={16}
            color={isDark ? '#9CA3AF' : theme.mute}
            style={{ flexShrink: 0 }}
          />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setHasSubmitted(false);
            }}
            onFocus={() => {
              if (query.trim().length > 0 && hasSubmitted) {
                setHasSubmitted(false);
              }
            }}
            onSubmitEditing={handleSubmitSearch}
            placeholder="Search"
            placeholderTextColor={isDark ? '#6B7280' : theme.muteSoft}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={
              {
                flex: 1,
                minWidth: 0,
                flexShrink: 1,
                marginLeft: 9,
                marginRight: 6,
                fontFamily: typography.family.sansMedium,
                fontSize: 16,
                letterSpacing: -0.15,
                color: isDark ? '#FFFFFF' : theme.ink,
                padding: 0,
                outlineStyle: 'none',
                outlineWidth: 0,
              } as any
            }
          />

          {hasQuery && (
            <Pressable
              onPress={() => {
                haptic();
                setQuery('');
                setHasSubmitted(false);
                ++searchRequestIdRef.current;
                setSellerResults([]);
                setListingResults([]);
                setLoading(false);
              }}
              hitSlop={8}
              accessibilityLabel="Clear search"
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: isDark ? '#2F3C43' : theme.border,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 2,
              }}
            >
              <Feather name="x" size={12} color={isDark ? '#D1D5DB' : theme.mute} />
            </Pressable>
          )}
        </Animated.View>

        {/* Close Text Button (Matching Screenshot) */}
        <Pressable
          onPress={handleClose}
          hitSlop={8}
          accessibilityLabel="Close search"
          style={({ pressed }) => ({
            paddingVertical: 6,
            paddingHorizontal: 4,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '500',
              color: isDark ? '#EDEDED' : theme.text,
              letterSpacing: -0.2,
            }}
          >
            Close
          </Text>
        </Pressable>
      </View>

      <Animated.View style={contentAnimatedStyle}>
        {/* ── Tab Switcher ('Items' & 'Members') ────────────────────────────── */}
        {!hasSubmitted && (
          <View
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: isDark ? '#242D31' : theme.border,
              marginTop: 4,
              position: 'relative',
            }}
          >
            {/* Items Tab */}
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
                  fontWeight: activeTab === 'listings' ? '600' : '400',
                  color: activeTab === 'listings' ? (isDark ? '#FFFFFF' : theme.text) : (isDark ? '#9CA3AF' : theme.mute),
                  fontFamily:
                    activeTab === 'listings'
                      ? 'Inklination-SemiBold, "Inklination SemiBold", "Inklination", Inter_600SemiBold, sans-serif'
                      : 'Eina03-Regular, "Eina 03 Regular", "Eina 03", "Eina03", Inter_400Regular, sans-serif',
                }}
              >
                Items
              </Text>
            </Pressable>

            {/* Members Tab */}
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
                  fontWeight: activeTab === 'seller' ? '600' : '400',
                  color: activeTab === 'seller' ? (isDark ? '#FFFFFF' : theme.text) : (isDark ? '#9CA3AF' : theme.mute),
                  fontFamily:
                    activeTab === 'seller'
                      ? 'Inklination-SemiBold, "Inklination SemiBold", "Inklination", Inter_600SemiBold, sans-serif'
                      : 'Eina03-Regular, "Eina 03 Regular", "Eina 03", "Eina03", Inter_400Regular, sans-serif',
                }}
              >
                Members
              </Text>
            </Pressable>

            {/* ── Continuous Sliding Underline Indicator ──────────────────────── */}
            <RNAnimated.View
              style={{
                position: 'absolute',
                bottom: -1,
                left: 0,
                width: tabWidth,
                height: 3,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ translateX: indicatorTranslateX }],
              }}
            >
              <View
                style={{
                  width: '85%',
                  height: 3,
                  backgroundColor: isDark ? '#2FD5C6' : '#0A3B2C',
                  borderRadius: 2,
                }}
              />
            </RNAnimated.View>
          </View>
        )}

        {/* ── Horizontal Swipeable Pager for Items & Members ───────────────── */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          scrollEnabled={!hasSubmitted}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialTab === 'listings' ? 0 : screenWidth, y: 0 }}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          style={[
            { flex: 1 },
            Platform.OS === 'web' && ({
              scrollSnapType: hasSubmitted ? 'none' : 'x mandatory',
              WebkitOverflowScrolling: 'touch',
            } as any),
          ]}
          contentContainerStyle={{ width: screenWidth * 2 }}
        >
          {/* ── Page 0: Items ──────────────────────────────────────────────── */}
          <View
            style={[
              { width: screenWidth, flex: 1, backgroundColor: theme.background },
              Platform.OS === 'web' && ({
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                flexShrink: 0,
              } as any),
            ]}
          >
            {!hasQuery ? (
              renderListingsIdleLanding
            ) : !hasSubmitted ? (
              <PreSearchSuggestions
                suggestions={suggestions}
                onSelect={handleSelectSuggestion}
                onPopulate={handlePopulateSuggestion}
              />
            ) : loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={isDark ? '#2FD5C6' : '#0A3B2C'} />
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingBottom: 40,
                }}
              >
                <SearchFilterChips
                  filters={searchFilters}
                  onUpdateFilter={setSearchFilters}
                  onResetFilters={() => setSearchFilters(EMPTY_SEARCH_FILTERS)}
                  resultCount={displayListings.length}
                />

                {displayListings.length > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 10,
                      paddingHorizontal: 16,
                      paddingTop: 8,
                    }}
                  >
                    {displayListings.map((item) => (
                      <View key={item.id} style={{ width: cardWidth }}>
                        <ListingCard listing={item} width={cardWidth} />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, color: theme.mute, textAlign: 'center' }}>
                      No listings found matching “{query}”
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

          </View>

          {/* ── Page 1: Seller ────────────────────────────────────────────────── */}
          <View
            style={[
              { width: screenWidth, flex: 1, backgroundColor: theme.background },
              Platform.OS === 'web' && ({
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                flexShrink: 0,
              } as any),
            ]}
          >
            {!hasQuery ? (
              /* Idle Seller state: Clean blank screen matching theme */
              <View style={{ flex: 1, backgroundColor: theme.background }} />
            ) : loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={isDark ? theme.purple : '#0A3B2C'} />
              </View>
            ) : sellerResults.length > 0 ? (
              <FlatList
                data={sellerResults}
                keyExtractor={(item) => item.id}
                renderItem={renderSellerItem}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40 }}
                ListHeaderComponent={
                  hasSubmitted ? (
                    <View
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: isDark ? '#242D31' : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: isDark ? '#EDEDED' : theme.text,
                        }}
                      >
                        {sellerResults.length} {sellerResults.length === 1 ? 'member' : 'members'}
                      </Text>
                    </View>
                  ) : null
                }
              />
            ) : (
              <View style={{ paddingVertical: 48, paddingHorizontal: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: theme.mute, textAlign: 'center' }}>
                  No sellers found matching “{query}”
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
});
