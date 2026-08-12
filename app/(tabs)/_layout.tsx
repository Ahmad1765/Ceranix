import { Tabs } from 'expo-router';
import { AnimatedTabBar } from '../../components/AnimatedTabBar';
import { useSellSheet } from '@/components/sell/SellSheet';
import { useDiscoverSheet } from '@/components/discover/DiscoverSheet';

export default function TabsLayout() {
  const { open: openSellSheet } = useSellSheet();
  const { open: openDiscoverSheet } = useDiscoverSheet();

  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      // freezeOnBlur: a blurred tab stops re-rendering entirely. Chat holds a
      // realtime inbox subscription and every screen holds React Query
      // subscriptions, so without this a cache write re-renders four off-screen
      // trees while the visible one is scrolling. Native-only — the web build
      // of react-native-screens just toggles `display: none` and ignores it.
      screenOptions={{ headerShown: false, freezeOnBlur: true }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      {/* Like the Sell tab below, Discover never switches to its flat tab
          content on press — it slides the search sheet up over whatever
          screen is active (components/discover/DiscoverSheet.tsx). Picking
          anything in the sheet is what navigates here, carrying the intent as
          params. app/(tabs)/discover.tsx stays the real screen behind it. */}
      <Tabs.Screen
        name="discover"
        options={{ title: 'Discover' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openDiscoverSheet();
          },
        }}
      />
      {/* Wardrobe tab hidden 2026-07-04. Route file app/(tabs)/wardrobe.tsx is untouched.
          To restore: swap options back to { title: 'Wardrobe' }. */}
      <Tabs.Screen name="wardrobe" options={{ href: null }} />
      {/* The Sell tab stays a real Tabs.Screen so it keeps its slot/icon in
          AnimatedTabBar, but tapping it never switches to the flat tab
          content — it opens the sell form as a Modal on top of whatever
          screen is active (components/sell/SellSheet.tsx), the same way the
          product page's "Offer" button opens OfferSheet. The tab's own
          content (app/(tabs)/upload.tsx) is just a fallback for paths that
          bypass this listener (deep link, back/forward). */}
      <Tabs.Screen
        name="upload"
        options={{ title: 'Sell' }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openSellSheet();
          },
        }}
      />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'My profile' }} />
    </Tabs>
  );
}
