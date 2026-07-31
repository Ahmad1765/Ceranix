// ⚠️ TEMPORARY DUMMY — NOT the real sheet, NOT Ceranix content. Delete freely.
//
// A direct port of the supplied HTML/CSS mock (Browse Markets sheet). Every
// number and hex below is lifted from that stylesheet rather than re-derived,
// so the two stay comparable: .sheet → the root View, .handle → the grabber,
// .search / h5 / .chip / .topic / .emoji → the pieces at the bottom of the
// file, in that order. CSS `:hover` becomes RN's pressed state.
//
// Nothing here reads from the app — no queries, no router, no taxonomy.
//
// Revert: flip `DUMMY_SKIN` to false in components/discover/DiscoverSheet.tsx,
// or delete the three "DUMMY SKIN" lines there plus this file. The real
// DiscoverSheetBody is untouched.

import { useRef, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Platform,
  useWindowDimensions,
  Text as RNText,
} from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import * as Font from 'expo-font';
import { captureError } from '@/lib/sentry';
import { withFontDisplay } from '@/lib/fonts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type as type_ } from '@/lib/theme';
import { useSheetSearchFocus } from './useSheetSearchFocus';

// FontAwesome6 is the one icon family in the app that app/_layout.tsx does not
// preload, because this throwaway skin is its only consumer.
//
// That mattered: @expo/vector-icons loads an unregistered family lazily from an
// `async componentDidMount` with no try/catch (see
// node_modules/@expo/vector-icons/build/createIconSet.js). On web that load
// races FontFaceObserver's fixed 6000ms deadline, so a slow fetch — cold Metro,
// throttled connection — failed twice over: the rejection escaped as an
// *uncaught* "6000ms timeout exceeded", and since `setState({ fontIsLoaded:
// true })` never ran, the glyphs stayed an empty <Text> even after the file
// landed.
//
// Font.loadAsync injects the @font-face rule synchronously before it returns
// its promise (expo-font's loadSingleFontAsync is deliberately not `async`), so
// calling this at the moment the sheet is opened is enough: by the time React
// renders the icons a tick later, Font.isLoaded() is true and the lazy path is
// never taken. Doing it here rather than at boot keeps ~480 KB of TTF off
// startup for everyone who never opens Discover.
//
// Brands is excluded — this skin only uses solid/regular glyphs, and
// FontAwesome6_Brands.ttf is another 204 KB for nothing.
//
// No "already registered" flag on purpose: expo-font already dedupes. Font.js's
// loadFontInNamespaceAsync bails on `isLoaded(fontFamily)` and otherwise shares
// the in-flight entry in `loadPromises`, so repeat opens cost one map lookup.
// A local flag would only add a failure mode — a first attempt that rejected
// could never be retried.
//
// The catch is mandatory, not cosmetic: expo-font's docs say to wrap loadAsync
// "to ensure the app continues if the font fails to load", and without it this
// is the very unhandled rejection described above. It reports through
// captureError rather than console.warn because @sentry/react-native tracks
// unhandled rejections automatically (including on react-native-web, since
// 6.15.0) — so a bare catch here would not just fix the crash, it would delete a
// signal Sentry was already sending us. At most one event per session: once the
// @font-face rule exists, isLoaded() is true and later calls no-op.
// FontDisplay.BLOCK is load-bearing, not decorative. Registering the family
// here is what makes @expo/vector-icons consider it loaded, so its icons now
// mount rendering the real glyph immediately instead of an empty <Text> — which
// means that without a display hint they paint as tofu boxes for as long as the
// TTF is in flight. BLOCK keeps them invisible until it lands, so the trade is
// "blank then icon" (as before) rather than "box then icon". See lib/fonts.ts.
export function registerDummySkinFont() {
  const fonts = withFontDisplay(
    Object.fromEntries(
      Object.entries(FontAwesome6.font as Record<string, Font.FontSource>).filter(
        ([family]) => !family.includes('Brands'),
      ),
    ),
    Font.FontDisplay.BLOCK,
  );
  Font.loadAsync(fonts).catch((e) => captureError(e, { fn: 'discoverSheet.dummySkinFont' }));
}

// ── Tokens, straight from the stylesheet ────────────────────────────────────
const CSS = {
  sheetRadius: 22, // border-radius: 22px 22px 0 0
  padX: 18, // padding: 16px 18px 30px
  padTop: 16,
  padBottom: 30,

  handleW: 70,
  handleH: 5,
  handleColor: '#ececec',
  handleGap: 20, // margin: 0 auto 20px

  searchH: 46,
  searchBg: '#f3f5f8',
  searchRadius: 12,
  searchPadX: 16,
  searchGap: 18, // margin-bottom
  searchIcon: 18,
  searchIconColor: '#8c96a5',
  searchIconGap: 12, // margin-right
  searchText: 17,
  searchTextColor: '#444444',
  searchPlaceholder: '#8d95a2',

  h5Size: 12,
  h5Color: '#98a0ab',
  h5Track: 0.72, // letter-spacing: .06em at 12px
  h5Gap: 12, // margin-bottom

  chipGap: 7,
  chipsGap: 26, // .chips margin-bottom
  chipPadY: 10,
  chipPadX: 14,
  chipRadius: 13,
  chipBorder: '#e2e6ec',
  chipText: 16,
  chipTextColor: '#2b2f36',
  chipIconColor: '#5f6673',
  chipPress: '#f7f7f7', // .chip:hover

  topicGap: 12,
  topicPadY: 10,
  topicPadX: 12,
  topicRadius: 14,
  topicBorder: '#e4e7ec',
  topicText: 16,
  topicTextColor: '#2f3338',
  topicPress: '#fafafa', // .topic:hover

  emojiSize: 34,
  emojiRadius: 10,
  emojiBg: '#f2f4f6',
  emojiFont: 20,
} as const;

// FontAwesome 6 Free ships `droplet` in solid only — `fa-regular fa-droplet`
// is a Pro glyph, so it renders as nothing on the free build the mock loads.
// Solid here, so the chip actually draws.
const CHIPS = [
  { id: 'new', label: 'New', icon: 'star', solid: false },
  { id: 'trending', label: 'Trending', icon: 'arrow-trend-up', solid: true },
  { id: 'popular', label: 'Popular', icon: 'fire', solid: true },
  { id: 'liquid', label: 'Liquid', icon: 'droplet', solid: true },
  { id: 'ending', label: 'Ending Soon', icon: 'clock', solid: false },
  { id: 'competitive', label: 'Competitive', icon: 'layer-group', solid: true },
] as const;

const TOPICS = [
  { id: 'live-crypto', emoji: '📈', label: 'Live Crypto' },
  { id: 'politics', emoji: '🏛️', label: 'Politics' },
  { id: 'middle-east', emoji: '🇵🇸', label: 'Middle East' },
  { id: 'crypto', emoji: '₿', label: 'Crypto' },
  { id: 'sports', emoji: '🏀', label: 'Sports' },
  { id: 'pop-culture', emoji: '🎙️', label: 'Pop Culture' },
  { id: 'tech', emoji: '🌌', label: 'Tech' },
  { id: 'ai', emoji: '🤖', label: 'AI' },
] as const;

// ── Body ────────────────────────────────────────────────────────────────────
export function DummySheetBody(_props: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');

  // Opening the sheet is an intent to search — bring the keyboard with it.
  const searchRef = useRef<TextInput>(null);
  useSheetSearchFocus(searchRef);

  // `grid-template-columns: repeat(2, 1fr)` with a 12px gap. Computed in px
  // rather than '48%' — a percentage width in a flex-wrap row with `gap`
  // resolves too narrow on native and packs three per row.
  const topicWidth = (winWidth - CSS.padX * 2 - CSS.topicGap) / 2;

  // .sheet's own chrome — white fill, the 22px top radius, `padding-top: 16px`
  // and .handle — is drawn by SheetShell in DiscoverSheet.tsx instead, because
  // the handle is also the drag-to-dismiss surface. The tokens for it are
  // mirrored there as DUMMY_SKIN_HANDLE; CSS.sheetRadius/padTop/handle* below
  // stay as the record of where those numbers came from.
  return (
    <View style={{ flex: 1, paddingHorizontal: CSS.padX }}>
      {/* .search */}
      <View
        style={{
          height: CSS.searchH,
          backgroundColor: CSS.searchBg,
          borderRadius: CSS.searchRadius,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: CSS.searchPadX,
          marginBottom: CSS.searchGap,
        }}
      >
        <FontAwesome6
          name="magnifying-glass"
          solid
          size={CSS.searchIcon}
          color={CSS.searchIconColor}
          style={{ marginRight: CSS.searchIconGap }}
        />
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search polymarkets..."
          placeholderTextColor={CSS.searchPlaceholder}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search polymarkets"
          style={[
            {
              flex: 1,
              fontSize: CSS.searchText,
              fontFamily: type_.family.sans,
              color: CSS.searchTextColor,
              padding: 0,
            },
            Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as any) : null,
          ]}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: CSS.padBottom + insets.bottom }}
      >
        <SectionTitle>BROWSE</SectionTitle>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: CSS.chipGap,
            marginBottom: CSS.chipsGap,
          }}
        >
          {CHIPS.map((c) => (
            <Chip key={c.id} label={c.label} icon={c.icon} solid={c.solid} />
          ))}
        </View>

        <SectionTitle>TOPICS</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CSS.topicGap }}>
          {TOPICS.map((t) => (
            <Topic key={t.id} emoji={t.emoji} label={t.label} width={topicWidth} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────
// h5
function SectionTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: CSS.h5Size,
        fontFamily: type_.family.sansBold, // font-weight: 700
        color: CSS.h5Color,
        letterSpacing: CSS.h5Track,
        marginBottom: CSS.h5Gap,
      }}
    >
      {children}
    </Text>
  );
}

// .chip — inert: the labels are the mock's, not Ceranix's, so a tap has
// nowhere honest to go. Press feedback only.
function Chip({ label, icon, solid }: { label: string; icon: string; solid: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: CSS.chipPadY,
        paddingHorizontal: CSS.chipPadX,
        backgroundColor: pressed ? CSS.chipPress : '#ffffff',
        borderWidth: 1,
        borderColor: CSS.chipBorder,
        borderRadius: CSS.chipRadius,
      })}
    >
      <FontAwesome6
        name={icon as any}
        solid={solid}
        size={CSS.chipText}
        color={CSS.chipIconColor}
      />
      <Text
        style={{
          fontSize: CSS.chipText,
          fontFamily: type_.family.sansMedium, // font-weight: 500
          color: CSS.chipTextColor,
          // Pinned to the browser's `line-height: normal` for Inter 16 (19px).
          // RN's default runs ~2px looser, which made every chip row 2px taller
          // than the mock and pushed the whole Topics grid down 6px.
          lineHeight: 19,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// .topic
function Topic({ emoji, label, width }: { emoji: string; label: string; width: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: CSS.topicBorder,
        borderRadius: CSS.topicRadius,
        paddingVertical: CSS.topicPadY,
        paddingHorizontal: CSS.topicPadX,
        backgroundColor: pressed ? CSS.topicPress : '#ffffff',
      })}
    >
      {/* .emoji */}
      <View
        style={{
          width: CSS.emojiSize,
          height: CSS.emojiSize,
          borderRadius: CSS.emojiRadius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: CSS.emojiBg,
        }}
      >
        {/* Plain RN Text on purpose — @/lib/rnText forces Inter, which has no
            emoji coverage; without a family the platform emoji font is used. */}
        <RNText style={{ fontSize: CSS.emojiFont }}>{emoji}</RNText>
      </View>
      <Text
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: CSS.topicText,
          fontFamily: type_.family.sansMedium, // font-weight: 500
          color: CSS.topicTextColor,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
