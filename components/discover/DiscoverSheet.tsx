// The Discover tab doesn't navigate — it opens this full-screen search sheet.
//
// Same primitive as SellSheet (`<Modal animationType="slide">`), so it slides
// up from the bottom over whatever screen is active and fills the screen. The
// layout mirrors the reference: grabber, one search field, a BROWSE chip row
// and a TOPICS grid (components/discover/SearchLanding.tsx renders the last
// two, shared with the Discover screen's own focus landing).
//
// Nothing here holds search state. Every tap closes the sheet and navigates to
// /discover with the intent encoded as params, which is what makes the sheet
// disposable: back always returns to where the user opened it from.
//
// ── Android parity ──
// Two Modal-on-Android gotchas are handled explicitly, because without them
// the native build does NOT match web:
//   1. `statusBarTranslucent` + `navigationBarTranslucent` — without these the
//      modal window stops at the system bars, so a "full screen" sheet renders
//      short and letterboxed on Android while looking correct on web.
//   2. A nested <SafeAreaProvider> — insets are measured relative to the
//      nearest provider's view, and the app-root provider is outside this
//      modal's window. Without a provider inside, useSafeAreaInsets() reports
//      zeros on Android and content slides under the status/gesture bars.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, Pressable, ScrollView, Modal, InteractionManager, Platform } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '@/lib/brand';
import { buildTopicCovers } from '@/lib/discover';
import { useFeedListingsQuery } from '@/lib/queries';
import { colors, radii, type } from '@/lib/theme';
import { HIT_SLOP_8 } from '@/lib/responsive';
import { SearchLanding, type BrowseAction, type TopicAction } from './SearchLanding';

// Every navigation out of the sheet carries a monotonic `n`. Without it,
// picking the same chip twice produces an identical URL, expo-router hands
// back identical params, and the Discover screen's params effect never
// re-runs — so re-picking a chip you'd since cleared would silently do
// nothing. The nonce makes each pick a distinct navigation.
let intentSeq = 0;
function withNonce(path: string) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}n=${++intentSeq}`;
}

// ── Context ─────────────────────────────────────────────────────────────────
type DiscoverSheetApi = { open: () => void };
const Ctx = createContext<DiscoverSheetApi | undefined>(undefined);

export function useDiscoverSheet(): DiscoverSheetApi {
  const ctx = useContext(Ctx);
  // Soft fallback outside the provider: fall back to the Discover screen.
  if (!ctx) return { open: () => router.push('/discover') };
  return ctx;
}

export function DiscoverSheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const api = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={close}
        statusBarTranslucent
        navigationBarTranslucent
      >
        {/* Insets are measured from the nearest provider's view; the app-root
            one lives outside this modal's window (see the Android note up
            top). Mounted only while open — the body runs a listings query for
            the Topics covers, and an always-mounted provider must not fetch. */}
        {visible ? (
          // initialMetrics seeds the first frame with the real device insets
          // instead of zeros, so the header doesn't jump once measurement
          // lands — the jump would otherwise happen mid slide-up.
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <DiscoverSheetBody onClose={close} />
          </SafeAreaProvider>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

function DiscoverSheetBody({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  // Hold the covers fetch until the slide-up has finished. RN's performance
  // guide is explicit that work competing with a transition is what makes it
  // stutter; the tiles render their taxonomy icon in the meantime and the
  // photos cross-fade in after. Usually a cache hit anyway — Discover's idle
  // grid uses this exact key — so the wait is invisible.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    // Backstop timer alongside the interaction handle: if any animation handle
    // leaks, runAfterInteractions never fires and the Topics tiles would sit
    // on their icons forever. Whichever resolves first wins.
    const task = InteractionManager.runAfterInteractions(() => setSettled(true));
    const timer = setTimeout(() => setSettled(true), 350);
    return () => {
      task.cancel();
      clearTimeout(timer);
    };
  }, []);

  const gridQ = useFeedListingsQuery({ tab: 'popular', limit: 60, enabled: settled });
  const covers = useMemo(() => buildTopicCovers(gridQ.data ?? []), [gridQ.data]);

  const go = useCallback(
    (path: string) => {
      onClose();
      router.push(withNonce(path) as any);
    },
    [onClose],
  );

  const submit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setQuery('');
    go(`/discover?q=${encodeURIComponent(q)}`);
  }, [query, go]);

  const onBrowse = useCallback(
    (action: BrowseAction) => {
      if (action.kind === 'saved') {
        onClose();
        router.push('/news' as any);
        return;
      }
      if (action.kind === 'tab') {
        go(`/discover?tab=${action.tab}`);
        return;
      }
      go(`/discover?sort=${action.sort}`);
    },
    [go, onClose],
  );

  const onTopic = useCallback(
    (action: TopicAction) => {
      go(action.kind === 'all' ? '/discover' : `/discover?category=${action.category}`);
    },
    [go],
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.white,
        borderTopLeftRadius: radii['3xl'],
        borderTopRightRadius: radii['3xl'],
        paddingTop: insets.top + 10,
      }}
    >
      {/* Grabber — kept as the sheet's identity even at full height. */}
      <View
        style={{
          alignSelf: 'center',
          width: 38,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.hairline,
          marginBottom: 14,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 10 }}>
        <View
          style={{
            flex: 1,
            height: 44,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.hair,
            backgroundColor: colors.panel,
          }}
        >
          <Feather name="search" size={18} color={colors.muteSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            placeholder={`Search ${BRAND}...`}
            placeholderTextColor={colors.muteSoft}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={`Search ${BRAND}`}
            style={[
              {
                flex: 1,
                marginLeft: 10,
                fontSize: 14.5,
                fontFamily: type.family.sans,
                color: colors.ink,
                padding: 0,
              },
              // Focus-ring removal is a DOM concern. Kept off native entirely
              // rather than cast through `any` — RN validates style keys, and
              // unknown ones warn on Android.
              Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null,
            ]}
          />
          {query.length > 0 ? (
            <Pressable hitSlop={HIT_SLOP_8} onPress={() => setQuery('')} accessibilityLabel="Clear search">
              <Feather name="x" size={16} color={colors.muteSoft} />
            </Pressable>
          ) : null}
        </View>
        {/* At full height there's no overlay left to tap, so the sheet owns an
            explicit way out (Android's back button also closes it). */}
        <Pressable hitSlop={HIT_SLOP_8} onPress={onClose} accessibilityRole="button">
          <Text style={{ fontSize: 14, fontFamily: type.family.sansBold, color: colors.purple }}>
            Cancel
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      >
        <SearchLanding covers={covers} onBrowse={onBrowse} onTopic={onTopic} />
      </ScrollView>
    </View>
  );
}
