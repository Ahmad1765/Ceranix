import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

export interface ShieldCheckIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  strokeColor?: string;
  bgColor?: string;
  style?: ViewStyle;
}

export function ShieldCheckIcon({
  size = 14,
  width,
  height,
  color,
  strokeColor,
  bgColor,
  style,
}: ShieldCheckIconProps) {
  const { theme } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const iconColor = color ?? strokeColor ?? theme.purple ?? '#6C47FF';

  const iconSvg = (
    <Svg width={w} height={h} viewBox="0 0 12 12" fill="none">
      {/* Checkmark */}
      <Path
        fill={iconColor}
        d="m7.924 4.114.708.707-2.829 2.828-2.121-2.121.707-.707 1.414 1.414z"
      />
      {/* Shield outline */}
      <Path
        fill={iconColor}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 6c0 4.2-5 6-5 6s-5-1.8-5-6V1.8L6 0l5 1.8zM2 6V2.503l4-1.44 4 1.44V6c0 1.66-.98 2.902-2.115 3.787A9.4 9.4 0 0 1 6 10.917a9.368 9.368 0 0 1-1.885-1.13C2.981 8.902 2 7.66 2 6m3.66 5.06"
      />
    </Svg>
  );

  if (bgColor) {
    return (
      <View
        style={[
          {
            width: w,
            height: h,
            borderRadius: w / 2,
            backgroundColor: bgColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        {iconSvg}
      </View>
    );
  }

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      {iconSvg}
    </View>
  );
}
