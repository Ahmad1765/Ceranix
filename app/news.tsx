import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  Animated,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { Text } from '@/lib/rnText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { safeBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { useActivityUnreadCount } from '@/lib/queries';
import {
  NewsUnderlineTabs,
  NEWS_TABS,
  type NewsTab,
  FollowingTab,
  ForYouTab,
  SearchesTab,
} from '@/components/news';

export default function NewsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width: pageWidth } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<NewsTab>('following');
  const [pagerHeight, setPagerHeight] = useState(0);

  const unreadMatches = useActivityUnreadCount(user?.id ?? null);
  const tabBadges = useMemo(() => ({ searches: unreadMatches }), [unreadMatches]);

  const pagerRef = useRef<FlatList<{ value: NewsTab; label: string }>>(null);
  const [scrollX] = useState(() => new Animated.Value(0));
  const activeTabRef = useRef<NewsTab>(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const ignoreListenerUntilRef = useRef(0);

  useEffect(() => {
    if (pageWidth <= 0) return;
    const id = scrollX.addListener(({ value }) => {
      if (Date.now() < ignoreListenerUntilRef.current) return;
      const nextIndex = Math.round(value / pageWidth);
      const next = NEWS_TABS[nextIndex]?.value;
      if (next && next !== activeTabRef.current) {
        activeTabRef.current = next;
        setActiveTab(next);
      }
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, pageWidth]);

  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerHeight(e.nativeEvent.layout.height);
  }, []);

  const goToTab = useCallback(
    (tab: NewsTab) => {
      const to = NEWS_TABS.findIndex((t) => t.value === tab);
      if (to < 0 || pageWidth <= 0) return;
      if (tab === activeTabRef.current) return;
      activeTabRef.current = tab;
      setActiveTab(tab);
      ignoreListenerUntilRef.current = Date.now() + 450;
      pagerRef.current?.scrollToOffset({ offset: to * pageWidth, animated: true });
    },
    [pageWidth],
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      ignoreListenerUntilRef.current = 0;
      if (pageWidth <= 0) return;
      const index = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
      const next = NEWS_TABS[index]?.value;
      if (next && next !== activeTabRef.current) {
        activeTabRef.current = next;
        setActiveTab(next);
      }
    },
    [pageWidth],
  );

  const renderPage = useCallback(
    ({ item }: { item: { value: NewsTab } }) => {
      const bottomInset = Math.max(insets.bottom, 16) + 16;
      return (
        <View style={{ width: pageWidth, height: pagerHeight > 0 ? pagerHeight : '100%' }}>
          {item.value === 'following' && <FollowingTab bottomInset={bottomInset} />}
          {item.value === 'for_you' && <ForYouTab bottomInset={bottomInset} />}
          {item.value === 'searches' && <SearchesTab bottomInset={bottomInset} />}
        </View>
      );
    },
    [pageWidth, pagerHeight, insets.bottom],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top Header Bar matching reference */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingTop: 6,
          paddingBottom: 8,
          backgroundColor: theme.background,
        }}
      >
        <Pressable
          onPress={() => safeBack()}
          hitSlop={HIT_SLOP_8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </Pressable>

        <Text
          style={{
            fontSize: 17,
            fontWeight: '800',
            color: theme.ink,
            letterSpacing: -0.2,
          }}
        >
          News
        </Text>

        {/* Spacer to keep title centered */}
        <View style={{ width: 38, height: 38 }} />
      </View>

      {/* Underline Tabs: Following | For you | Searches */}
      <NewsUnderlineTabs
        value={activeTab}
        onChange={goToTab}
        scrollX={scrollX}
        pageWidth={pageWidth}
        badges={tabBadges}
      />

      {/* Horizontal Page View */}
      <View style={{ flex: 1 }} onLayout={onPagerLayout}>
        {pageWidth > 0 && pagerHeight > 0 && (
          <FlatList
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={NEWS_TABS}
            keyExtractor={(item) => item.value}
            renderItem={renderPage}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
              useNativeDriver: false,
            })}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onMomentumScrollEnd}
            initialNumToRender={3}
            windowSize={3}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
