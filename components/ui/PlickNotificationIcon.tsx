import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

export interface PlickNotificationIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  style?: ViewStyle;
}

/**
 * Canonical Plick Notification / News Sheet Icon.
 *
 * Matches Reference Image 1:
 * - Rounded squircle container with smooth corners (rx=4.5)
 * - Three left-aligned horizontal content bars with rounded line caps
 * - Top bar is half-length (header / title line)
 * - Middle and bottom bars are full-length
 * - Centered optical balance in a standard 24x24 viewBox
 */
export const PLICK_NOTIFICATION_LINES_PATH = 'M8.5 8.25H12.25 M8.5 12H15.5 M8.5 15.75H15.5';

export function PlickNotificationIcon({
  size = 20,
  width,
  height,
  color,
  strokeWidth = 2.2,
  style,
}: PlickNotificationIconProps) {
  const { theme } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const strokeColor = color ?? theme.ink;

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg
        width={w}
        height={h}
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Rect
          x="4.25"
          y="3.5"
          width="15.5"
          height="17"
          rx="4.5"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d={PLICK_NOTIFICATION_LINES_PATH}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// Alias for semantic clarity across feeds and headers
export const PlickNewsIcon = PlickNotificationIcon;
