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
  const sw = strokeWidth ?? (size < 16 ? 1.35 : (size < 20 ? 1.2 : 1));

  return (
    <View style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={12} fill={circleFill} />
        {/* Shield outline */}
        <Path
          d="M12.033 6.80005C12.033 6.80005 9.1033 8.22413 6.2 8.22413V8.39167C6.2 9.22937 6.24402 10.0252 6.35408 10.7582C6.68425 13.2294 7.58671 15.1561 9.08349 16.7686C9.1055 16.7896 9.12751 16.8315 9.14952 16.8524C9.74383 17.4807 10.4042 17.9833 11.0865 18.3812C11.2846 18.5069 12.011 18.8 12.011 18.8C12.011 18.8 12.7374 18.5069 12.9355 18.3812C13.6398 18.0042 14.2782 17.4807 14.8725 16.8524L14.9385 16.7686C15.9731 15.6587 16.7214 14.3812 17.1837 12.8943C17.4038 12.2241 17.5138 11.533 17.6239 10.7582C17.712 10.0252 17.8 9.22937 17.8 8.39167V8.22413C14.9671 8.22413 12.033 6.80005 12.033 6.80005Z"
          stroke={iconColor}
          strokeWidth={sw}
        />
        {/* Checkmark */}
        <Path
          d="M9.39999 12.0127L11.332 13.8001L15 10.4001"
          stroke={iconColor}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
