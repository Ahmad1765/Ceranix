import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';

export interface ShieldCheckIconProps {
  size?: number;
  width?: number;
  height?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  bgColor?: string;
  style?: ViewStyle;
}

export function ShieldCheckIcon({
  size = 14,
  width,
  height,
  color,
  strokeColor,
  strokeWidth,
  bgColor,
  style,
}: ShieldCheckIconProps) {
  const { isDark } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const iconColor = color ?? strokeColor ?? (isDark ? '#7C7FFA' : '#5356EE');
  const circleFill = bgColor ?? (isDark ? 'rgba(83, 86, 238, 0.22)' : '#F2F3FE');
  const sw = strokeWidth ?? (size < 16 ? 1.4 : 1.35);
  const showCircle = circleFill !== 'transparent';

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
        {showCircle && <Circle cx={12} cy={12} r={12} fill={circleFill} />}
        {/* Symmetrical luxury shield outline */}
        <Path
          d="M12 6.6C10 6.7 7.5 7.4 6.2 8V10.4C6.2 14.8 8.8 17.3 12 18.6C15.2 17.3 17.8 14.8 17.8 10.4V8C16.5 7.4 14 6.7 12 6.6Z"
          stroke={iconColor}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
        {/* Optically centered 45° checkmark */}
        <Path
          d="M9.3 11.7L11.3 13.7L15.1 9.9"
          stroke={iconColor}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
