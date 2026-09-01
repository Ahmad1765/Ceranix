import React from 'react';
import { View } from 'react-native';
import Svg, {
  Path,
  Rect,
  Circle,
  Ellipse,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  G,
} from 'react-native-svg';

interface BinocularsIconProps {
  width?: number;
  height?: number;
}

export function BinocularsIcon({ width = 48, height = 40 }: BinocularsIconProps) {
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={width} height={height} viewBox="0 0 64 54" fill="none">
        <Defs>
          {/* Barrel Body Gradient */}
          <LinearGradient id="barrelGradLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#1E4D3E" />
            <Stop offset="40%" stopColor="#11382C" />
            <Stop offset="100%" stopColor="#0B241C" />
          </LinearGradient>
          <LinearGradient id="barrelGradRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#1E4D3E" />
            <Stop offset="40%" stopColor="#11382C" />
            <Stop offset="100%" stopColor="#0B241C" />
          </LinearGradient>

          {/* Lens Gold Rim Gradient */}
          <LinearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FEF08A" />
            <Stop offset="50%" stopColor="#EAB308" />
            <Stop offset="100%" stopColor="#CA8A04" />
          </LinearGradient>

          {/* Lens Glass Gradient */}
          <RadialGradient id="lensGlass" cx="40%" cy="40%" r="60%">
            <Stop offset="0%" stopColor="#1E293B" />
            <Stop offset="70%" stopColor="#0F172A" />
            <Stop offset="100%" stopColor="#020617" />
          </RadialGradient>

          {/* Glint Gradient */}
          <LinearGradient id="glint" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Soft Drop Shadow under binoculars */}
        <Ellipse cx="32" cy="48" rx="26" ry="4" fill="#000000" fillOpacity="0.12" />

        {/* Central Bridge / Hinge */}
        <Rect x="26" y="16" width="12" height="7" rx="3.5" fill="#0B241C" />
        <Rect x="28" y="24" width="8" height="5" rx="2" fill="#11382C" />

        {/* Center Focus Wheel (Gold / Amber Accent) */}
        <Rect x="29" y="10" width="6" height="8" rx="2" fill="url(#goldRim)" />
        {/* Ridges on focus wheel */}
        <Path d="M29 13H35M29 15H35" stroke="#78350F" strokeWidth="1" strokeLinecap="round" />

        {/* Left Barrel */}
        <G>
          {/* Eyepiece / Top tube */}
          <Rect x="14" y="6" width="10" height="8" rx="3" fill="#0F2E24" />
          <Rect x="13" y="4" width="12" height="4" rx="2" fill="#081E17" />

          {/* Main Cone/Prism Housing */}
          <Path
            d="M12 12C12 12 7 20 7 30C7 36 10 40 18 40C26 40 28 36 28 30C28 20 24 12 24 12H12Z"
            fill="url(#barrelGradLeft)"
          />

          {/* Grip Texture Ribs on Left */}
          <Path
            d="M10 24C10 24 13 25 18 25C23 25 25 24 25 24"
            stroke="#235D4B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <Path
            d="M10 28C10 28 13 29 18 29C23 29 25 28 25 28"
            stroke="#235D4B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Left Objective Lens Outer Ring */}
          <Circle cx="18" cy="36" r="10" fill="url(#barrelGradLeft)" stroke="#081E17" strokeWidth="1.5" />
          {/* Golden Rim */}
          <Circle cx="18" cy="36" r="8" fill="none" stroke="url(#goldRim)" strokeWidth="1.8" />
          {/* Dark Glass Lens */}
          <Circle cx="18" cy="36" r="6.5" fill="url(#lensGlass)" />
          {/* Lens Glint Reflection */}
          <Ellipse cx="16" cy="34" rx="3" ry="1.8" fill="url(#glint)" transform="rotate(-30 16 34)" />
        </G>

        {/* Right Barrel */}
        <G>
          {/* Eyepiece / Top tube */}
          <Rect x="40" y="6" width="10" height="8" rx="3" fill="#0F2E24" />
          <Rect x="39" y="4" width="12" height="4" rx="2" fill="#081E17" />

          {/* Main Cone/Prism Housing */}
          <Path
            d="M40 12C40 12 36 20 36 30C36 36 38 40 46 40C54 40 57 36 57 30C57 20 52 12 52 12H40Z"
            fill="url(#barrelGradRight)"
          />

          {/* Grip Texture Ribs on Right */}
          <Path
            d="M39 24C39 24 42 25 46 25C51 25 54 24 54 24"
            stroke="#235D4B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <Path
            d="M39 28C39 28 42 29 46 29C51 29 54 28 54 28"
            stroke="#235D4B"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Right Objective Lens Outer Ring */}
          <Circle cx="46" cy="36" r="10" fill="url(#barrelGradRight)" stroke="#081E17" strokeWidth="1.5" />
          {/* Golden Rim */}
          <Circle cx="46" cy="36" r="8" fill="none" stroke="url(#goldRim)" strokeWidth="1.8" />
          {/* Dark Glass Lens */}
          <Circle cx="46" cy="36" r="6.5" fill="url(#lensGlass)" />
          {/* Lens Glint Reflection */}
          <Ellipse cx="44" cy="34" rx="3" ry="1.8" fill="url(#glint)" transform="rotate(-30 44 34)" />
        </G>
      </Svg>
    </View>
  );
}
