import React from 'react';
import { type ViewStyle } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
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
        <G transform="translate(-5.4, -5.4) scale(1.45)">
          {/* Mercari shield — filled solid, scaled from 48x48 → 24x24 */}
          <Path
            d="M12.033 6.8s-2.93 1.424-5.833 1.424v.168c0 .838.044 1.634.154 2.367.33 2.47 1.233 4.398 2.729 6.01l.066.084c.594.628 1.255 1.131 1.937 1.529.198.125.925.419.925.419s.726-.293.925-.419c.704-.377 1.343-.9 1.937-1.529l.066-.084c1.035-1.11 1.783-2.387 2.245-3.874.22-.67.33-1.361.44-2.136.088-.733.176-1.529.176-2.367v-.168c-2.833 0-5.767-1.424-5.767-1.424z"
            fill={iconColor}
          />
          {/* Mercari checkmark — scaled from 48x48 → 24x24 */}
          <Path
            d="M9.4 12.013l1.932 1.787 3.668-3.4"
            stroke="#FFFFFF"
            strokeWidth={1.8 / 1.45}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    );
  }

  // Full-scale wireframe when standalone without background circle
  if (!showCircle && size >= 20) {
    const boldSw = strokeWidth ?? 2;
    return (
      <Svg width={w} height={h} viewBox="0 0 24 24" fill="none" style={style}>
        <G transform="translate(-5.4, -5.4) scale(1.45)">
          {/* Mercari shield outline — scaled from 48x48 → 24x24 */}
          <Path
            d="M12.033 6.8s-2.93 1.424-5.833 1.424v.168c0 .838.044 1.634.154 2.367.33 2.47 1.233 4.398 2.729 6.01l.066.084c.594.628 1.255 1.131 1.937 1.529.198.125.925.419.925.419s.726-.293.925-.419c.704-.377 1.343-.9 1.937-1.529l.066-.084c1.035-1.11 1.783-2.387 2.245-3.874.22-.67.33-1.361.44-2.136.088-.733.176-1.529.176-2.367v-.168c-2.833 0-5.767-1.424-5.767-1.424z"
            stroke={iconColor}
            strokeWidth={boldSw / 1.45}
            strokeLinejoin="round"
          />
          <Path
            d="M9.4 12.013l1.932 1.787 3.668-3.4"
            stroke={iconColor}
            strokeWidth={boldSw / 1.45}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    );
  }

  return (
    <Svg width={w} height={h} viewBox="0 0 24 24" fill="none" style={style}>
      {showCircle && <Circle cx={12} cy={12} r={12} fill={circleFill} />}
      <G transform="translate(-5.4, -5.4) scale(1.45)">
        {/* Mercari shield outline — scaled from 48x48 → 24x24 */}
        <Path
          d="M12.033 6.8s-2.93 1.424-5.833 1.424v.168c0 .838.044 1.634.154 2.367.33 2.47 1.233 4.398 2.729 6.01l.066.084c.594.628 1.255 1.131 1.937 1.529.198.125.925.419.925.419s.726-.293.925-.419c.704-.377 1.343-.9 1.937-1.529l.066-.084c1.035-1.11 1.783-2.387 2.245-3.874.22-.67.33-1.361.44-2.136.088-.733.176-1.529.176-2.367v-.168c-2.833 0-5.767-1.424-5.767-1.424z"
          stroke={iconColor}
          strokeWidth={sw / 1.45}
          strokeLinejoin="round"
        />
        {/* Mercari checkmark */}
        <Path
          d="M9.4 12.013l1.932 1.787 3.668-3.4"
          stroke={iconColor}
          strokeWidth={sw / 1.45}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}
