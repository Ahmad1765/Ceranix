import React from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

export type SafeEdge = 'top' | 'bottom' | 'left' | 'right';

/** Fixed content clearance reserved above the sticky footer across all modes. */
const STICKY_FOOTER_CLEARANCE = 80;

export interface SafeContainerProps {
  children: React.ReactNode;
  /** Edges to apply safe area padding. Defaults to ['top', 'bottom', 'left', 'right'] */
  edges?: SafeEdge[];
  /** Container layout mode: standard View, ScrollView, or KeyboardAvoiding */
  mode?: 'view' | 'scroll' | 'keyboard-avoiding';
  /** If true in keyboard-avoiding mode, disables the inner ScrollView wrapper (useful for FlatList/FlashList) */
  noScroll?: boolean;
  /** Optional sticky footer element locked into the bottom thumb zone */
  stickyFooter?: React.ReactNode;
  /** Extra bottom clearance (useful when sticky bars or floating tabs are present) */
  extraBottomPadding?: number;
  /** Background color override */
  backgroundColor?: string;
  /** NativeWind / Tailwind className */
  className?: string;
  /** Custom container style */
  style?: ViewStyle;
  /** Custom scrollview content container style (when mode='scroll') */
  contentContainerStyle?: ViewStyle;
  /** ScrollView props pass-through (when mode='scroll') */
  scrollViewProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>;
}

/**
 * Mobile-native SafeContainer.
 * Handles top notch, Dynamic Island, status bar, and bottom home indicator
 * dynamically using react-native-safe-area-context.
 */
export function SafeContainer({
  children,
  edges = ['top', 'bottom', 'left', 'right'],
  mode = 'view',
  noScroll = false,
  stickyFooter,
  extraBottomPadding = 0,
  backgroundColor: bgOverride,
  className = '',
  style,
  contentContainerStyle,
  scrollViewProps,
}: SafeContainerProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const backgroundColor = bgOverride ?? theme.background;

  const edgePadding = React.useMemo(() => {
    return {
      paddingTop: edges.includes('top') ? insets.top : 0,
      paddingBottom: edges.includes('bottom')
        ? Math.max(insets.bottom, 12) + extraBottomPadding
        : extraBottomPadding,
      paddingLeft: edges.includes('left') ? insets.left : 0,
      paddingRight: edges.includes('right') ? insets.right : 0,
    };
  }, [edges, insets, extraBottomPadding]);

  const stickyFooterStyle = [
    styles.stickyFooter,
    {
      backgroundColor: theme.surface,
      borderTopColor: theme.hairline,
      paddingBottom: edges.includes('bottom')
        ? Math.max(insets.bottom, 12)
        : 12,
    },
  ];

  // View Mode
  if (mode === 'view') {
    return (
      <View
        className={className}
        style={[
          styles.fill,
          {
            backgroundColor,
            paddingTop: edgePadding.paddingTop,
            paddingLeft: edgePadding.paddingLeft,
            paddingRight: edgePadding.paddingRight,
            paddingBottom: edgePadding.paddingBottom,
          },
          style,
        ]}
      >
        {stickyFooter ? (
          <View style={[styles.fill, { paddingBottom: STICKY_FOOTER_CLEARANCE }]}>
            {children}
          </View>
        ) : (
          children
        )}
        {stickyFooter && (
          <View style={[stickyFooterStyle, { paddingBottom: 12 }]}>
            {stickyFooter}
          </View>
        )}
      </View>
    );
  }

  // Scroll Mode
  if (mode === 'scroll') {
    return (
      <View
        className={className}
        style={[
          styles.fill,
          {
            backgroundColor,
            paddingTop: edgePadding.paddingTop,
            paddingLeft: edgePadding.paddingLeft,
            paddingRight: edgePadding.paddingRight,
          },
          style,
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            {
              paddingBottom: edges.includes('bottom')
                ? Math.max(insets.bottom, 16) + (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding
                : (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding,
            },
            contentContainerStyle,
          ]}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>

        {stickyFooter && (
          <View style={stickyFooterStyle}>
            {stickyFooter}
          </View>
        )}
      </View>
    );
  }

  // Keyboard Avoiding Mode (for forms, chat threads, authentication, checkout flows)
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      className={className}
      style={[
        styles.fill,
        {
          backgroundColor,
          paddingTop: edgePadding.paddingTop,
          paddingLeft: edgePadding.paddingLeft,
          paddingRight: edgePadding.paddingRight,
        },
        style,
      ]}
    >
      {noScroll ? (
        children
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.grow,
            {
              paddingBottom: edges.includes('bottom')
                ? Math.max(insets.bottom, 16) + (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding
                : (stickyFooter ? STICKY_FOOTER_CLEARANCE : 0) + extraBottomPadding,
            },
            contentContainerStyle,
          ]}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      )}


      {stickyFooter && (
        <View style={stickyFooterStyle}>
          {stickyFooter}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      default: {
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
      },
    }),
  },
});
