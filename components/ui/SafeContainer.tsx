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
import { colors } from '@/lib/theme';

export type SafeEdge = 'top' | 'bottom' | 'left' | 'right';

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
  backgroundColor = colors.bg,
  className = '',
  style,
  contentContainerStyle,
  scrollViewProps,
}: SafeContainerProps) {
  const insets = useSafeAreaInsets();

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

  // View Mode
  if (mode === 'view') {
    return (
      <View
        className={className}
        style={[
          styles.fill,
          { backgroundColor },
          edgePadding,
          style,
        ]}
      >
        {children}
        {stickyFooter && (
          <View
            style={[
              styles.stickyFooter,
              {
                paddingBottom: edges.includes('bottom')
                  ? Math.max(insets.bottom, 12)
                  : 12,
              },
            ]}
          >
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
                ? Math.max(insets.bottom, 16) + (stickyFooter ? 80 : 0) + extraBottomPadding
                : (stickyFooter ? 80 : 0) + extraBottomPadding,
            },
            contentContainerStyle,
          ]}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>

        {stickyFooter && (
          <View
            style={[
              styles.stickyFooter,
              {
                paddingBottom: edges.includes('bottom')
                  ? Math.max(insets.bottom, 12)
                  : 12,
              },
            ]}
          >
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
                ? Math.max(insets.bottom, 16) + (stickyFooter ? 80 : 0) + extraBottomPadding
                : (stickyFooter ? 80 : 0) + extraBottomPadding,
            },
            contentContainerStyle,
          ]}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      )}


      {stickyFooter && (
        <View
          style={[
            styles.stickyFooter,
            {
              paddingBottom: edges.includes('bottom')
                ? Math.max(insets.bottom, 12)
                : 12,
            },
          ]}
        >
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
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
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
