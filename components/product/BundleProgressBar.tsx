import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import Svg, { Path } from 'react-native-svg';
import type { Listing } from '@/types';
import {
  BUNDLE_TIERS,
  computeBundlePricing,
  BRAND_PURPLE,
  HAIRLINE,
} from './shared';
import { useTheme } from '@/context/ThemeContext';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { type as typography } from '@/lib/theme';

function TagIcon({ size = 20, color = '#5356EE' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l9 9a2 2 0 0 0 2.828 0l7.172-7.172a2 2 0 0 0 0-2.828l-9-9zM7 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
        fill={color}
      />
    </Svg>
  );
}

export function BundleProgressBar({
  listing,
  sellerItems,
  selectedIds,
  onPress,
}: {
  listing: Listing;
  sellerItems: Listing[];
  selectedIds: Set<string>;
  onPress?: () => void;
}) {
  const { theme, isDark } = useTheme();
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const selectedItems = sellerItems.filter((s) => selectedIds.has(s.id));
  const { itemCount, pct, qualifies, progress, nextTier } = computeBundlePricing(
    listing.price,
    selectedItems.map((s) => Number(s.price ?? 0)),
  );
  const maxPct = BUNDLE_TIERS[BUNDLE_TIERS.length - 1].pct;
  const remaining = nextTier ? nextTier.count - itemCount : 0;

  const headline = qualifies
    ? `${pct}% bundle discount unlocked!`
    : `Bundle & save up to ${maxPct}%`;

  const guidance = nextTier
    ? `Add ${remaining} more ${remaining === 1 ? 'item' : 'items'} to save ${nextTier.pct}%`
    : qualifies
      ? 'Maximum discount reached for this order'
      : sellerItems.length > 0
        ? 'Select items below to unlock discounts'
        : `@${listing.seller.username} has 1 item listed`;

  const handleOpenInfo = () => {
    if (onPress) {
      onPress();
    } else {
      setInfoModalVisible(true);
    }
  };

  const trackBgColor = isDark ? 'rgba(255, 255, 255, 0.12)' : '#ECEEF2';
  const unreachedDotColor = isDark ? '#4B5563' : '#C7CAD6';

  return (
    <>
      <Pressable
        onPress={handleOpenInfo}
        accessibilityRole="button"
        accessibilityLabel={`${headline}. ${guidance}. Tap for bundle details.`}
        style={({ pressed }) => ({
          marginHorizontal: 16,
          backgroundColor: theme.panel,
          borderRadius: 18,
          borderWidth: HAIRLINE,
          borderColor: theme.border,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 14,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        {/* Top row: Icon + Texts + 3-Dot Icon */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Soft lavender/purple container with tilted purple tag */}
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: isDark ? 'rgba(83, 86, 238, 0.16)' : '#F2F3FE',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TagIcon size={22} color="#5356EE" />
          </View>

          {/* Headline & Guidance Subtitle */}
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
            <Text
              style={{
                fontSize: 15.5,
                fontFamily: typography.family.sansBold,
                color: theme.ink,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {headline}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: typography.family.sans,
                color: theme.mute,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {guidance}
            </Text>
          </View>

          {/* 3-Dot Icon replacing the downward arrow */}
          <Pressable
            onPress={handleOpenInfo}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Bundle discounts information"
            style={({ pressed }) => ({
              padding: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="more-horizontal" size={20} color={theme.mute} />
          </Pressable>
        </View>

        {/* Progress Bar Track with Milestone Step Dots */}
        <View
          style={{
            marginTop: 14,
            height: 6,
            borderRadius: 3,
            backgroundColor: trackBgColor,
            position: 'relative',
            justifyContent: 'center',
          }}
        >
          {/* Active Purple Progress Fill */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, Math.min(100, progress * 100))}%`,
              backgroundColor: '#5356EE',
              borderRadius: 3,
            }}
          />

          {/* Milestone Step Dots across the track */}
          {BUNDLE_TIERS.filter((t) => t.pct > 0).map((tier, index, arr) => {
            const reached = itemCount >= tier.count;
            // Position evenly across the progress bar track: 25%, 50%, 75%, 100%
            const positionPct = ((index + 1) / arr.length) * 100;

            return (
              <View
                key={tier.count}
                style={{
                  position: 'absolute',
                  left: `${positionPct}%`,
                  width: 8,
                  height: 8,
                  marginLeft: -4,
                  borderRadius: 4,
                  backgroundColor: reached ? '#5356EE' : unreachedDotColor,
                  borderWidth: 1.5,
                  borderColor: reached ? '#5356EE' : (isDark ? theme.panel : '#FFFFFF'),
                  zIndex: 2,
                }}
              />
            );
          })}
        </View>
      </Pressable>

      {/* Bundle Details Bottom Sheet Modal */}
      <BottomSheetModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        title="Bundle & Save"
        subtitle={`Buy multiple items from @${listing.seller.username} to unlock exclusive discounts.`}
        autoHeight={true}
      >
        <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
          {/* Tiers List */}
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.panel,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            {BUNDLE_TIERS.filter((t) => t.pct > 0).map((t, idx, arr) => {
              const active = itemCount >= t.count;
              const isCurrent = (t.count === 5 && itemCount >= 5) || itemCount === t.count;
              return (
                <React.Fragment key={t.count}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      backgroundColor: isCurrent ? (isDark ? 'rgba(83, 86, 238, 0.15)' : '#F2F3FE') : 'transparent',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: active ? '#5356EE' : (isDark ? '#374151' : '#E5E7EB'),
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active ? (
                          <Feather name="check" size={14} color="#FFFFFF" />
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.mute }}>
                            {t.count}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={{
                          fontSize: 14.5,
                          fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                          color: active ? theme.ink : theme.mute,
                        }}
                      >
                        {t.count === 5 ? '5 or more items' : `${t.count} items`}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        backgroundColor: active ? (isDark ? '#312E81' : '#EEF2FF') : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13.5,
                          fontFamily: typography.family.sansBold,
                          color: active ? '#5356EE' : theme.mute,
                        }}
                      >
                        {t.pct}% OFF
                      </Text>
                    </View>
                  </View>
                  {idx < arr.length - 1 && (
                    <View style={{ height: 1, backgroundColor: theme.hairline }} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* Got it action button */}
          <Pressable
            onPress={() => setInfoModalVisible(false)}
            style={({ pressed }) => ({
              height: 48,
              borderRadius: 14,
              backgroundColor: theme.ink,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 15,
                fontFamily: typography.family.sansBold,
                color: theme.background,
              }}
            >
              Got it
            </Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </>
  );
}
