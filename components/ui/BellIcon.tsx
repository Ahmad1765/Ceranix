import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

export interface BellIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  style?: ViewStyle;
  filled?: boolean;
  strokeWidth?: number;
}

/**
 * Bold Notification Bell Icon matching Reference Image 2.
 * Smooth rounded dome (no top pin), flared rim, and rounded clapper.
 */
export const BELL_OUTLINE_PATH =
  'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0';

export const BELL_FILLED_PATH =
  'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z M13.73 21a2 2 0 0 1-3.46 0z';

export function BellIcon({
  size = 20,
  width,
  height,
  color,
  style,
  filled = false,
  strokeWidth = 2.4,
}: BellIconProps) {
  const { theme } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const iconColor = color ?? theme.ink;

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
        <Path
          d={filled ? BELL_FILLED_PATH : BELL_OUTLINE_PATH}
          fill={filled ? iconColor : 'none'}
          stroke={iconColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fillRule={filled ? 'nonzero' : 'evenodd'}
          clipRule={filled ? 'nonzero' : 'evenodd'}
        />
      </Svg>
    </View>
  );
}

