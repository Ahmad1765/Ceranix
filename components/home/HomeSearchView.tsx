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
  Extrapolation,
} from 'react-native-reanimated';
import { Text, TextInput } from '@/lib/rnText';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/lib/toast';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/lib/auth';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { BinocularsIcon } from '@/components/ui/BinocularsIcon';
import { searchUsers } from '@/lib/follows';
import { searchListings } from '@/lib/listings';
import { getSearchSuggestions } from '@/lib/searchSuggestions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSavedSearch, deleteSavedSearch } from '@/lib/savedSearches';
import { useSavedSearchesQuery } from '@/lib/queries/useFeedQueries';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queries/keys';
import { PreSearchSuggestions } from './PreSearchSuggestions';
import { SearchFilterChips } from '@/components/discover/SearchFilterChips';
import {
  type SearchFilterState,
  EMPTY_SEARCH_FILTERS,
  countActiveSearchFilters,
} from '@/lib/searchFilters';
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
  const { previousSearches, historyItems, addSearch, removeSearch } = useSearchHistory();

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

  const { user } = useAuth();
  const savedSearchesQ = useSavedSearchesQuery(user?.id ?? null);

  const [localSavedKeys, setLocalSavedKeys] = useState<Set<string>>(new Set());

  const storageKey = user?.id
    ? `@ceranix_saved_searches_local:${user.id}`
    : '@ceranix_saved_searches_local:guest';

  // Load local saved searches scoped to active user / guest; clear previous user keys on auth change
  useEffect(() => {
    setLocalSavedKeys(new Set());
    let isMounted = true;

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!isMounted) return;
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              setLocalSavedKeys(new Set(arr));
            }
          } catch {}
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [storageKey]);

  const effectiveSearchInfo = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed) {
      return { key: `q:${trimmed.toLowerCase()}`, label: trimmed, query: trimmed };
    }
    if (searchFilters.brand) {
      return { key: `brand:${searchFilters.brand.toLowerCase()}`, label: searchFilters.brand, query: searchFilters.brand };
    }
    if (searchFilters.category) {
      return { key: `cat:${searchFilters.category.toLowerCase()}`, label: searchFilters.category, query: searchFilters.category };
    }
    const count = countActiveSearchFilters(searchFilters);
    if (count > 0) {
      return { key: `filters:${count}`, label: `${count} Filters`, query: 'Filtered Search' };
    }
    return { key: 'all:search', label: 'All Items', query: 'All Listings' };
  }, [query, searchFilters]);

  const isSaved = useMemo(() => {
    const { key, label } = effectiveSearchInfo;
    if (localSavedKeys.has(key)) return true;
    if (savedSearchesQ.data) {
      const actualQuery = query.trim() || null;
      if (actualQuery) {
        const qNorm = actualQuery.toLowerCase();
        return savedSearchesQ.data.some(
          (s) =>
            s.query?.trim().toLowerCase() === qNorm ||
            s.label?.trim().toLowerCase() === qNorm,
        );
      }
      const catNorm = searchFilters.category?.toLowerCase() || null;
      const labelNorm = label.toLowerCase();
      return savedSearchesQ.data.some(
        (s) =>
          (!s.query || s.query.trim() === '') &&
          (catNorm ? s.category?.toLowerCase() === catNorm : !s.category) &&
          s.label?.trim().toLowerCase() === labelNorm,
      );
    }
    return false;
  }, [effectiveSearchInfo, localSavedKeys, query, savedSearchesQ.data, searchFilters.category]);

  const handleToggleSaveSearch = useCallback(async () => {
    haptic();
    const { key, label } = effectiveSearchInfo;
    const currentlySaved = isSaved;
    const nextSaved = !currentlySaved;

    // Optimistic toggle locally
    setLocalSavedKeys((prev) => {
      const next = new Set(prev);
      if (nextSaved) {
        next.add(key);
      } else {
        next.delete(key);
      }
      AsyncStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(next)),
      ).catch(() => {});
      return next;
    });

    if (nextSaved) {
      toast.show(`Saved search alert for "${label}"`, {
        variant: 'success',
        icon: 'star',
      });
    } else {
      toast.show('Search alert removed', {
        variant: 'info',
        icon: 'trash-2',
      });
    }

    // If authenticated, sync with Supabase
    if (user?.id) {
      try {
        const actualQuery = query.trim() || null;
        const existing = savedSearchesQ.data?.find((s) => {
          if (actualQuery) {
            const qNorm = actualQuery.toLowerCase();
            return (
              s.query?.trim().toLowerCase() === qNorm ||
              s.label?.trim().toLowerCase() === qNorm
            );
          }
          const catNorm = searchFilters.category?.toLowerCase() || null;
          const labelNorm = label.toLowerCase();
          return (
            (!s.query || s.query.trim() === '') &&
            (catNorm ? s.category?.toLowerCase() === catNorm : !s.category) &&
            s.label?.trim().toLowerCase() === labelNorm
          );
        });

        if (currentlySaved && existing) {
          await deleteSavedSearch(existing.id);
          queryClient.invalidateQueries({ queryKey: qk.savedSearches(user.id) });
        } else if (!currentlySaved) {
          await createSavedSearch({
            userId: user.id,
            query: actualQuery,
            category: searchFilters.category || null,
            gender: null,
            label,
          });
          queryClient.invalidateQueries({ queryKey: qk.savedSearches(user.id) });
        }
      } catch (err) {
        console.warn('[saved-searches] sync error', err);
      }
    }
  }, [effectiveSearchInfo, isSaved, user, savedSearchesQ.data, query, searchFilters, toast, storageKey]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Entrance / Exit Motion ──────────────────────────────────────────────────
  const animProgress = useSharedValue(0);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    animProgress.value = withTiming(1, {
      duration: 400,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    const focusTimer = setTimeout(() => {
      inputRef.current?.focus?.();
    }, 260);
    return () => clearTimeout(focusTimer);
  }, [animProgress]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    haptic();
    Keyboard.dismiss();
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      addSearch(trimmed, activeTab);
    }
    animProgress.value = withTiming(
      0,
      {
        duration: 320,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      },
      (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      },
    );
  }, [isClosing, onClose, animProgress, query, activeTab, addSearch]);

  useEffect(() => {
    const onBackPress = () => {
      handleClose();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [handleClose]);

  const rootAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      animProgress.value,
      [0, 1],
      [screenWidth, 0],
      Extrapolation.CLAMP,
    );
    return {
      transform: [{ translateX }],
    };
  });

  const searchBarAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(animProgress.value, [0, 1], [0.96, 1], Extrapolation.CLAMP);
    return {
      transform: [{ scale }],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(animProgress.value, [0, 0.2, 1], [0, 0.8, 1], Extrapolation.CLAMP);
    return {
      flex: 1,
      opacity,
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
  const canSwitchTabs = !hasSubmitted && !hasQuery;
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

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Re-sync scrollX and pager offset on resize only (activeTab driven programmatically by handleTabPress)
  useEffect(() => {
    const targetX = activeTabRef.current === 'listings' ? 0 : screenWidth;
    scrollX.setValue(targetX);
    pagerRef.current?.scrollTo({ x: targetX, animated: false });
  }, [screenWidth, scrollX]);

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

      if (searchRequestIdRef.current !== requestId) return;
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
      RNAnimated.timing(scrollX, {
        toValue: targetX,
        duration: 240,
        useNativeDriver: false,
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
        if (touchStartX.current < 45 && deltaX > 45 && activeTab === 'listings') {
          handleClose();
          return;
        }
        if (deltaX < 0 && activeTab === 'listings') {
          // Swipe left -> go to Seller
          handleTabPress('seller');
        } else if (deltaX > 0 && activeTab === 'seller') {
          // Swipe right -> go to Listings
          handleTabPress('listings');
        }
      }
    },
    [activeTab, handleTabPress, handleClose],
  );

  // Suggestion selection from pre-search suggestions list
  const handleSelectSuggestion = useCallback(
    (term: string) => {
      haptic();
      setQuery(term);
      addSearch(term);
      setHasSubmitted(true);
      Keyboard.dismiss();
    },
    [addSearch],
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

  // Tag selection from Previous searches / Popular searches with tab routing
  const handleSelectTag = useCallback(
    (term: string, targetTab?: SearchTab) => {
      haptic();
      setQuery(term);
      const tabToUse = targetTab ?? activeTab;
      addSearch(term, tabToUse);
      if (tabToUse !== activeTab) {
        handleTabPress(tabToUse);
      }
      setHasSubmitted(true);
      Keyboard.dismiss();
    },
    [activeTab, handleTabPress, addSearch],
  );

  const handleSubmitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      addSearch(trimmed, activeTab);
      setHasSubmitted(true);
      Keyboard.dismiss();
    }
  }, [query, activeTab, addSearch]);

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
          {/* Avatar: Square box with surface background and bold initial */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              backgroundColor: isDark ? theme.surface : theme.panel,
              borderWidth: 1,
              borderColor: theme.border,
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
                  color: theme.text,
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
        <BinocularsIcon width={52} height={46} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 15.5,
              fontWeight: '700',
              fontFamily: typography.family.sansBold,
              color: theme.text,
              letterSpacing: -0.2,
            }}
          >
            Save your searches
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: typography.family.sansMedium,
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
      {historyItems.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              fontFamily: typography.family.sansBold,
              color: theme.text,
              marginBottom: 12,
            }}
          >
            Previous searches
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {historyItems.map((item) => (
              <Pressable
                key={item.term}
                onPress={() => handleSelectTag(item.term, item.tab)}
                style={({ pressed }) => ({
                  height: 28,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isDark ? theme.surface : theme.panel,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  paddingLeft: 12,
                  paddingRight: 8,
                  gap: 6,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '500',
                    fontFamily: typography.family.sansMedium,
                    color: theme.text,
                  }}
                >
                  {item.term}
                </Text>

                {item.tab === 'seller' && (
                  <View
                    style={{
                      backgroundColor: isDark ? 'rgba(108, 71, 255, 0.18)' : '#EDE9FE',
                      borderRadius: radii.pill,
                      paddingHorizontal: 6,
                      paddingVertical: 1.5,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        fontFamily: typography.family.sansBold,
                        color: theme.purple,
                      }}
                    >
                      Member
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    haptic();
                    removeSearch(item.term);
                  }}
                  hitSlop={10}
                  accessibilityLabel={`Remove ${item.term}`}
                  style={({ pressed }) => ({
                    padding: 3,
                    opacity: pressed ? 0.5 : 1,
                  })}
                >
                  <Feather name="x" size={13} color={theme.mute} />
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
            fontFamily: typography.family.sansBold,
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
              onPress={() => handleSelectTag(term, 'listings')}
              style={({ pressed }) => ({
                height: 28,
                backgroundColor: isDark ? theme.surface : theme.panel,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '500',
                  fontFamily: typography.family.sansMedium,
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

  // ── Render Idle Landing Content for Members Tab ────────────────────────────
  const memberSearches = useMemo(
    () => historyItems.filter((i) => i.tab === 'seller'),
    [historyItems],
  );

  const renderMembersIdleLanding = (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
    >
      {/* Search Members Banner Card */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radii.lg,
          paddingVertical: 14,
          paddingHorizontal: 14,
          backgroundColor: isDark ? theme.surface : theme.panel,
          gap: 14,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radii.md,
            backgroundColor: isDark ? 'rgba(108, 71, 255, 0.16)' : '#EDE9FE',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="users" size={22} color={theme.purple} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 15.5,
              fontWeight: '700',
              fontFamily: typography.family.sansBold,
              color: theme.text,
              letterSpacing: -0.2,
            }}
          >
            Find members & sellers
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: typography.family.sansMedium,
              color: theme.mute,
              marginTop: 2,
            }}
          >
            Search by username or name to see their wardrobe
          </Text>
        </View>
      </View>

      {/* Previous member searches */}
      {memberSearches.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              fontFamily: typography.family.sansBold,
              color: theme.text,
              marginBottom: 12,
            }}
          >
            Previous member searches
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {memberSearches.map((item) => (
              <Pressable
                key={item.term}
                onPress={() => handleSelectTag(item.term, 'seller')}
                style={({ pressed }) => ({
                  height: 28,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isDark ? theme.surface : theme.panel,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  paddingLeft: 12,
                  paddingRight: 8,
                  gap: 6,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '500',
                    fontFamily: typography.family.sansMedium,
                    color: theme.text,
                  }}
                >
                  @{item.term}
                </Text>

                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    haptic();
                    removeSearch(item.term);
                  }}
                  hitSlop={10}
                  accessibilityLabel={`Remove ${item.term}`}
                  style={({ pressed }) => ({
                    padding: 3,
                    opacity: pressed ? 0.5 : 1,
                  })}
                >
                  <Feather name="x" size={13} color={theme.mute} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Suggested sellers Section */}
      <View style={{ marginTop: 24 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            fontFamily: typography.family.sansBold,
            color: theme.text,
            marginBottom: 12,
          }}
        >
          Suggested sellers
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['carrinex', 'vintage_vault', 'daniel_store', 'sneakerhead', 'streetwear'].map((seller) => (
            <Pressable
              key={seller}
              onPress={() => handleSelectTag(seller, 'seller')}
              style={({ pressed }) => ({
                height: 28,
                backgroundColor: isDark ? theme.surface : theme.panel,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: '500',
                  fontFamily: typography.family.sansMedium,
                  color: theme.text,
                }}
              >
                @{seller}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          backgroundColor: theme.background,
          shadowColor: '#000',
          shadowOffset: { width: -3, height: 0 },
          shadowOpacity: isDark ? 0.35 : 0.1,
          shadowRadius: 10,
          elevation: 12,
        },
        rootAnimatedStyle,
      ]}
      onTouchStart={Platform.OS === 'web' ? handleTouchStart : undefined}
      onTouchEnd={Platform.OS === 'web' ? handleTouchEnd : undefined}
    >
      {/* ── Top Header Row (Plick layout: [<] [ 🔍 Search ... (x) ] [ ⭐ ] ) ─── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 8,
          gap: 10,
          borderBottomWidth: 0,
        }}
      >
        {/* Back Button '<' (Exact same as Plick) */}
        <Pressable
          onPress={handleClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => ({
            width: 36,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Feather
            name="chevron-left"
            size={28}
            color={theme.text}
          />
        </Pressable>

        {/* Search Input Box */}
        <Animated.View
          style={[
            {
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.panel,
              borderRadius: radii.pill,
              paddingLeft: 14,
              paddingRight: 10,
              height: 44,
              borderWidth: 1,
              borderColor: theme.border,
            },
            searchBarAnimatedStyle,
          ]}
        >
          <Feather
            name="search"
            size={16}
            color={theme.mute}
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
            placeholderTextColor={theme.mute}
            autoFocus={Platform.OS === 'web'}
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
                color: theme.text,
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
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: isDark ? theme.surface : 'rgba(0,0,0,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 2,
              }}
            >
              <Feather name="x" size={13} color={theme.mute} />
            </Pressable>
          )}
        </Animated.View>

        {/* Save Your Search Star Button on Right */}
        <Pressable
          onPress={handleToggleSaveSearch}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? "Saved search active" : "Save this search"}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: isSaved
              ? (isDark ? 'rgba(245, 158, 11, 0.22)' : '#FEF3C7')
              : (isDark ? theme.panel : theme.surface),
            borderWidth: 1,
            borderColor: isSaved
              ? (isDark ? 'rgba(245, 158, 11, 0.5)' : '#FDE68A')
              : theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.75 : 1,
            transform: [{ scale: pressed ? 0.92 : 1 }],
            shadowColor: isSaved ? '#F59E0B' : '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isSaved ? 0.35 : 0.05,
            shadowRadius: 6,
            elevation: isSaved ? 3 : 1,
          })}
        >
          <Ionicons
            name={isSaved ? "star" : "star-outline"}
            size={21}
            color={isSaved ? "#F59E0B" : (isDark ? "#9CA3AF" : "#6B7280")}
          />
        </Pressable>
      </View>

        {/* ── Tab Switcher ('Items' & 'Members') - Hidden in results ─────────── */}
        {!hasSubmitted && !hasQuery && (
          <View
            style={{
              flexDirection: 'row',
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
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
                  fontSize: 16,
                  fontWeight: activeTab === 'listings' ? '700' : '500',
                  fontFamily:
                    activeTab === 'listings'
                      ? typography.family.sansBold
                      : typography.family.sansMedium,
                  color: activeTab === 'listings' ? theme.text : theme.mute,
                  letterSpacing: -0.2,
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
                  fontSize: 16,
                  fontWeight: activeTab === 'seller' ? '700' : '500',
                  fontFamily:
                    activeTab === 'seller'
                      ? typography.family.sansBold
                      : typography.family.sansMedium,
                  color: activeTab === 'seller' ? theme.text : theme.mute,
                  letterSpacing: -0.2,
                }}
              >
                Members
              </Text>
            </Pressable>

            {/* ── Continuous Sliding Underline Indicator (Ceranix Accent) ─ */}
            <RNAnimated.View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: tabWidth,
                height: 3,
                transform: [{ translateX: indicatorTranslateX }],
              }}
            >
              <View
                style={{
                  width: '100%',
                  height: 3,
                  backgroundColor: theme.purple,
                  borderRadius: 0,
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
          scrollEnabled={!hasSubmitted && !hasQuery}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: activeTab === 'listings' ? 0 : screenWidth, y: 0 }}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          style={[
            { flex: 1 },
            Platform.OS === 'web' && ({
              scrollSnapType: !hasSubmitted && !hasQuery ? 'x mandatory' : 'none',
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
                query={query}
                suggestions={suggestions}
                onSelect={handleSelectSuggestion}
                onPopulate={handlePopulateSuggestion}
              />
            ) : loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.purple} />
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
              renderMembersIdleLanding
            ) : loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.purple} />
              </View>
            ) : sellerResults.length > 0 ? (
              <FlatList
                data={sellerResults}
                keyExtractor={(item) => item.id}
                renderItem={renderSellerItem}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 40 }}
                ListHeaderComponent={
                  hasQuery ? (
                    <View
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '600',
                          color: theme.text,
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
  );
});
