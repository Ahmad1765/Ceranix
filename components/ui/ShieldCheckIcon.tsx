import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

interface ShieldCheckIconProps {
  size?: number;
  width?: number;
  height?: number;
  bgColor?: string;
  strokeColor?: string;
  style?: ViewStyle;
}

export function ShieldCheckIcon({
  size = 24,
  width,
  height,
  bgColor,
  strokeColor,
  style,
}: ShieldCheckIconProps) {
  const w = width ?? size;
  const h = height ?? size;

  // High-visibility emerald green shield with crisp white checkmark
  const fill = bgColor ?? '#10B981';
  const stroke = strokeColor ?? '#FFFFFF';

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={w} height={h} viewBox="0 0 20 20" fill="none">
        {/* Solid high-visibility security shield */}
        <Path
          d="M10 1.5L3.5 3.8C3.5 3.8 3.5 9 3.5 10.5C3.5 14.8 6.5 17.8 10 18.8C13.5 17.8 16.5 14.8 16.5 10.5C16.5 9 16.5 3.8 16.5 3.8L10 1.5Z"
          fill={fill}
        />
        {/* Bold crisp white verified checkmark */}
        <Path
          d="M6.8 10.2L8.8 12.2L13.2 7.8"
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
