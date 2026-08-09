// Product-page action bar — Plick/Vinted-simple: two buttons, no icons, no
// trust line (Buyer Protection is already stated up at the price).
//
// Tapping "Offer" expands the pill rightward across the bar into an inline
// amount field instead of opening a modal sheet. The previous bar — small
// outlined Offer button + OfferSheet modal — is preserved verbatim in
// ProductActionBar.legacy.tsx; see the header there for how to back out.
//
// Layout is absolute rather than flex because the Offer pill animates its own
// width. Flex children can't be driven off a shared value on the UI thread.
// Width is not a GPU-friendly property, but this is one 52px row with two
// children, so the per-frame layout cost is negligible — and the alternative
// (scaleX) would distort the label and the field.

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Keyboard, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '@/lib/rnText';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import Feather from '@expo/vector-icons/Feather';
import { IS_IOS, HAIRLINE, tap, BRAND_INK, BRAND_PURPLE } from './shared';
import { formatPrice, CURRENCY_SYMBOL } from '@/lib/currency';

const BAR_PAD = 16;
const H = 56;
const GAP = 12;
// Offer sits a touch wider than Buy now — the two balanced pills from the
// reference. Both scale with the screen so the split holds on every width.
const OFFER_RATIO = 0.52;

// Strong ease-out. The stock curves are too weak to read as deliberate, and
// ease-in would delay the first few frames — exactly where the eye is. A spring
// is wrong here specifically because underdamped overshoot would push the
// pill's animated width past the bar and clip it.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EXPAND_MS = 240;
const COLLAPSE_MS = 180;

export function ProductActionBar({
  price,
  buyTotal,
  bottomInset,
  onOfferOpen,
  onSubmitOffer,
  onBuyPress,
}: {
  price: number;
  buyTotal: number;
  bottomInset: number;
  /** Runs the auth / own-listing gates. Return false to refuse the expand. */
  onOfferOpen: () => boolean;
  onSubmitOffer: (amount: number) => void;
  onBuyPress: () => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const innerW = screenW - BAR_PAD * 2;
  const offerW = Math.round((innerW - GAP) * OFFER_RATIO);
  const buyW = innerW - offerW - GAP;

  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState('');
  const inputRef = useRef<TextInput>(null);

  // 0 = collapsed, 1 = expanded. Drives every animated style below.
  const t = useSharedValue(0);
  // How far the keyboard pushes the bar up. The bar is absolutely positioned,
  // so nothing lifts it for free — without this the offer field opens behind
  // the keyboard.
  const kb = useSharedValue(0);

  useEffect(() => {
    // willShow/willHide fire before the keyframe on iOS, so the bar travels
    // with the keyboard instead of chasing it. Android only has did*.
    const showEvt = IS_IOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = IS_IOS ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt as any, (e: any) => {
      // The keyboard already covers the home indicator, so discount the inset
      // we're padding with — otherwise the bar floats above the keys.
      const h = Math.max(0, (e?.endCoordinates?.height ?? 0) - (bottomInset || 0));
      kb.value = withTiming(h, { duration: e?.duration || 250, easing: EASE_OUT });
    });
    const hide = Keyboard.addListener(hideEvt as any, (e: any) => {
      kb.value = withTiming(0, { duration: e?.duration || 200, easing: EASE_OUT });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [kb, bottomInset]);

  const parsed = useMemo(() => {
    const n = parseFloat(amount.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }, [amount]);
  const valid = parsed > 0;

  const open = () => {
    // Gate first — don't fire a haptic for an action we're about to refuse.
    if (!onOfferOpen()) return;
    tap('medium');
    setExpanded(true);
    t.value = withTiming(1, { duration: EXPAND_MS, easing: EASE_OUT });
    // Focus once the expand is under way, so the keyboard rises with the field
    // rather than ahead of it.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const close = () => {
    Keyboard.dismiss();
    setExpanded(false);
    setAmount('');
    // Exit is quicker than entry: the user has already decided.
    t.value = withTiming(0, { duration: COLLAPSE_MS, easing: EASE_OUT });
  };

  const submit = () => {
    if (!valid) return;
    tap('medium');
    // Whole units — matches what the sheet sent and what the seller expects.
    const rounded = Math.max(1, Math.round(parsed));
    close();
    onSubmitOffer(rounded);
  };

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -kb.value }],
  }));

  const offerStyle = useAnimatedStyle(() => ({
    width: interpolate(t.value, [0, 1], [offerW, innerW]),
  }));

  // Buy fades and drifts right as the offer pill grows over it, so the two
  // never look like they're fighting for the same pixels.
  const buyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.45], [1, 0], 'clamp'),
    transform: [{ translateX: interpolate(t.value, [0, 1], [0, 28]) }],
  }));

  // Label out, then field in — sequential rather than overlapping, so you never
  // see two sets of content occupying the same pill.
  const collapsedLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.3], [1, 0], 'clamp'),
  }));

  const fieldStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.45, 1], [0, 1], 'clamp'),
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderTopWidth: HAIRLINE,
          borderTopColor: 'rgba(15,15,15,0.08)',
          paddingHorizontal: BAR_PAD,
          paddingTop: 12,
          paddingBottom: bottomInset || 16,
          boxShadow: '0px -4px 10px rgba(0,0,0,0.05)',
        },
        barStyle,
      ]}
    >
      <View style={{ height: H, width: innerW }}>
        {/* Buy now — sits underneath the offer pill, which grows over it.
            pointerEvents blocks touch but not screen readers, so the hidden
            layers are pulled out of the a11y tree too. `aria-hidden` is the
            cross-platform prop: it maps to accessibilityElementsHidden on iOS
            and importantForAccessibility on Android, and — unlike either of
            those — actually reaches the DOM on react-native-web. */}
        <Animated.View
          pointerEvents={expanded ? 'none' : 'auto'}
          aria-hidden={expanded}
          style={[
            { position: 'absolute', right: 0, top: 0, height: H, width: buyW },
            buyStyle,
          ]}
        >
          <Pressable
            onPress={onBuyPress}
            accessibilityRole="button"
            accessibilityLabel={`Buy now for ${formatPrice(buyTotal)}, Buyer Protection included`}
            accessibilityHint="Proceeds to secure checkout"
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: BRAND_INK,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Text
              style={{
                fontSize: 16,
                fontFamily: 'Inter_700Bold',
                color: 'white',
                letterSpacing: 0.2,
              }}
              numberOfLines={1}
            >
              Buy now
            </Text>
          </Pressable>
        </Animated.View>

        {/* Offer pill — collapsed button and expanded field share one surface,
            crossfading as the width animates. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              height: H,
              borderRadius: 14,
              // Solid purple outline, per the reference's outlined-accent pill.
              borderWidth: 1.5,
              borderColor: BRAND_PURPLE,
              backgroundColor: 'white',
              overflow: 'hidden',
            },
            offerStyle,
          ]}
        >
          {/* Collapsed: the whole pill is the button. */}
          <Animated.View
            pointerEvents={expanded ? 'none' : 'auto'}
            aria-hidden={expanded}
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: offerW,
                height: H,
              },
              collapsedLabelStyle,
            ]}
          >
            <Pressable
              onPress={open}
              accessibilityRole="button"
              accessibilityLabel="Make an offer"
              accessibilityHint="Expands a field to enter your price"
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                // A wash rather than a scale: the pill is mid-expand on press,
                // and a competing transform would fight that.
                backgroundColor: pressed ? 'rgba(15,15,15,0.04)' : 'transparent',
              })}
            >
              <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: BRAND_PURPLE }}>
                Make an offer
              </Text>
            </Pressable>
          </Animated.View>

          {/* Expanded: close · currency · amount · send */}
          <Animated.View
            pointerEvents={expanded ? 'auto' : 'none'}
            aria-hidden={!expanded}
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: innerW,
                height: H,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 4,
                paddingRight: 5,
              },
              fieldStyle,
            ]}
          >
            <Pressable
              onPress={() => {
                tap('selection');
                close();
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel offer"
              hitSlop={6}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <Feather name="x" size={18} color="rgba(15,15,15,0.55)" />
            </Pressable>

            {/* 0.62 is the page's muted token and clears AA at ~5.4:1; the
                lighter 0.45 used elsewhere for decorative text would not, and
                this glyph carries meaning. */}
            <Text
              style={{
                fontSize: 15,
                fontFamily: 'Inter_600SemiBold',
                color: 'rgba(15,15,15,0.62)',
                marginRight: 4,
              }}
            >
              {CURRENCY_SYMBOL}
            </Text>

            <TextInput
              ref={inputRef}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
              editable={expanded}
              keyboardType="number-pad"
              returnKeyType="send"
              onSubmitEditing={submit}
              placeholder={String(Math.max(1, Math.round(price)))}
              placeholderTextColor="rgba(15,15,15,0.28)"
              maxLength={7}
              accessibilityLabel="Offer amount"
              style={{
                flex: 1,
                fontSize: 18,
                fontFamily: 'Inter_700Bold',
                color: BRAND_INK,
                padding: 0,
              }}
            />

            <Pressable
              onPress={submit}
              disabled={!valid}
              accessibilityRole="button"
              accessibilityLabel="Send offer"
              accessibilityState={{ disabled: !valid }}
              // 42px keeps the button from crowding the field; hitSlop takes
              // the actual target past the 44px minimum.
              hitSlop={6}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 11,
                backgroundColor: BRAND_PURPLE,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !valid ? 0.3 : pressed ? 0.85 : 1,
                transform: [{ scale: pressed && valid ? 0.95 : 1 }],
              })}
            >
              <Feather name="arrow-right" size={19} color="white" />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
