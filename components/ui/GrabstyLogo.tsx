import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Text } from '@/lib/rnText';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';
import { BRAND } from '@/lib/brand';

export interface GrabstyLogoProps {
  size?: number;
  variant?: 'mark' | 'full';
  markBg?: string;
  markColor?: string;
  textColor?: string;
  style?: ViewStyle;
}

/**
 * Grabsty Brand Logo Component
 * - 'mark': Iconic rounded square with geometric "G" monogram
 * - 'full': Monogram badge + bold typographic wordmark
 */
export function GrabstyLogo({
  size = 28,
  variant = 'mark',
  markBg = '#6C47FF',
  markColor = '#FFFFFF',
  textColor,
  style,
}: GrabstyLogoProps) {
  const { theme } = useTheme();
  const resolvedTextColor = textColor ?? theme.ink;

  const mark = (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityLabel={BRAND}
    >
      {markBg !== 'transparent' && (
        <Rect width="24" height="24" rx="6" fill={markBg} />
      )}
      <Path
        d="M 17.6 7.4 C 16.1 5.3 13.8 4.2 11.6 4.2 C 7.4 4.2 4.2 7.6 4.2 12 C 4.2 16.4 7.4 19.8 11.6 19.8 C 15.3 19.8 18.2 17.2 18.6 13.5 L 11.6 13.5 L 11.6 10.5 L 21.6 10.5 L 21.6 13.6 C 21.1 18.8 16.9 22.8 11.6 22.8 C 5.8 22.8 1.2 18 1.2 12 C 1.2 6 5.8 1.2 11.6 1.2 C 14.8 1.2 17.8 2.8 19.8 5.6 L 17.6 7.4 Z"
        fill={markColor}
      />
    </Svg>
  );

  if (variant === 'mark') {
    return <View style={style}>{mark}</View>;
  }

  const fontSize = Math.round(size * 0.72);

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Math.round(size * 0.32) }, style]}>
      {mark}
      <Text
        style={{
          fontFamily: typography.family.sansBold,
          fontSize,
          fontWeight: '900',
          color: resolvedTextColor,
          letterSpacing: -0.6,
        }}
      >
        {BRAND}
      </Text>
    </View>
  );
}
