import React from 'react';
import { type ViewStyle } from 'react-native';
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
  variant?: 'outline' | 'solid';
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
  variant = 'outline',
  style,
}: ShieldCheckIconProps) {
  const { theme, isDark } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const iconColor = color ?? strokeColor ?? (variant === 'solid' ? theme.purple : (isDark ? '#7C7FFA' : '#5356EE'));
  const circleFill = bgColor ?? (isDark ? 'rgba(83, 86, 238, 0.22)' : '#F2F3FE');
  const sw = strokeWidth ?? (size < 16 ? 1.4 : 1.35);
  const showCircle = circleFill !== 'transparent';

  if (variant === 'solid') {
    return (
      <Svg width={w} height={h} viewBox="0 0 24 24" fill="none" style={style}>
        {showCircle && <Circle cx={12} cy={12} r={12} fill={circleFill} />}
        {/* Solid brand shield with crisp white checkmark */}
        <Path
          d="M12 2.5C8 2.5 4.5 4.2 4.5 10C4.5 15.8 8.5 19.6 12 21.2C15.5 19.6 19.5 15.8 19.5 10C19.5 4.2 16 2.5 12 2.5Z"
          fill={iconColor}
        />
        <Path
          d="M8.5 11.8L10.8 14.1L15.8 9.1"
          stroke="#FFFFFF"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  // Full-scale wireframe when standalone without background circle
  if (!showCircle && size >= 20) {
    const boldSw = strokeWidth ?? 2;
    return (
      <Svg width={w} height={h} viewBox="0 0 24 24" fill="none" style={style}>
        <Path
          d="M12 3C7.5 3 4.5 4.8 4.5 10.2C4.5 15.8 8.5 19.5 12 21C15.5 19.5 19.5 15.8 19.5 10.2C19.5 4.8 16.5 3 12 3Z"
          stroke={iconColor}
          strokeWidth={boldSw}
          strokeLinejoin="round"
        />
        <Path
          d="M8.5 11.5L10.8 13.8L15.8 8.8"
          stroke={iconColor}
          strokeWidth={boldSw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={w} height={h} viewBox="0 0 24 24" fill="none" style={style}>
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
  );
}
