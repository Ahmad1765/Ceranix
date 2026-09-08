import { memo } from 'react';
import { View, Pressable, Animated, Platform } from 'react-native';
import { Text } from '@/lib/rnText';
import * as Haptics from 'expo-haptics';
import { radii, type as typography } from '@/lib/theme';
import { useTheme } from '@/context/ThemeContext';

export type NewsTab = 'following' | 'for_you' | 'searches';

export const NEWS_TABS: { value: NewsTab; label: string }[] = [
  { value: 'following', label: 'Following' },
  { value: 'for_you', label: 'For you' },
  { value: 'searches', label: 'Searches' },
];

const TAB_COUNT = NEWS_TABS.length;
const UNDERLINE_WIDTH_RATIO = 0.45;

function haptic() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

function TabBadge({ count }: { count: number }) {
  const { theme } = useTheme();
  if (count <= 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '100%',
        bottom: '55%',
        marginLeft: 4,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        borderRadius: 8,
        backgroundColor: theme.purple,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize: 10,
          lineHeight: 12,
          color: '#FFFFFF',
        }}
      >
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

type NewsUnderlineTabsProps = {
  value: NewsTab;
  onChange: (v: NewsTab) => void;
  scrollX: Animated.Value;
  pageWidth: number;
  badges?: Partial<Record<NewsTab, number>>;
};

export const NewsUnderlineTabs = memo(function NewsUnderlineTabs({
  value,
  onChange,
  scrollX,
  pageWidth,
  badges,
}: NewsUnderlineTabsProps) {
  const { theme } = useTheme();
  const tabWidth = pageWidth > 0 ? pageWidth / TAB_COUNT : 120;
  const underlineWidth = tabWidth * UNDERLINE_WIDTH_RATIO;
  const underlineOffset = (tabWidth - underlineWidth) / 2;

  const translateX = scrollX.interpolate({
    inputRange: NEWS_TABS.map((_, i) => i * (pageWidth > 0 ? pageWidth : 1)),
    outputRange: NEWS_TABS.map((_, i) => i * tabWidth + underlineOffset),
    extrapolate: 'clamp',
  });

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.hairline,
        backgroundColor: theme.background,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {NEWS_TABS.map((t) => {
          const active = t.value === value;
          const count = badges?.[t.value] ?? 0;
          return (
            <Pressable
              key={t.value}
              onPress={() => {
                haptic();
                onChange(t.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={count > 0 ? `${t.label}, ${count} new` : t.label}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 14,
              }}
            >
              <View style={{ position: 'relative' }}>
                <Text
                  style={{
                    fontFamily: active ? typography.family.sansBold : typography.family.sansMedium,
                    fontSize: 15,
                    color: active ? theme.ink : theme.muteSoft,
                    letterSpacing: -0.1,
                  }}
                >
                  {t.label}
                </Text>
                <TabBadge count={count} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {pageWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -1,
            left: 0,
            height: 2.5,
            width: underlineWidth,
            backgroundColor: theme.ink,
            borderRadius: radii.pill,
            transform: [{ translateX }],
          }}
        />
      )}
    </View>
  );
});
