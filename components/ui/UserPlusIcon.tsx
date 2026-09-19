import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

export interface UserPlusIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  style?: ViewStyle;
}

/**
 * Clean, visually appealing Add / Find Friend icon.
 * Features an elegant user portrait geometry with an offset plus (+) badge.
 * Rendered with round linecaps and joins in canonical 24x24 viewBox.
 */
export function UserPlusIcon({
  size = 18,
  width,
  height,
  color,
  strokeWidth = 1.85,
  style,
}: UserPlusIconProps) {
  const { theme } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const stroke = color ?? theme.ink;

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
        {/* User head */}
        <Circle
          cx="9"
          cy="7"
          r="4"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* User body silhouette */}
        <Path
          d="M2 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Plus sign */}
        <Path
          d="M19 8v6M16 11h6"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
